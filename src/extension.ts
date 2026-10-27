import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import type { Notification, Source } from "@girs/gnome-shell/ui/messageTray";

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
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([label, value]) => `${label}: '${value}'`);
  return `${name}(${labels.join(", ")})`;
}

function getWindowLabel(window: Meta.Window, app: Shell.App | null) {
  return getObjectLabel("Window", {
    Title: window.title,
    AppId: app?.id ?? null,
    AppName: app?.get_name() ?? null,
  });
}

function getSourceLabel(source: MatchSource) {
  return getObjectLabel("Source", {
    AppId: source.app?.id ?? null,
    Title: source.title,
    PolicyId:
      source.policy instanceof NotificationApplicationPolicy
        ? source.policy.id
        : null,
  });
}

function getNotificationKind({ isTransient, resident }: Notification) {
  if (isTransient) return "transient";
  if (resident) return "resident";
  return "persistent";
}

type MatchSource = Source & {
  // Set on FdoNotificationDaemonSource only; untyped in @girs.
  app?: Shell.App | null;
};

export default class JunkNotificationCleaner extends Extension {
  private settings: Gio.Settings | null = null;
  private windowTracker = Shell.WindowTracker.get_default();
  private logger = this.getLogger();

  private log(level: LogLevel, message: string) {
    const minLevelIdx = this.settings?.get_enum("log-level") ?? 1;
    if (Object.values(LogLevel).indexOf(level) >= minLevelIdx) {
      this.logger[level](message);
    }
  }

  private clearNotificationsForApp(
    settings: Gio.Settings,
    window: Meta.Window,
    event: "focus" | "close",
  ) {
    const windowTracker = Shell.WindowTracker.get_default();
    // get_window_app returns NULL for untracked windows; GIR lacks (nullable).
    const app = windowTracker.get_window_app(window) as Shell.App | null;
    const windowLabel = getWindowLabel(window, app);
    this.log(LogLevel.DEBUG, `${windowLabel}: received ${event}`);

    if (!app) {
      this.log(LogLevel.DEBUG, `${windowLabel}: no app associated with window`);
      return;
    }

    // Policy ids omit the ".desktop" suffix.
    const appId = app.id.replace(/\.desktop$/, "");

    const excludedApps = settings.get_strv("excluded-apps");
    if (excludedApps.includes(appId)) {
      this.log(LogLevel.DEBUG, `${windowLabel}: excluded by app id '${appId}'`);
      return;
    }

    for (const source of Main.messageTray.getSources() as MatchSource[]) {
      const label = `${windowLabel}: ${getSourceLabel(source)}`;
      // Policy id may be the GTK app id (e.g. snaps); generic sources match by app.
      const matches =
        source.policy instanceof NotificationApplicationPolicy
          ? [appId, window.gtkApplicationId].includes(source.policy.id)
          : source.app?.id === app.id;
      for (const notification of [...source.notifications]) {
        const title = notification.title ?? "(untitled notification)";
        const kind = getNotificationKind(notification);
        this.log(
          LogLevel.DEBUG,
          `${label}: found ${kind} notification: ${title}`,
        );
        if (kind === "persistent" && matches) {
          notification.destroy();
          this.log(LogLevel.INFO, `${label}: removed notification: ${title}`);
        }
      }
    }
  }

  enable() {
    this.settings = this.getSettings();
    global.display.connectObject(
      "notify::focus-window",
      ({ focusWindow }: { focusWindow: Meta.Window | null }) => {
        if (this.settings?.get_boolean("delete-on-focus") && focusWindow) {
          this.clearNotificationsForApp(this.settings, focusWindow, "focus");
        }
      },
      this,
    );
    global.window_manager.connectObject(
      "destroy",
      (_: unknown, { metaWindow }: Meta.WindowActor) => {
        if (this.settings?.get_boolean("delete-on-close") && metaWindow) {
          this.clearNotificationsForApp(this.settings, metaWindow, "close");
        }
      },
      this,
    );
  }

  disable() {
    global.display.disconnectObject(this);
    global.window_manager.disconnectObject(this);
    this.settings = null;
  }
}
