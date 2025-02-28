import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

declare module "resource:///org/gnome/shell/ui/messageTray.js" {
  interface Source {
    app?: Shell.App;
  }
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;

  private clearNotificationsForApp(window: Meta.Window) {
    const excludedApps = this.settings!.get_strv("excluded-apps");
    for (const wmClassPattern of excludedApps) {
      if (new RegExp(wmClassPattern).test(window.wm_class)) {
        log(`Not clearing notifications for ${window.wm_class}`);
        return;
      }
    }

    log(`Clearing notifications for ${window.wm_class}`);
    const sources = Main.messageTray.getSources();
    for (const source of sources) {
      const isSameWmClass = source.app
        ?.get_windows()
        ?.map((win) => win.wm_class)
        ?.includes(window.wm_class);
      if (isSameWmClass) {
        // MUST create a copy of the notifications array before iterating!
        for (const notification of [...source.notifications]) {
          notification.destroy();
        }
      }
    }
  }

  enable() {
    this.settings = this.getSettings();
    if (this.settings.get_boolean("delete-on-focus")) {
      this.focusListenerId = global.display.connect(
        "notify::focus-window",
        (display: Meta.Display) => {
          this.clearNotificationsForApp(display.focus_window);
        }
      );
    }
    if (this.settings.get_boolean("delete-on-close")) {
      this.closeListenerId = global.window_manager.connect(
        "destroy",
        (_: unknown, actor: Meta.WindowActor) => {
          if (actor.metaWindow) {
            this.clearNotificationsForApp(actor.metaWindow);
          }
        }
      );
    }
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
