import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;

  private clearNotificationsForApp(
    window: Meta.Window,
    event: "focus" | "close"
  ) {
    const id = window.wmClass + " - " + window.title;
    log(`[${id}] ${event} received, clearing notifications`);

    const excludedApps = this.settings!.get_strv("excluded-apps");
    for (const wmClassPattern of excludedApps) {
      if (new RegExp(wmClassPattern).test(window.wm_class)) {
        log(`[${id}] excluded by ${wmClassPattern}`);
        return;
      }
    }

    const sources = Main.messageTray.getSources();
    for (const source of sources) {
      if (source.title === window.wm_class || source.title === window.title) {
        for (const notification of [...source.notifications]) {
          notification.destroy();
          log(`[${id}] Cleared notification '${notification.title}'`);
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
      }
    );
    this.closeListenerId = global.window_manager.connect(
      "destroy",
      (_: unknown, { metaWindow }: Meta.WindowActor) => {
        if (this.settings!.get_boolean("delete-on-close") && metaWindow) {
          this.clearNotificationsForApp(metaWindow, "close");
        }
      }
    );
  }

  disable() {
    if (this.focusListenerId !== null) {
      global.display.disconnect(this.focusListenerId);
    }
    if (this.closeListenerId !== null) {
      global.window_manager.disconnect(this.closeListenerId);
    }
  }
}
