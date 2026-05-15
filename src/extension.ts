import type Gio from "gi://Gio";
import type Meta from "gi://Meta";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import Shell from "gi://Shell";
import { NotificationApplicationPolicy } from "resource:///org/gnome/shell/ui/messageTray.js";

declare const global: Shell.Global;

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

function getObjectLabel(name: string, values: Record<string, string | null>) {
  const labels = Object.entries(values)
    .filter((entry): entry is [string, string] => entry[1] != null)
    .map(([label, value]) => `${label}: '${value}'`);
  return `${name}(${labels.join(", ")})`;
}

function getWindowLabel(window: Meta.Window, app?: Shell.App | null) {
  return getObjectLabel("Window", {
    Title: window.title,
    AppId: app?.id ?? null,
  });
}

function getSourceLabel(source: { title: string; policy: unknown }) {
  return getObjectLabel("Source", {
    Title: source.title,
    PolicyId:
      source.policy instanceof NotificationApplicationPolicy
        ? source.policy.id
        : null,
  });
}

// Fallback for generic-policy sources (libnotify clients that don't send a
// desktop-entry hint, e.g. Slack channel messages): match by source.title
// against the app's display name. Clients are free to set source.title to
// anything, so this is a heuristic and may yield false positives for apps
// whose notifications carry per-conversation titles.
function sourceMatchesApp(
  source: { title: string; policy: unknown },
  appId: string,
  appName: string,
) {
  if (source.policy instanceof NotificationApplicationPolicy) {
    return source.policy.id === appId;
  } else {
    return Boolean(appName) && source.title === appName;
  }
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;
  private windowTracker = Shell.WindowTracker.get_default();

  private log(level: LogLevel, message: string) {
    let minLevel = this.settings?.get_string("log-level") as LogLevel | null;
    minLevel ??= LogLevel.INFO;
    const levels = Object.values(LogLevel);
    if (!levels.includes(minLevel)) minLevel = LogLevel.INFO;
    if (levels.indexOf(level) >= levels.indexOf(minLevel)) {
      log(`[${this.metadata.uuid}][${level}] ${message}`);
    }
  }

  private clearNotificationsForApp(
    window: Meta.Window,
    event: "focus" | "close",
  ) {
    const app = this.windowTracker.get_window_app(window) as Shell.App | null;
    const windowLabel = getWindowLabel(window, app);
    this.log(LogLevel.DEBUG, `${windowLabel}: received ${event}`);

    const settings = this.settings;
    if (!settings) {
      this.log(LogLevel.ERROR, `${windowLabel}: settings not initialized`);
      return;
    }

    if (!app) {
      this.log(LogLevel.DEBUG, `${windowLabel}: no app associated with window`);
      return;
    }

    // WindowTracker returns the desktop file id (e.g. "com.foo.desktop"),
    // but NotificationApplicationPolicy.id strips the ".desktop" suffix.
    const appId = app.id.replace(/\.desktop$/, "");

    const excludedApps = settings.get_strv("excluded-apps");
    if (excludedApps.includes(appId)) {
      this.log(LogLevel.DEBUG, `${windowLabel}: excluded by app id '${appId}'`);
      return;
    }

    const appName = app.get_name();
    for (const source of Main.messageTray.getSources()) {
      const sourceLabel = getSourceLabel(source);
      for (const notification of [...source.notifications]) {
        const label = `${windowLabel}: ${sourceLabel}`;
        const title = notification.title ?? "(untitled notification)";
        const kind = notification.isTransient ? "transient" : "persistent";
        this.log(
          LogLevel.DEBUG,
          `${label}: found ${kind} notification: ${title}`,
        );
        if (notification.isTransient) continue;
        if (sourceMatchesApp(source, appId, appName)) {
          notification.destroy();
          this.log(LogLevel.INFO, `${label}: removed notification: ${title}`);
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
