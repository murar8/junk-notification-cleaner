import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GioUnix from "gi://GioUnix";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import type { LogLevel } from "./extension.js";

const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
] as const satisfies `${LogLevel}`[];

const DELETE_TRIGGERS = [
  {
    key: "delete-on-focus",
    title: "Delete on Focus",
    subtitle: "Delete notifications when an application window is focused.",
  },
  {
    key: "delete-on-close",
    title: "Delete on Close",
    subtitle: "Delete notifications when an application window is closed.",
  },
] as const;

export default class JunkNotificationCleanerPreferences extends ExtensionPreferences {
  // Shell passes an Adw.PreferencesWindow (deprecated in Adw 1.6).
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  fillPreferencesWindow(window: Adw.PreferencesWindow) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: "Settings",
      icon_name: "preferences-system-symbolic",
    });

    page.add(buildGeneralGroup(settings));
    page.add(buildLoggingGroup(settings));
    page.add(buildExcludedAppsGroup(settings));

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    window.add(page);
    return Promise.resolve();
  }
}

function buildGeneralGroup(settings: Gio.Settings): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({ title: "General Settings" });

  for (const { key, title, subtitle } of DELETE_TRIGGERS) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
  }
  return group;
}

function buildLoggingGroup(settings: Gio.Settings): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({ title: "Logging" });

  const row = new Adw.ComboRow({
    title: "Log Level",
    subtitle:
      "Set the logging level for troubleshooting notification matching.",
    model: Gtk.StringList.new([...LOG_LEVELS]),
    selected: settings.get_enum("log-level"),
  });
  const unsubscribe = onChanged(settings, "log-level", () => {
    row.set_selected(settings.get_enum("log-level"));
  });
  row.connect("notify::selected", () => {
    settings.set_enum("log-level", row.get_selected());
  });
  row.connect("destroy", unsubscribe);

  group.add(row);
  return group;
}

function buildExcludedAppsGroup(settings: Gio.Settings): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({
    title: "Excluded Applications",
    description:
      "Applications whose notifications will not be automatically deleted.",
  });

  const listBox = buildExcludedAppsList(settings);

  const addButton = new Gtk.Button({
    icon_name: "list-add-symbolic",
    tooltip_text: "Add application",
    css_classes: ["flat"],
    valign: Gtk.Align.CENTER,
  });
  addButton.connect("clicked", (btn: Gtk.Button) => {
    openAppSelector(settings, btn);
  });
  group.set_header_suffix(addButton);
  group.add(listBox);

  return group;
}

function buildExcludedAppsList(settings: Gio.Settings): Gtk.ListBox {
  const listBox = new Gtk.ListBox({
    selection_mode: Gtk.SelectionMode.NONE,
    css_classes: ["boxed-list"],
  });
  listBox.set_placeholder(buildPlaceholder("No excluded applications."));

  const model = Gtk.StringList.new(settings.get_strv("excluded-apps"));
  listBox.bind_model(model, (item) =>
    buildExcludedAppRow(settings, item.string),
  );
  const unsubscribe = onChanged(settings, "excluded-apps", () => {
    model.splice(0, model.n_items, settings.get_strv("excluded-apps"));
  });
  listBox.connect("destroy", unsubscribe);

  return listBox;
}

function buildExcludedAppRow(
  settings: Gio.Settings,
  appId: string,
): Adw.ActionRow {
  const app = tryLoadDesktopApp(appId);
  const row = buildAppRow(app, appId);
  if (!app) row.set_subtitle("Uninstalled");

  const removeButton = new Gtk.Button({
    icon_name: "user-trash-symbolic",
    tooltip_text: `Remove ${row.get_title()}`,
    css_classes: ["flat"],
    valign: Gtk.Align.CENTER,
  });
  removeButton.connect("clicked", () => {
    removeButton.get_root()?.set_focus(null);
    removeExcludedApp(settings, appId);
  });
  row.add_suffix(removeButton);

  return row;
}

function openAppSelector(settings: Gio.Settings, parent: Gtk.Widget): void {
  const search = new Gtk.SearchEntry({
    placeholder_text: "Search applications",
    hexpand: true,
  });
  search.update_property(
    [Gtk.AccessibleProperty.LABEL],
    ["Search applications"],
  );
  const headerBar = new Adw.HeaderBar({ title_widget: search });

  const appList = buildSelectableAppList(
    getSelectableApps(settings),
    (appId) => {
      addExcludedApp(settings, appId);
      dialog.close();
    },
  );
  wireSearchFilter(appList, search);
  search.connect("stop-search", () => {
    dialog.close();
  });

  const toolbarView = new Adw.ToolbarView({
    content: new Gtk.ScrolledWindow({ child: appList }),
  });
  toolbarView.add_top_bar(headerBar);
  const dialog = new Adw.Dialog({
    title: "Add Excluded Application",
    content_width: 420,
    content_height: 520,
    child: toolbarView,
    focus_widget: search,
  });
  dialog.present(parent);
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
  appList.set_placeholder(buildPlaceholder("No applications found."));

  for (const app of apps) {
    const appId = getAppId(app);
    const row = buildAppRow(app, appId, true);
    appList.append(row);
    row.connect("activated", () => {
      onActivated(appId);
    });
  }

  return appList;
}

function buildPlaceholder(label: string): Gtk.Label {
  return new Gtk.Label({
    label,
    css_classes: ["dim-label"],
    margin_top: 12,
    margin_bottom: 12,
  });
}

function buildAppRow(
  app: Gio.AppInfo | null,
  appId: string,
  activatable = false,
): Adw.ActionRow {
  const title = app?.get_name() ?? appId;
  const row = new Adw.ActionRow({ activatable, title, subtitle: appId });
  const icon = app?.get_icon();
  if (icon) row.add_prefix(new Gtk.Image({ gicon: icon, pixel_size: 32 }));
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

// DesktopAppInfo.new is typed as non-null but returns null when the
// .desktop file is missing (e.g. the user uninstalled the app).
function tryLoadDesktopApp(appId: string): GioUnix.DesktopAppInfo | null {
  return GioUnix.DesktopAppInfo.new(`${appId}.desktop`);
}

function getAppId(app: Gio.AppInfo): string {
  return (app.get_id() ?? "").replace(/\.desktop$/, "");
}

function addExcludedApp(settings: Gio.Settings, appId: string): void {
  const current = settings.get_strv("excluded-apps");
  if (current.includes(appId)) return;
  settings.set_strv("excluded-apps", [...current, appId]);
}

function removeExcludedApp(settings: Gio.Settings, appId: string): void {
  settings.set_strv(
    "excluded-apps",
    settings.get_strv("excluded-apps").filter((id) => id !== appId),
  );
}

function getSelectableApps(settings: Gio.Settings): Gio.AppInfo[] {
  const excluded = new Set(settings.get_strv("excluded-apps"));
  return Gio.AppInfo.get_all()
    .filter((a) => a.should_show() && a.get_id())
    .filter((a) => !excluded.has(getAppId(a)))
    .sort((a, b) => a.get_name().localeCompare(b.get_name()));
}

function onChanged(
  settings: Gio.Settings,
  key: string,
  handler: () => void,
): () => void {
  const id = settings.connect(`changed::${key}`, handler);
  return () => {
    settings.disconnect(id);
  };
}
