import type Meta from "gi://Meta";
import type { Source } from "resource:///org/gnome/shell/ui/messageTray.js";

export function getWindowLabel(window: Meta.Window) {
  const title = window.title ?? "<empty>";
  const wmClass = window.wmClass ?? "<empty>";
  const gtkAppId = window.gtkApplicationId ?? "<empty>";
  const sandboxedAppId = window.get_sandboxed_app_id() ?? "<empty>";
  return `Window(Title: '${title}', WMClass: '${wmClass}', GTKAppId: '${gtkAppId}', SandboxedAppId: '${sandboxedAppId}')`;
}

export function getSourceLabel(source: Source) {
  const title = source.title ?? "<empty>";
  const icon = source.icon?.to_string() ?? "<empty>";
  return `Source(Title: '${title}', Icon: '${icon}')`;
}

export function isMatch(window: Meta.Window, source: Source) {
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
  return (
    source.title &&
    // For Proton Mail Bridge source title is the same as the window title.
    // i.e. Proton Mail Bridge
    source.title === window.title
  );
}
