import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import type { Source } from "resource:///org/gnome/shell/ui/messageTray.js";
import type Shell from "gi://Shell";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { isMatch } from "./isMatch.js";

declare const global: Shell.Global;

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

function getObjectLabel(name: string, values: Record<string, string | null>) {
  const labels = Object.entries(values)
    .filter(([_, value]) => value)
    .map(([label, value]) => `${label}: '${value}'`);
  return `${name}(${labels.join(", ")})`;
}

function getWindowLabel(window: Meta.Window) {
  return getObjectLabel("Window", {
    ["Title"]: window.title,
    ["WMClass"]: window.wmClass,
    ["GTKAppId"]: window.gtkApplicationId,
    ["SandboxedAppId"]: window.get_sandboxed_app_id(),
  });
}

function getSourceLabel(source: Source) {
  return getObjectLabel("Source", {
    ["Title"]: source.title,
    ["Icon"]: source.icon?.to_string(),
  });
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;

  private log(level: LogLevel, message: string) {
    let minLevel = this.settings!.get_string("log-level") as LogLevel;
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
    const windowLabel = getWindowLabel(window);
    this.log(LogLevel.DEBUG, `${windowLabel}: received ${event}`);

    const excludedApps = this.settings!.get_strv("excluded-apps");
    for (const wmClassPattern of excludedApps) {
      if (new RegExp(wmClassPattern).test(window.wmClass)) {
        this.log(
          LogLevel.DEBUG,
          `${windowLabel}: excluded by '${wmClassPattern}'`,
        );
        return;
      }
    }

    for (const source of Main.messageTray.getSources()) {
      const sourceLabel = getSourceLabel(source);
      for (const notification of [...source.notifications]) {
        this.log(
          LogLevel.DEBUG,
          `${windowLabel}: ${sourceLabel}: found ${notification.isTransient ? "transient" : "persistent"} notification${notification.title ? `: ${notification.title}` : ""}`,
        );
        if (isMatch(window, source) && !notification.isTransient) {
          notification.destroy();
          this.log(
            LogLevel.INFO,
            `${windowLabel}: ${sourceLabel}: removed notification${notification.title ? `: ${notification.title}` : ""}`,
          );
        }
      }
    }
  }

  enable() {
    this.settings = this.getSettings();
    this.focusListenerId = global.display.connect(
      "notify::focus-window",
      ({ focusWindow }: Meta.Display) => {
        if (this.settings!.get_boolean("delete-on-focus") && focusWindow) {
          this.clearNotificationsForApp(focusWindow, "focus");
        }
      },
    );
    this.closeListenerId = global.window_manager.connect(
      "destroy",
      (_: unknown, { metaWindow }: Meta.WindowActor) => {
        if (this.settings!.get_boolean("delete-on-close") && metaWindow) {
          this.clearNotificationsForApp(metaWindow, "close");
        }
      },
    );
  }

  disable() {
    if (this.focusListenerId !== null) {
      global.display.disconnect(this.focusListenerId);
    }
    if (this.closeListenerId !== null) {
      global.window_manager.disconnect(this.closeListenerId);
    }
    if (this.settings) {
      this.settings = null;
    }
  }
}
