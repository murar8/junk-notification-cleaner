import type Meta from "@girs/meta-16";
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
      // For Ghostty deb (and maybe other GTK apps) source icon is the same as the GTK app id
      // i.e. com.mitchellh.ghostty
      icon === window.gtkApplicationId ||
      // For Slack Flatpak (and maybe other flatpaks and snaps) source icon is the same as the app id
      // i.e. com.slack.Slack
      icon === window.get_sandboxed_app_id() ||
      // For Firefox deb source icon is the same as the window manager class
      // i.e. firefox
      icon === window.wmClass
    ) {
      return true;
    }
  }
  if (source.title) {
    if (
      // For Proton Mail Bridge source title is the same as the window title.
      // i.e. Proton Mail Bridge
      source.title === window.title ||
      // Example: Window(Title: 'isMatch.ts - junk-notification-cleaner - Cursor')
      source.title === window.title.match(/^(.+) - ([^-]+)$/)?.[2]
    ) {
      return true;
    }
  }
  return false;
}
