import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GioUnix from "gi://GioUnix";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import type GObject from "gi://GObject";
import type { LogLevel } from "./extension.js";

type DeleteTriggerKey = "delete-on-focus" | "delete-on-close";

const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
] as const satisfies `${LogLevel}`[];

export default class JunkNotificationCleanerPreferences extends ExtensionPreferences {
  private model!: PreferencesModel;

  getPreferencesWidget() {
    this.model = new PreferencesModel(this.getSettings());

    const page = new Adw.PreferencesPage();
    page.set_title("Settings");
    page.set_icon_name("preferences-system-symbolic");

    page.add(this.buildGeneralGroup());
    page.add(this.buildLoggingGroup());
    page.add(this.buildExcludedAppsGroup());

    return page;
  }

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
    key: DeleteTriggerKey;
    title: string;
    subtitle: string;
  }): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: opts.title,
      subtitle: opts.subtitle,
    });
    const toggle = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    this.model.bindDeleteTrigger(opts.key, toggle, "active");
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
      model: Gtk.StringList.new([...LOG_LEVELS]),
      valign: Gtk.Align.CENTER,
    });

    this.bindLogLevelDropdown(dropdown);

    row.add_suffix(dropdown);
    group.add(row);
    return group;
  }

  private bindLogLevelDropdown(dropdown: Gtk.DropDown): void {
    const sync = () => {
      dropdown.set_selected(this.model.getLogLevelIndex());
    };
    sync();
    const changedId = this.model.onLogLevelChanged(sync);
    dropdown.connect("notify::selected", (dd: Gtk.DropDown) => {
      this.model.setLogLevelIndex(dd.get_selected());
    });
    dropdown.connect("destroy", () => {
      this.model.disconnect(changedId);
    });
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
    addButton.connect("clicked", (btn: Gtk.Button) => {
      const parent = btn.get_root() as Gtk.Window | null;
      this.openAppSelector(parent, (appId) => {
        this.model.addExcludedApp(appId);
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
    const handlerId = this.model.onExcludedAppsChanged(() => {
      this.rebuildExcludedAppsList(listBox);
    });
    listBox.connect("destroy", () => {
      this.model.disconnect(handlerId);
    });

    return listBox;
  }

  private rebuildExcludedAppsList(listBox: Gtk.ListBox): void {
    listBox.remove_all();
    for (const appId of this.model.getExcludedApps()) {
      listBox.append(this.buildExcludedAppRow(appId));
    }
  }

  private buildExcludedAppRow(appId: string): Adw.ActionRow {
    const row = buildAppRow(
      GioUnix.DesktopAppInfo.new(`${appId}.desktop`),
      appId,
    );

    const removeButton = new Gtk.Button({
      icon_name: "user-trash-symbolic",
      tooltip_text: "Remove",
      css_classes: ["flat"],
      valign: Gtk.Align.CENTER,
    });
    removeButton.connect("clicked", () => {
      this.model.removeExcludedApp(appId);
    });
    row.add_suffix(removeButton);

    return row;
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

    const appList = buildSelectableAppList(
      this.getSelectableApps(),
      (appId) => {
        onSelected(appId);
        window.close();
      },
    );
    wireSearchFilter(appList, search);
    addCloseOnEscape(window);

    const toolbarView = new Adw.ToolbarView();
    toolbarView.add_top_bar(headerBar);
    toolbarView.set_content(new Gtk.ScrolledWindow({ child: appList }));
    window.set_content(toolbarView);
    window.present();
    search.grab_focus();
  }

  private getSelectableApps(): Gio.AppInfo[] {
    const excluded = new Set(this.model.getExcludedApps());
    return Gio.AppInfo.get_all()
      .filter((a) => a.should_show() && !excluded.has(getAppId(a)))
      .sort((a, b) => a.get_name().localeCompare(b.get_name()));
  }
}

function buildSelectableAppList(
  apps: Gio.AppInfo[],
  onActivated: (appId: string) => void,
): Gtk.ListBox {
  const appList = new Gtk.ListBox({
    selection_mode: Gtk.SelectionMode.NONE,
    css_classes: ["boxed-list"],
    margin_top: 8,
    margin_bottom: 8,
    margin_start: 8,
    margin_end: 8,
  });

  for (const app of apps) {
    const appId = getAppId(app);
    const row = buildAppRow(app, appId, { activatable: true });
    appList.append(row);
    row.connect("activated", () => {
      onActivated(appId);
    });
  }

  return appList;
}

function buildAppRow(
  app: Gio.AppInfo | null,
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

function wireSearchFilter(appList: Gtk.ListBox, search: Gtk.SearchEntry): void {
  appList.set_filter_func((row) => {
    const query = search.get_text().toLowerCase().trim();
    if (query === "") return true;
    const actionRow = row as Adw.ActionRow;
    const title = actionRow.get_title().toLowerCase();
    const subtitle = actionRow.get_subtitle()?.toLowerCase() ?? "";
    return title.includes(query) || subtitle.includes(query);
  });
  search.connect("search-changed", () => {
    appList.invalidate_filter();
  });
}

function addCloseOnEscape(window: Gtk.Window): void {
  const controller = new Gtk.ShortcutController();
  controller.add_shortcut(
    new Gtk.Shortcut({
      trigger: Gtk.ShortcutTrigger.parse_string("Escape"),
      action: Gtk.ShortcutAction.parse_string("action(window.close)"),
    }),
  );
  window.add_controller(controller);
}

function getAppId(app: Gio.AppInfo): string {
  return (app.get_id() ?? "").replace(/\.desktop$/, "");
}

class PreferencesModel {
  constructor(private settings: Gio.Settings) {}

  bindDeleteTrigger(
    key: DeleteTriggerKey,
    target: GObject.Object,
    property: string,
  ): void {
    this.settings.bind(key, target, property, Gio.SettingsBindFlags.DEFAULT);
  }

  getExcludedApps(): string[] {
    return this.settings.get_strv("excluded-apps");
  }

  addExcludedApp(appId: string): void {
    const current = this.getExcludedApps();
    if (current.includes(appId)) return;
    this.settings.set_strv("excluded-apps", [...current, appId]);
  }

  removeExcludedApp(appId: string): void {
    this.settings.set_strv(
      "excluded-apps",
      this.getExcludedApps().filter((id) => id !== appId),
    );
  }

  onExcludedAppsChanged(handler: () => void): number {
    return this.settings.connect("changed::excluded-apps", handler);
  }

  getLogLevelIndex(): number {
    const current = this.settings.get_string("log-level") as `${LogLevel}`;
    const idx = LOG_LEVELS.indexOf(current);
    if (idx >= 0) return idx;
    logError(`Invalid log level in settings: ${current}, setting to "info".`);
    return LOG_LEVELS.indexOf("info");
  }

  setLogLevelIndex(idx: number): void {
    this.settings.set_string("log-level", LOG_LEVELS[idx] ?? "info");
  }

  onLogLevelChanged(handler: () => void): number {
    return this.settings.connect("changed::log-level", handler);
  }

  disconnect(handlerId: number): void {
    this.settings.disconnect(handlerId);
  }
}
