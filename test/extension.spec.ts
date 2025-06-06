import type { ExtensionMetadata } from "@girs/gnome-shell/extensions/extension";
import type Meta from "gi://Meta";
import type {
  Notification,
  Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";

import JunkNotificationCleaner from "../src/extension.js";

Object.assign(global, {
  display: { connect: vi.fn(), disconnect: vi.fn() },
  window_manager: { connect: vi.fn(), disconnect: vi.fn() },
  log: vi.fn(),
});

const settings = { get_boolean: vi.fn(), get_strv: vi.fn() };
vi.mock("resource:///org/gnome/shell/extensions/extension.js", () => ({
  Extension: class MockExtension {
    getSettings = vi.fn(() => settings);
  },
}));

vi.mock("gi://Gio");
vi.mock("gi://Meta");
vi.mock("resource:///org/gnome/shell/ui/messageTray.js");

vi.mock("resource:///org/gnome/shell/ui/main.js", () => ({
  messageTray: {
    getSources: vi.fn(),
  },
}));

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { messageTray } from "resource:///org/gnome/shell/ui/main.js";

let extension: JunkNotificationCleaner;

beforeEach(() => {
  extension = new JunkNotificationCleaner({
    uuid: "uuid",
    path: "path",
    name: "name",
    description: "description",
    "shell-version": ["44", "45", "46"],
  } as ExtensionMetadata);
});

describe(JunkNotificationCleaner.prototype.enable.name, () => {
  it("should connect to display and window_manager", () => {
    vi.mocked(Extension.prototype.getSettings);
    extension.enable();
    expect(global.display.connect).toHaveBeenCalledTimes(1);
    expect(global.display.connect).toHaveBeenCalledWith(
      "notify::focus-window",
      expect.any(Function),
    );
    expect(global.window_manager.connect).toHaveBeenCalledTimes(1);
    expect(global.window_manager.connect).toHaveBeenCalledWith(
      "destroy",
      expect.any(Function),
    );
  });
});

describe(JunkNotificationCleaner.prototype.disable.name, () => {
  beforeEach(() => {
    vi.mocked(global.display.connect).mockReturnValueOnce(100);
    vi.mocked(global.window_manager.connect).mockReturnValueOnce(200);
  });

  it("should disconnect from display and window_manager", () => {
    extension.enable();
    extension.disable();
    expect(global.display.disconnect).toHaveBeenCalledTimes(1);
    expect(global.window_manager.disconnect).toHaveBeenCalledTimes(1);
    expect(global.display.disconnect).toHaveBeenCalledWith(100);
    expect(global.window_manager.disconnect).toHaveBeenCalledWith(200);
  });

  it("should not disconnect from display and window_manager if not enabled", () => {
    extension.disable();
    expect(global.display.disconnect).not.toHaveBeenCalled();
    expect(global.window_manager.disconnect).not.toHaveBeenCalled();
  });
});

it.each([
  {
    wmClass: "com.app.test",
    excludedApps: [],
  },
  {
    wmClass: "com.app.test",
    excludedApps: ["com.app.test1", "\\com\\.app\\.tes$"],
  },
])(
  "should clear notifications for app on focus",
  ({ wmClass, excludedApps }) => {
    extension.enable();
    settings.get_boolean.mockReturnValueOnce(true);
    settings.get_strv.mockReturnValueOnce(excludedApps);
    const notification = {
      destroy: vi.fn(),
    } as Partial<Notification> as Notification;
    const source = {
      title: "Test",
      notifications: [notification],
    } as Partial<Source> as Source;
    vi.mocked(messageTray.getSources).mockReturnValueOnce([source]);

    const onFocusWindow = vi.mocked(global.display.connect).mock.calls[0][1];
    const focusWindow = {
      title: "Test",
      wmClass,
      get_sandboxed_app_id: () => {},
    } as Meta.Window;
    const display = {
      focusWindow,
    } as Meta.Display;
    onFocusWindow(display);

    expect(settings.get_boolean).toHaveBeenCalledTimes(1);
    expect(settings.get_boolean).toHaveBeenCalledWith("delete-on-focus");
    expect(settings.get_strv).toHaveBeenCalledTimes(1);
    expect(settings.get_strv).toHaveBeenCalledWith("excluded-apps");
    expect(notification.destroy).toHaveBeenCalledTimes(1);
    expect(messageTray.getSources).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenNthCalledWith(
      1,
      `Window(Title: 'Test', WMClass: '${wmClass}', GTKAppId: '<empty>', SandboxedAppId: '<empty>'): focus received, clearing notifications`,
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      `Window(Title: 'Test', WMClass: '${wmClass}', GTKAppId: '<empty>', SandboxedAppId: '<empty>'): clearing notification for Source(Title: 'Test', Icon: '<empty>')`,
    );
  },
);

it("should clear notifications for app on close", () => {
  extension.enable();
  settings.get_boolean.mockReturnValueOnce(true);
  settings.get_strv.mockReturnValueOnce([]);
  const notification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const source = {
    title: "Test",
    notifications: [notification],
  } as Partial<Source> as Source;
  vi.mocked(messageTray.getSources).mockReturnValueOnce([source]);

  const onCloseWindow = vi.mocked(global.window_manager.connect).mock
    .calls[0][1];
  const metaWindow = {
    title: "Test",
    get_sandboxed_app_id: () => {},
  } as Meta.Window;
  const windowActor = {
    metaWindow,
  } as Partial<Meta.WindowActor> as Meta.WindowActor;
  onCloseWindow({} as any, windowActor);

  expect(settings.get_boolean).toHaveBeenCalledTimes(1);
  expect(settings.get_boolean).toHaveBeenCalledWith("delete-on-close");
  expect(settings.get_strv).toHaveBeenCalledTimes(1);
  expect(settings.get_strv).toHaveBeenCalledWith("excluded-apps");
  expect(notification.destroy).toHaveBeenCalledTimes(1);
  expect(messageTray.getSources).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenNthCalledWith(
    1,
    "Window(Title: 'Test', WMClass: '<empty>', GTKAppId: '<empty>', SandboxedAppId: '<empty>'): close received, clearing notifications",
  );
  expect(log).toHaveBeenNthCalledWith(
    2,
    "Window(Title: 'Test', WMClass: '<empty>', GTKAppId: '<empty>', SandboxedAppId: '<empty>'): clearing notification for Source(Title: 'Test', Icon: '<empty>')",
  );
});

it("should not clear notifications for other apps", () => {
  extension.enable();
  settings.get_boolean.mockReturnValueOnce(true);
  settings.get_strv.mockReturnValueOnce([]);
  const appNotification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const otherNotification = {
    title: "Other",
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const appSource = {
    // also testing that the source label is correct
    title: "Test",
    notifications: [appNotification],
    icon: {
      to_string: () => "test-icon",
    } as Source["icon"],
  } as Partial<Source> as Source;
  const otherSource = {
    title: "Other",
    notifications: [otherNotification],
  } as Partial<Source> as Source;
  vi.mocked(messageTray.getSources).mockReturnValueOnce([
    appSource,
    otherSource,
  ]);

  const onFocusWindow = vi.mocked(global.display.connect).mock.calls[0][1];
  const focusWindow = {
    title: "Test",
    get_sandboxed_app_id: () => {},
  } as Meta.Window;
  const display = {
    focusWindow,
  } as Meta.Display;
  onFocusWindow(display);

  expect(appNotification.destroy).toHaveBeenCalledTimes(1);
  expect(otherNotification.destroy).not.toHaveBeenCalled();
  expect(messageTray.getSources).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenNthCalledWith(
    1,
    "Window(Title: 'Test', WMClass: '<empty>', GTKAppId: '<empty>', SandboxedAppId: '<empty>'): focus received, clearing notifications",
  );
  expect(log).toHaveBeenNthCalledWith(
    2,
    "Window(Title: 'Test', WMClass: '<empty>', GTKAppId: '<empty>', SandboxedAppId: '<empty>'): clearing notification for Source(Title: 'Test', Icon: 'test-icon')",
  );
});

it.each([
  {
    wmClass: "com.app.test",
    excludedApps: ["com.app.test"],
  },
  {
    wmClass: "com.app.test",
    excludedApps: ["com.app.test", "com.app.other"],
  },
  {
    wmClass: "com.app.test",
    excludedApps: ["com\\.app\\.test"],
  },
  {
    wmClass: "com.app.test",
    excludedApps: ["\\w+\\.\\w+\\.\\w+"],
  },
  {
    wmClass: "jesus.christ",
    excludedApps: ["^(jesus|christ)\\.(jesus|christ)$"],
  },
])(
  "should not clear notifications for excluded apps",
  ({ wmClass, excludedApps }) => {
    extension.enable();
    settings.get_boolean.mockReturnValueOnce(true);
    settings.get_strv.mockReturnValueOnce(excludedApps);
    vi.mocked(messageTray.getSources).mockReturnValueOnce([]);

    const onFocusWindow = vi.mocked(global.display.connect).mock.calls[0][1];
    const focusWindow = {
      // also testing that the window label is correct
      title: "Test",
      wmClass,
      get_sandboxed_app_id: () => "com.app.test.sandboxedId",
      gtkApplicationId: "com.app.test.gtkId",
    } as Meta.Window;
    const display = {
      focusWindow,
    } as Meta.Display;
    onFocusWindow(display);

    expect(messageTray.getSources).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenNthCalledWith(
      1,
      `Window(Title: 'Test', WMClass: '${wmClass}', GTKAppId: 'com.app.test.gtkId', SandboxedAppId: 'com.app.test.sandboxedId'): focus received, clearing notifications`,
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      `Window(Title: 'Test', WMClass: '${wmClass}', GTKAppId: 'com.app.test.gtkId', SandboxedAppId: 'com.app.test.sandboxedId'): excluded by ${excludedApps.find(
        (a) => new RegExp(a).exec(focusWindow.wmClass),
      )}`,
    );
  },
);

it("should not clear notifications for app on focus if not enabled", () => {
  extension.enable();
  settings.get_boolean.mockReturnValueOnce(false);
  settings.get_strv.mockReturnValueOnce([]);
  vi.mocked(messageTray.getSources).mockReturnValueOnce([]);

  const onFocusWindow = vi.mocked(global.display.connect).mock.calls[0][1];
  onFocusWindow({} as Meta.Display);

  expect(settings.get_boolean).toHaveBeenCalledTimes(1);
  expect(settings.get_boolean).toHaveBeenCalledWith("delete-on-focus");
  expect(settings.get_strv).not.toHaveBeenCalled();
  expect(messageTray.getSources).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("should not clear notifications for app on close if not enabled", () => {
  extension.enable();
  settings.get_boolean.mockReturnValueOnce(false);
  settings.get_strv.mockReturnValueOnce([]);
  vi.mocked(messageTray.getSources).mockReturnValueOnce([]);

  const onCloseWindow = vi.mocked(global.window_manager.connect).mock
    .calls[0][1];
  onCloseWindow({} as any, {} as Meta.WindowActor);

  expect(settings.get_boolean).toHaveBeenCalledTimes(1);
  expect(settings.get_boolean).toHaveBeenCalledWith("delete-on-close");
  expect(settings.get_strv).not.toHaveBeenCalled();
  expect(messageTray.getSources).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});
