import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { LogLevel } from "./extension.js";

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"] as LogLevel[];

export default class JunkNotificationCleanerPreferences extends ExtensionPreferences {
  async fillPreferencesWindow(window: Adw.PreferencesWindow) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    page.set_title("Settings");
    page.set_icon_name("preferences-system-symbolic");
    window.add(page);

    const generalGroup = new Adw.PreferencesGroup();
    generalGroup.set_title("General Settings");
    page.add(generalGroup);

    const focusRow = new Adw.ActionRow({
      title: "Delete on Focus",
      subtitle: "Delete notifications when an application window is focused.",
    });
    const focusSwitch = new Gtk.Switch({
      active: settings.get_boolean("delete-on-focus"),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "delete-on-focus",
      focusSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    focusRow.add_suffix(focusSwitch);
    generalGroup.add(focusRow);

    const closeRow = new Adw.ActionRow({
      title: "Delete on Close",
      subtitle: "Delete notifications when an application window is closed.",
    });
    const closeSwitch = new Gtk.Switch({
      active: settings.get_boolean("delete-on-close"),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "delete-on-close",
      closeSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    closeRow.add_suffix(closeSwitch);
    generalGroup.add(closeRow);

    const debugGroup = new Adw.PreferencesGroup();
    debugGroup.set_title("Logging");
    page.add(debugGroup);

    const logLevelRow = new Adw.ActionRow({
      title: "Log Level",
      subtitle:
        "Set the logging level for troubleshooting notification matching.",
    });
    const logLevelDropdown = new Gtk.DropDown({
      model: Gtk.StringList.new(LOG_LEVELS),
      valign: Gtk.Align.CENTER,
    });

    let currentLogLevel = settings.get_string("log-level") || "info";
    const currentIndex = LOG_LEVELS.indexOf(currentLogLevel as LogLevel);
    if (currentIndex !== -1) {
      logLevelDropdown.set_selected(currentIndex);
    }

    logLevelDropdown.connect("notify::selected", () => {
      const selectedIndex = logLevelDropdown.get_selected();
      settings.set_string("log-level", LOG_LEVELS[selectedIndex]);
    });

    logLevelRow.add_suffix(logLevelDropdown);
    debugGroup.add(logLevelRow);

    const excludedGroup = new Adw.PreferencesGroup();
    excludedGroup.set_title("Excluded WM Classes");
    excludedGroup.set_description(
      [
        "Window Manager Classes whose notifications will not be automatically deleted.",
        "Will be matched against the wm_class property of the window, supports ECMAScript regular expressions.",
      ].join("\n"),
    );
    page.add(excludedGroup);

    const excludedBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
      spacing: 8,
    });

    const excludedApps = settings.get_strv("excluded-apps");

    const listBox = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
    });
    excludedBox.append(listBox);

    for (const app of excludedApps) {
      this.addExcludedAppRow(app, listBox, settings);
    }

    const addBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      margin_top: 8,
    });

    const entry = new Gtk.Entry({
      placeholder_text: "Enter WM Class regex (e.g. .*firefox.*)",
      hexpand: true,
    });

    const addButton = new Gtk.Button({
      label: "Add",
      css_classes: ["suggested-action"],
    });

    addButton.connect("clicked", () => {
      const text = entry.get_text().trim();
      if (!text) return;
      const currentApps = settings.get_strv("excluded-apps");
      if (currentApps.includes(text)) return;
      settings.set_strv("excluded-apps", [...currentApps, text]);
      this.addExcludedAppRow(text, listBox, settings);
      entry.set_text("");
    });

    addBox.append(entry);
    addBox.append(addButton);

    excludedBox.append(addBox);
    excludedGroup.add(excludedBox);
  }

  addExcludedAppRow(
    app: string,
    listBox: Gtk.ListBox,
    settings: Gio.Settings,
  ): void {
    const row = new Gtk.ListBoxRow();
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    });

    const label = new Gtk.Label({
      label: app,
      hexpand: true,
      xalign: 0,
    });

    const removeButton = new Gtk.Button({
      icon_name: "user-trash-symbolic",
      tooltip_text: "Remove",
    });

    removeButton.connect("clicked", () => {
      const currentApps = settings.get_strv("excluded-apps");
      const newApps = currentApps.filter((a) => a !== app);
      settings.set_strv("excluded-apps", newApps);
      listBox.remove(row);
    });

    box.append(label);
    box.append(removeButton);
    row.set_child(box);
    listBox.append(row);
  }
}
