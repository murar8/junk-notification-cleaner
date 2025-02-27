import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import Gio from "gi://Gio";

declare module "resource:///org/gnome/shell/ui/messageTray.js" {
  interface Source {
    app?: Shell.App;
  }
}

export default class JunkNotificationCleaner extends Extension {
  private focusListenerId: number | null = null;
  private closeListenerId: number | null = null;
  private settings: Gio.Settings | null = null;

  private isAppExcluded(app: Shell.App): boolean {
    if (!this.settings) return false;

    const excludedApps = this.settings.get_strv("excluded-apps");
    return excludedApps.includes(app.get_id());
  }

  private clearNotificationsForApp(app: Shell.App): void {
    // Check if app is excluded
    if (this.isAppExcluded(app)) return;

    const sources = Main.messageTray.getSources();
    for (const source of sources) {
      if (source.app?.get_id?.() === app.get_id()) {
        for (const notification of source.notifications) {
          notification.destroy();
        }
      }
    }
  }

  enable() {
    // Get settings
    this.settings = this.getSettings();

    // Respect the delete-on-focus setting
    if (this.settings.get_boolean("delete-on-focus")) {
      this.focusListenerId = global.display.connect(
        "notify::focus-window",
        (display: Meta.Display) => {
          if (display.focus_window) {
            const tracker = Shell.WindowTracker.get_default();
            const app = tracker.get_window_app(display.focus_window);
            if (app) {
              this.clearNotificationsForApp(app);
            }
          }
        },
      );
    }

    // Respect the delete-on-close setting
    if (this.settings.get_boolean("delete-on-close")) {
      this.closeListenerId = global.window_manager.connect(
        "destroy",
        (_: unknown, actor: Meta.WindowActor) => {
          const tracker = Shell.WindowTracker.get_default();
          const app = tracker.get_window_app(actor.metaWindow);
          if (app) {
            this.clearNotificationsForApp(app);
          }
        },
      );
    }
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
    this.settings = null;
  }
}
