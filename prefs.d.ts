import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
export default class JunkNotificationCleanerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void>;
    addExcludedAppRow(app: string, listBox: Gtk.ListBox, settings: Gio.Settings): void;
}
