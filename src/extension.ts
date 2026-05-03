import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import type { Source } from "resource:///org/gnome/shell/ui/messageTray.js";

import Shell from "gi://Shell";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

declare const global: Shell.Global;

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

// Sources for resolved apps carry a NotificationApplicationPolicy whose `id`
// is the canonical desktop id (without the .desktop suffix). Sources without
// a resolved app (e.g. raw notify-send) get a NotificationGenericPolicy and
// are intentionally not matched.
function getSourceAppId(source: Source): string | null {
  return source.policy instanceof MessageTray.NotificationApplicationPolicy
    ? source.policy.id
    : null;
}

// Strip ".desktop" so this matches policy.id from NotificationApplicationPolicy.
function getWindowAppId(app: Shell.App | null): string | null {
  return app?.get_id().replace(/\.desktop$/, "") ?? null;
}

function getObjectLabel(name: string, values: Record<string, string | null>) {
  const labels = Object.entries(values)
    .filter((entry): entry is [string, string] => entry[1] != null)
    .map(([label, value]) => `${label}: '${value}'`);
  return `${name}(${labels.join(", ")})`;
}

function safeRegexTest(pattern: string, value: string | null): boolean | null {
  if (value === null) return false;
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return null;
  }
}

function getWindowLabel(window: Meta.Window, app: Shell.App | null) {
  return getObjectLabel("Window", {
    Title: window.title,
    WMClass: window.wmClass,
    AppId: getWindowAppId(app),
  });
}

function getSourceLabel(source: Source) {
  return getObjectLabel("Source", {
    Title: source.title,
    AppId: getSourceAppId(source),
  });
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;
  private tracker: Shell.WindowTracker = Shell.WindowTracker.get_default();

  private log(level: LogLevel, message: string) {
    const levels = Object.values(LogLevel);
    const pref = this.settings?.get_string("log-level") as LogLevel | null;
    const minLevel = pref && levels.includes(pref) ? pref : LogLevel.INFO;
    if (levels.indexOf(level) >= levels.indexOf(minLevel)) {
      log(`[${this.metadata.uuid}][${level}] ${message}`);
    }
  }

  private clearNotificationsForApp(
    window: Meta.Window,
    event: "focus" | "close",
  ) {
    // gir types claim get_window_app is non-null, but at runtime it can be null
    // for windows the shell hasn't matched to a .desktop entry.
    const windowApp = this.tracker.get_window_app(window) as Shell.App | null;
    const windowAppId = getWindowAppId(windowApp);
    const windowLabel = getWindowLabel(window, windowApp);
    this.log(LogLevel.DEBUG, `${windowLabel}: received ${event}`);

    const settings = this.settings;
    if (!settings) {
      this.log(LogLevel.ERROR, `${windowLabel}: settings not initialized`);
      return;
    }

    const excludedApps = settings.get_strv("excluded-apps");
    for (const pattern of excludedApps) {
      const result = safeRegexTest(pattern, window.wmClass);
      if (result === null) {
        this.log(LogLevel.WARN, `${windowLabel}: invalid regex '${pattern}'`);
      } else if (result) {
        this.log(LogLevel.DEBUG, `${windowLabel}: excluded by '${pattern}'`);
        return;
      }
    }

    if (windowAppId === null) {
      this.log(LogLevel.DEBUG, `${windowLabel}: no app id, skipping`);
      return;
    }

    for (const source of Main.messageTray.getSources()) {
      const sourceLabel = getSourceLabel(source);
      for (const notification of [...source.notifications]) {
        const titleSuffix = notification.title ? `: ${notification.title}` : "";
        const kind = notification.isTransient ? "transient" : "persistent";
        this.log(
          LogLevel.DEBUG,
          `${windowLabel}: ${sourceLabel}: found ${kind} notification${titleSuffix}`,
        );
        if (
          getSourceAppId(source) === windowAppId &&
          !notification.isTransient
        ) {
          notification.destroy();
          this.log(
            LogLevel.INFO,
            `${windowLabel}: ${sourceLabel}: removed notification${titleSuffix}`,
          );
        }
      }
    }
  }

  enable() {
    this.settings = this.getSettings();
    this.focusListenerId = global.display.connect(
      "notify::focus-window",
      ({ focusWindow }: { focusWindow: Meta.Window | null }) => {
        if (this.settings?.get_boolean("delete-on-focus") && focusWindow) {
          this.clearNotificationsForApp(focusWindow, "focus");
        }
      },
    );
    this.closeListenerId = global.window_manager.connect(
      "destroy",
      (_: unknown, { metaWindow }: Meta.WindowActor) => {
        if (this.settings?.get_boolean("delete-on-close") && metaWindow) {
          this.clearNotificationsForApp(metaWindow, "close");
        }
      },
    );
  }

  disable() {
    this.settings = null;
    if (this.focusListenerId !== null) {
      global.display.disconnect(this.focusListenerId);
      this.focusListenerId = null;
    }
    if (this.closeListenerId !== null) {
      global.window_manager.disconnect(this.closeListenerId);
      this.closeListenerId = null;
    }
  }
}
