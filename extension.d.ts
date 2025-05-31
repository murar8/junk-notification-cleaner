import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
export default class JunkNotificationCleaner extends Extension {
    private focusListenerId;
    private closeListenerId;
    private settings;
    private clearNotificationsForApp;
    enable(): void;
    disable(): void;
}
