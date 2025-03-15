import * as dbus from "@httptoolkit/dbus-native";
import Gtk from "@girs/node-gtk-4.0";
import GLib from "@girs/glib-2.0";
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
  Gtk.initCheck();
  client = dbus.createClient({});
  notifications = await client
    .getService("org.freedesktop.Notifications")
    .getInterface<Notifications>(
      "/org/freedesktop/Notifications",
      "org.freedesktop.Notifications"
    );
});

afterAll(async () => {
  await client.disconnect();
});

it("should clear notifications when the window is focused", async () => {
  const notificationId = await notifications.Notify(
    "org.gnome.TextEditor",
    0,
    "",
    "summary 3",
    "new message text",
    [],
    {},
    0
  );

  const printHello = () => console.log("Hello");

  const app = new Gtk.Application("com.github.romgrk.node-gtk.demo", 0);
  app.on("activate", onActivate);
  const status = app.run([]);

  console.log("Finished with status:", status);

  function onActivate() {
    const window = new Gtk.ApplicationWindow(app);
    window.setTitle("Window");
    window.setDefaultSize(200, 200);

    const button = Gtk.Button.newWithLabel("Hello World");
    button.on("clicked", printHello);

    window.setChild(button);
    window.show();
    window.present();
  }
  await new Promise((resolve) => setTimeout(resolve, 300000000));
});
