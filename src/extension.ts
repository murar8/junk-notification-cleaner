import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
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

function getWindowLabel(window: Meta.Window) {
  return getObjectLabel("Window", {
    ["Title"]: window.title,
    ["WMClass"]: window.wmClass,
    ["GTKAppId"]: window.gtkApplicationId,
    ["SandboxedAppId"]: window.get_sandboxed_app_id(),
  });
}

// Source.icon is typed non-nullable upstream but can be null at runtime.
function getSourceLabel(source: {
  title: string;
  icon: { to_string: () => string | null } | null;
}) {
  return getObjectLabel("Source", {
    ["Title"]: source.title,
    ["Icon"]: source.icon?.to_string() ?? null,
  });
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;

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
    const windowLabel = getWindowLabel(window);
    this.log(LogLevel.DEBUG, `${windowLabel}: received ${event}`);

    const settings = this.settings;
    if (!settings) {
      this.log(LogLevel.ERROR, `${windowLabel}: settings not initialized`);
      return;
    }

    const excludedApps = settings.get_strv("excluded-apps");
    for (const wmClassPattern of excludedApps) {
      const result = safeRegexTest(wmClassPattern, window.wmClass);
      if (result === null) {
        this.log(
          LogLevel.WARN,
          `${windowLabel}: invalid regex '${wmClassPattern}'`,
        );
      } else if (result) {
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
    if (this.focusListenerId !== null) {
      global.display.disconnect(this.focusListenerId);
      this.focusListenerId = null;
    }
    if (this.closeListenerId !== null) {
      global.window_manager.disconnect(this.closeListenerId);
      this.closeListenerId = null;
    }
    if (this.settings) {
      this.settings = null;
    }
  }
}
