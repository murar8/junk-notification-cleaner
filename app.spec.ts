import * as dbus from "@httptoolkit/dbus-native";
import type { DBusClient } from "@httptoolkit/dbus-native";

interface Notifications {
  GetCapabilities(): Promise<string[]>;
  Notify(
    app_name: string,
    replaces_id: number,
    app_icon: string,
    summary: string,
    body: string,
    actions: string[],
    hints: Record<string, any>,
    expire_timeout: number
  ): Promise<number>;
  CloseNotification(id: number): Promise<void>;
  GetServerInformation(): Promise<[string, string, string, string]>;
}

let client: DBusClient;
let notifications: Notifications;

beforeAll(async () => {
  client = dbus.createClient({});
  notifications = await client
    .getService("org.freedesktop.Notifications")
    .getInterface<Notifications>(
      "/org/freedesktop/Notifications",
      "org.freedesktop.Notifications"
    );
});

it("should clear notifications when the window is focused", async () => {
  const notificationId = await notifications.Notify(
    "example",
    0,
    "",
    "summary 3",
    "new message text",
    [],
    {},
    0
  );
});
