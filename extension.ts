import Gio from "gi://Gio";
import Meta from "gi://Meta";
import { Source } from "resource:///org/gnome/shell/ui/messageTray.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

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

function isMatch(window: Meta.Window, source: Source) {
  const sandboxedAppId = window.get_sandboxed_app_id();
  if (source.icon) {
    const icon = source.icon.to_string();
    if (
      // For Ghostty deb (and maybe other GTK apps) source icon is the same as the GTK app id
      // i.e. com.mitchellh.ghostty
      icon === window.gtkApplicationId ||
      // For Slack Flatpak (and maybe other flatpaks and snaps) source icon is the same as the app id
      // i.e. com.slack.Slack
      icon === sandboxedAppId ||
      // For Firefox deb source icon is the same as the window manager class
      // i.e. firefox
      icon === window.wmClass
    ) {
      return true;
    }
  }
  return (
    source.title &&
    // For Proton Mail Bridge source title is the same as the window title.
    // i.e. Proton Mail Bridge
    source.title === window.title
  );
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
  }
}
