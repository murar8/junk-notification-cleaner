import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GioUnix from "gi://GioUnix";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { LogLevel } from "./extension.js";

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"] as LogLevel[];

function getAppId(app: GioUnix.DesktopAppInfo): string {
  return (app.get_id() ?? "").replace(/\.desktop$/, "");
}

function lookupApp(appId: string): GioUnix.DesktopAppInfo | null {
  return GioUnix.DesktopAppInfo.new(`${appId}.desktop`);
}

export default class JunkNotificationCleanerPreferences extends ExtensionPreferences {
  getPreferencesWidget() {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    page.set_title("Settings");
    page.set_icon_name("preferences-system-symbolic");

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

    const currentLogLevel = settings.get_string("log-level") || "info";
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
    excludedGroup.set_title("Excluded Applications");
    excludedGroup.set_description(
      "Applications whose notifications will not be automatically deleted.",
    );

    const addButton = new Gtk.Button({
      icon_name: "list-add-symbolic",
      tooltip_text: "Add application",
      css_classes: ["flat"],
      valign: Gtk.Align.CENTER,
    });
    excludedGroup.set_header_suffix(addButton);
    page.add(excludedGroup);

    const listBox = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
    });
    excludedGroup.add(listBox);

    const placeholder = new Gtk.Label({
      label: "No excluded applications.",
      css_classes: ["dim-label"],
      margin_top: 12,
      margin_bottom: 12,
    });
    listBox.set_placeholder(placeholder);

    for (const appId of settings.get_strv("excluded-apps")) {
      this.addExcludedAppRow(appId, listBox, settings);
    }

    addButton.connect("clicked", () => {
      this.openAppSelector(
        addButton.get_root() as Gtk.Window | null,
        listBox,
        settings,
      );
    });

    return page;
  }

  openAppSelector(
    parent: Gtk.Window | null,
    listBox: Gtk.ListBox,
    settings: Gio.Settings,
  ): void {
    const excluded = new Set(settings.get_strv("excluded-apps"));
    const apps = (Gio.AppInfo.get_all() as GioUnix.DesktopAppInfo[])
      .filter((a) => {
        const id = getAppId(a);
        return a.should_show() && id !== "" && !excluded.has(id);
      })
      .sort((a, b) => {
        return a.get_name().localeCompare(b.get_name());
      });

    const window = new Adw.Window({
      title: "Add Excluded Application",
      modal: true,
      default_width: 420,
      default_height: 520,
    });
    if (parent) window.set_transient_for(parent);

    const search = new Gtk.SearchEntry({
      placeholder_text: "Search applications",
      hexpand: true,
    });

    const headerBar = new Adw.HeaderBar();
    headerBar.set_title_widget(search);

    const appList = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    });

    let query = "";
    appList.set_filter_func((row) => {
      if (query === "") return true;
      const actionRow = row as Adw.ActionRow;
      const title = actionRow.get_title().toLowerCase();
      const subtitle = (actionRow.get_subtitle() ?? "").toLowerCase();
      return title.includes(query) || subtitle.includes(query);
    });

    search.connect("search-changed", () => {
      query = search.get_text().toLowerCase().trim();
      appList.invalidate_filter();
    });

    for (const app of apps) {
      const appId = getAppId(app);
      const row = new Adw.ActionRow({
        title: app.get_name(),
        subtitle: appId,
        activatable: true,
      });
      const icon = app.get_icon();
      if (icon) {
        const image = Gtk.Image.new_from_gicon(icon);
        image.set_pixel_size(32);
        row.add_prefix(image);
      }
      row.connect("activated", () => {
        const current = settings.get_strv("excluded-apps");
        if (!current.includes(appId)) {
          settings.set_strv("excluded-apps", [...current, appId]);
          this.addExcludedAppRow(appId, listBox, settings);
        }
        window.close();
      });
      appList.append(row);
    }

    const toolbarView = new Adw.ToolbarView();
    toolbarView.add_top_bar(headerBar);
    toolbarView.set_content(new Gtk.ScrolledWindow({ child: appList }));
    window.set_content(toolbarView);
    window.present();
  }

  addExcludedAppRow(
    appId: string,
    listBox: Gtk.ListBox,
    settings: Gio.Settings,
  ): void {
    const app = lookupApp(appId);
    const row = new Adw.ActionRow({
      title: app?.get_name() ?? appId,
      subtitle: appId,
    });
    const icon = app?.get_icon();
    if (icon) {
      const image = Gtk.Image.new_from_gicon(icon);
      image.set_pixel_size(32);
      row.add_prefix(image);
    }

    const removeButton = new Gtk.Button({
      icon_name: "user-trash-symbolic",
      tooltip_text: "Remove",
      css_classes: ["flat"],
      valign: Gtk.Align.CENTER,
    });
    removeButton.connect("clicked", () => {
      const current = settings.get_strv("excluded-apps");
      settings.set_strv(
        "excluded-apps",
        current.filter((id) => id !== appId),
      );
      listBox.remove(row);
    });
    row.add_suffix(removeButton);

    listBox.append(row);
  }
}
