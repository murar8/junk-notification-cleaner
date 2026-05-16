import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import type { Source } from "@girs/gnome-shell/ui/messageTray";

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

type MatchSource = Omit<Source, "icon"> & { icon: Source["icon"] | null };
type MatchWindow = Omit<Meta.Window, "title"> & { title: string | null };

// libnotify clients without a desktop-entry hint set source.icon to an
// app-identifying string. Compare it against window-side identifiers.
function matchByIcon(icon: string, window: MatchWindow) {
  return (
    // Ghostty deb: icon matches GTK app id (com.mitchellh.ghostty)
    icon === window.gtkApplicationId ||
    // Slack Flatpak: icon matches sandboxed app id (com.slack.Slack)
    icon === window.get_sandboxed_app_id() ||
    // Firefox deb: icon matches window manager class (firefox)
    icon === window.wmClass
  );
}

// Snap apps expose icon paths like /snap/firefox/6638/default256.png; their
// sandboxed ids often duplicate the snap name (firefox_firefox).
function matchBySnapIcon(icon: string, window: MatchWindow) {
  const snap = /^\/snap\/([^/]+)\//.exec(icon)?.[1];
  if (!snap) return false;
  return window.get_sandboxed_app_id() === `${snap}_${snap}`;
}

function matchByTitle(title: string, window: MatchWindow) {
  return (
    // Proton Mail Bridge: title matches window title
    title === window.title ||
    // Extract app name from composite title (foo.ts - project - Cursor)
    title === window.title?.match(/^.+ (-|\|) (.+)$/)?.[2] ||
    // Thunderbird: title matches window manager class (thunderbird)
    title === window.wmClass ||
    // Discord snap: title duplicated matches sandboxed app id (discord_discord)
    `${title}_${title}` === window.get_sandboxed_app_id()
  );
}

// Prefer authoritative identifiers (policy id, source icon) when present.
// If an icon is set, do not fall back to title matching; title is a
// last-ditch heuristic reserved for sources that expose neither.
function sourceMatchesApp(
  source: MatchSource,
  window: MatchWindow,
  appId: string,
) {
  if (source.policy instanceof NotificationApplicationPolicy) {
    return source.policy.id === appId;
  }
  const icon = source.icon?.to_string();
  if (icon) return matchByIcon(icon, window) || matchBySnapIcon(icon, window);
  if (source.title) return matchByTitle(source.title, window);
  return false;
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

    // Shell.App.id is the desktop filename (e.g. "org.gnome.Nautilus.desktop");
    // NotificationApplicationPolicy.id stores the same id without the
    // ".desktop" suffix, so normalize before comparison.
    const appId = app.id.replace(/\.desktop$/, "");

    const excludedApps = settings.get_strv("excluded-apps");
    if (excludedApps.includes(appId)) {
      this.log(LogLevel.DEBUG, `${windowLabel}: excluded by app id '${appId}'`);
      return;
    }

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
        if (sourceMatchesApp(source, window, appId)) {
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
