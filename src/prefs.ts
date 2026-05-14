import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GioUnix from "gi://GioUnix";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { LogLevel } from "./extension.js";

const LOG_LEVELS: `${LogLevel}`[] = ["debug", "info", "warn", "error"];

function getAppId(app: GioUnix.DesktopAppInfo): string {
  return (app.get_id() ?? "").replace(/\.desktop$/, "");
}

function lookupApp(appId: string): GioUnix.DesktopAppInfo | null {
  return GioUnix.DesktopAppInfo.new(`${appId}.desktop`);
}

function buildAppRow(
  app: GioUnix.DesktopAppInfo | null | undefined,
  appId: string,
  extra: Partial<Adw.ActionRow.ConstructorProps> = {},
): Adw.ActionRow {
  const title = app?.get_name() ?? appId;
  const row = new Adw.ActionRow({ ...extra, title, subtitle: appId });
  const icon = app?.get_icon();
  if (icon) {
    const image = Gtk.Image.new_from_gicon(icon);
    image.set_pixel_size(32);
    row.add_prefix(image);
  }
  return row;
}

export default class JunkNotificationCleanerPreferences extends ExtensionPreferences {
  private settings!: Gio.Settings;

  getPreferencesWidget() {
    this.settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    page.set_title("Settings");
    page.set_icon_name("preferences-system-symbolic");

    page.add(this.buildGeneralGroup());
    page.add(this.buildLoggingGroup());
    page.add(this.buildExcludedAppsGroup());

    return page;
  }

  // ── business logic ──────────────────────────────────────────────────────

  getExcludedApps(): string[] {
    return this.settings.get_strv("excluded-apps");
  }

  addExcludedApp(appId: string): void {
    const current = this.getExcludedApps();
    if (current.includes(appId)) return;
    this.settings.set_strv("excluded-apps", [...current, appId]);
  }

  removeExcludedApp(appId: string): void {
    const current = this.getExcludedApps();
    this.settings.set_strv(
      "excluded-apps",
      current.filter((id) => id !== appId),
    );
  }

  getSelectableApps(): GioUnix.DesktopAppInfo[] {
    const excluded = new Set(this.getExcludedApps());
    return (Gio.AppInfo.get_all() as GioUnix.DesktopAppInfo[])
      .filter((a) => {
        const id = getAppId(a);
        return a.should_show() && id !== "" && !excluded.has(id);
      })
      .sort((a, b) => {
        return a.get_name().localeCompare(b.get_name());
      });
  }

  // ── UI builders ─────────────────────────────────────────────────────────

  private buildGeneralGroup(): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup();
    group.set_title("General Settings");

    group.add(
      this.buildSwitchRow({
        key: "delete-on-focus",
        title: "Delete on Focus",
        subtitle: "Delete notifications when an application window is focused.",
      }),
    );
    group.add(
      this.buildSwitchRow({
        key: "delete-on-close",
        title: "Delete on Close",
        subtitle: "Delete notifications when an application window is closed.",
      }),
    );

    return group;
  }

  private buildSwitchRow(opts: {
    key: string;
    title: string;
    subtitle: string;
  }): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: opts.title,
      subtitle: opts.subtitle,
    });
    const toggle = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    this.settings.bind(
      opts.key,
      toggle,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    row.add_suffix(toggle);
    return row;
  }

  private buildLoggingGroup(): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup();
    group.set_title("Logging");

    const row = new Adw.ActionRow({
      title: "Log Level",
      subtitle:
        "Set the logging level for troubleshooting notification matching.",
    });
    const dropdown = new Gtk.DropDown({
      model: Gtk.StringList.new(LOG_LEVELS),
      valign: Gtk.Align.CENTER,
    });

    const syncDropdown = () => {
      const current = this.settings.get_string("log-level");
      const idx = LOG_LEVELS.indexOf(current as LogLevel);
      dropdown.set_selected(idx === -1 ? LOG_LEVELS.indexOf("info") : idx);
    };
    syncDropdown();
    const changedId = this.settings.connect("changed::log-level", syncDropdown);
    dropdown.connect("notify::selected", () => {
      this.settings.set_string(
        "log-level",
        LOG_LEVELS[dropdown.get_selected()] ?? "info",
      );
    });
    dropdown.connect("destroy", () => {
      this.settings.disconnect(changedId);
    });

    row.add_suffix(dropdown);
    group.add(row);
    return group;
  }

  private buildExcludedAppsGroup(): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup();
    group.set_title("Excluded Applications");
    group.set_description(
      "Applications whose notifications will not be automatically deleted.",
    );

    const listBox = this.buildExcludedAppsList();

    const addButton = new Gtk.Button({
      icon_name: "list-add-symbolic",
      tooltip_text: "Add application",
      css_classes: ["flat"],
      valign: Gtk.Align.CENTER,
    });
    addButton.connect("clicked", () => {
      const parent = addButton.get_root() as Gtk.Window | null;
      this.openAppSelector(parent, (appId) => {
        this.addExcludedApp(appId);
      });
    });
    group.set_header_suffix(addButton);
    group.add(listBox);

    return group;
  }

  private buildExcludedAppsList(): Gtk.ListBox {
    const listBox = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
    });
    listBox.set_placeholder(
      new Gtk.Label({
        label: "No excluded applications.",
        css_classes: ["dim-label"],
        margin_top: 12,
        margin_bottom: 12,
      }),
    );

    this.rebuildExcludedAppsList(listBox);
    const handlerId = this.settings.connect("changed::excluded-apps", () => {
      this.rebuildExcludedAppsList(listBox);
    });
    listBox.connect("destroy", () => {
      this.settings.disconnect(handlerId);
    });

    return listBox;
  }

  private rebuildExcludedAppsList(listBox: Gtk.ListBox): void {
    listBox.remove_all();
    for (const appId of this.getExcludedApps()) {
      listBox.append(this.buildExcludedAppRow(appId));
    }
  }

  private buildExcludedAppRow(appId: string): Adw.ActionRow {
    const row = buildAppRow(lookupApp(appId), appId);

    const removeButton = new Gtk.Button({
      icon_name: "user-trash-symbolic",
      tooltip_text: "Remove",
      css_classes: ["flat"],
      valign: Gtk.Align.CENTER,
    });
    removeButton.connect("clicked", () => {
      this.removeExcludedApp(appId);
    });
    row.add_suffix(removeButton);

    return row;
  }

  private buildSelectableAppList(
    onActivated: (appId: string) => unknown,
  ): Gtk.ListBox {
    const appList = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    });

    for (const app of this.getSelectableApps()) {
      const appId = getAppId(app);
      const row = buildAppRow(app, appId, { activatable: true });
      row.connect("activated", () => onActivated(appId));
      appList.append(row);
    }

    return appList;
  }

  private openAppSelector(
    parent: Gtk.Window | null,
    onSelected: (appId: string) => void,
  ): void {
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

    const appList = this.buildSelectableAppList((appId) => {
      onSelected(appId);
      window.close();
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

    const escController = new Gtk.ShortcutController();
    escController.add_shortcut(
      new Gtk.Shortcut({
        trigger: Gtk.ShortcutTrigger.parse_string("Escape"),
        action: Gtk.ShortcutAction.parse_string("action(window.close)"),
      }),
    );
    window.add_controller(escController);

    const toolbarView = new Adw.ToolbarView();
    toolbarView.add_top_bar(headerBar);
    toolbarView.set_content(new Gtk.ScrolledWindow({ child: appList }));
    window.set_content(toolbarView);
    window.present();
    search.grab_focus();
  }
}
