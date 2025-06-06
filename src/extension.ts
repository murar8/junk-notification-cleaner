import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import type { Source } from "resource:///org/gnome/shell/ui/messageTray.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { isMatch } from "./isMatch.js";

function getWindowLabel(window: Meta.Window) {
  const title = window.title ?? "<empty>";
  const wmClass = window.wmClass ?? "<empty>";
  const gtkAppId = window.gtkApplicationId ?? "<empty>";
  const sandboxedAppId = window.get_sandboxed_app_id() ?? "<empty>";
  return `Window(Title: '${title}', WMClass: '${wmClass}', GTKAppId: '${gtkAppId}', SandboxedAppId: '${sandboxedAppId}')`;
}

function getSourceLabel(source: Source) {
  const title = source.title ?? "<empty>";
  const icon = source.icon?.to_string() ?? "<empty>";
  return `Source(Title: '${title}', Icon: '${icon}')`;
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;

  private clearNotificationsForApp(
    window: Meta.Window,
    event: "focus" | "close",
  ) {
    const windowLabel = getWindowLabel(window);
    log(`${windowLabel}: ${event} received, clearing notifications`);

    const excludedApps = this.settings!.get_strv("excluded-apps");
    for (const wmClassPattern of excludedApps) {
      if (new RegExp(wmClassPattern).test(window.wmClass)) {
        log(`${windowLabel}: excluded by ${wmClassPattern}`);
        return;
      }
    }

    for (const source of Main.messageTray.getSources()) {
      if (isMatch(window, source)) {
        const sourceLabel = getSourceLabel(source);
        for (const notification of [...source.notifications]) {
          if (!notification.isTransient) {
            log(`${windowLabel}: clearing notification for ${sourceLabel}`);
            notification.destroy();
          }
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
