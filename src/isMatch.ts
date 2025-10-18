import type Meta from "@girs/meta-17";
import type { Source as NotificationSource } from "resource:///org/gnome/shell/ui/messageTray.js";

type Window = Pick<
  Meta.Window,
  "gtkApplicationId" | "get_sandboxed_app_id" | "wmClass" | "title"
>;

type Source = Pick<NotificationSource, "icon" | "title">;

export function isMatch(window: Window, source: Source) {
  if (source.icon) {
    const icon = source.icon.to_string();
    if (
      // Ghostty deb: icon matches GTK app id (com.mitchellh.ghostty)
      icon === window.gtkApplicationId ||
      // Slack Flatpak: icon matches sandboxed app id (com.slack.Slack)
      icon === window.get_sandboxed_app_id() ||
      // Firefox deb: icon matches window manager class (firefox)
      icon === window.wmClass
    ) {
      return true;
    }

    // Snap apps have icon paths like /snap/firefox/6638/default256.png
    const snapAppName = icon?.match(/^\/snap\/([^/]+)\//)?.at(1);
    // Snap sandboxed ids use format appname_appname (firefox_firefox)
    if (snapAppName) {
      if (window.get_sandboxed_app_id() === `${snapAppName}_${snapAppName}`) {
        return true;
      }
    }
  }
  if (source.title) {
    if (
      // Proton Mail Bridge: title matches window title
      source.title === window.title ||
      // Extract app name from composite title (isMatch.ts - junk-notification-cleaner - Cursor)
      source.title === window.title?.match(/^.+ (-|\|) (.+)$/)?.[2] ||
      // Thunderbird: title matches window manager class (thunderbird)
      source.title === window.wmClass ||
      // Discord snap: title duplicated matches sandboxed app id (discord_discord)
      `${source.title}_${source.title}` === window.get_sandboxed_app_id()
    ) {
      return true;
    }
  }
  return false;
}
