import type { Extension } from "@girs/gnome-shell/extensions/extension";
import type Meta from "gi://Meta";
import type Shell from "gi://Shell";
import type {
  Notification,
  Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";

import JunkNotificationCleaner from "../src/extension.js";

declare const global: Shell.Global;

Object.assign(global, {
  display: { connect: vi.fn(), disconnect: vi.fn() },
  window_manager: { connect: vi.fn(), disconnect: vi.fn() },
  log: vi.fn(),
});

const settings = {
  get_boolean: vi.fn(),
  get_strv: vi.fn(),
  get_string: vi.fn(),
};

const windowTracker = {
  get_window_app: vi.fn(),
};

vi.mock("resource:///org/gnome/shell/extensions/extension.js", () => ({
  Extension: class MockExtension {
    metadata: Extension["metadata"];
    constructor(metadata: Extension["metadata"]) {
      this.metadata = metadata;
    }
    getSettings = vi.fn(() => settings);
  },
}));

vi.mock("gi://Gio");
vi.mock("gi://Meta");
vi.mock("gi://Shell", () => ({
  default: {
    WindowTracker: {
      get_default: () => windowTracker,
    },
  },
}));
const { MockNotificationApplicationPolicy } = vi.hoisted(() => ({
  MockNotificationApplicationPolicy: class {
    constructor(public id: string) {}
  },
}));
vi.mock("resource:///org/gnome/shell/ui/messageTray.js", () => ({
  NotificationApplicationPolicy: MockNotificationApplicationPolicy,
}));

vi.mock("resource:///org/gnome/shell/ui/main.js", () => ({
  messageTray: {
    getSources: vi.fn(),
  },
}));

import { messageTray } from "resource:///org/gnome/shell/ui/main.js";

const APP_ID = "com.app.test";

function makeApp(id: string = APP_ID, name = "Test App") {
  return { id, get_name: () => name } as unknown as Shell.App;
}

function makeSource(overrides: Partial<Source> = {}, policyId = APP_ID) {
  return {
    title: "Test",
    notifications: [],
    policy: new MockNotificationApplicationPolicy(policyId),
    ...overrides,
  } as Partial<Source> as Source;
}

function setupFocus({
  enabled = true,
  excludedApps = [] as string[],
  sources = [] as Source[],
} = {}) {
  extension.enable();
  settings.get_boolean.mockReturnValueOnce(enabled);
  settings.get_strv.mockReturnValueOnce(excludedApps);
  vi.mocked(messageTray.getSources).mockReturnValueOnce(sources);
  return vi.mocked(global.display.connect).mock.calls[0][1];
}

function setupClose({
  enabled = true,
  excludedApps = [] as string[],
  sources = [] as Source[],
} = {}) {
  extension.enable();
  settings.get_boolean.mockReturnValueOnce(enabled);
  settings.get_strv.mockReturnValueOnce(excludedApps);
  vi.mocked(messageTray.getSources).mockReturnValueOnce(sources);
  return vi.mocked(global.window_manager.connect).mock.calls[0][1];
}

let extension: JunkNotificationCleaner;

beforeEach(() => {
  settings.get_string.mockReturnValue("debug");
  windowTracker.get_window_app.mockReturnValue(makeApp());
  extension = new JunkNotificationCleaner({
    uuid: "uuid",
    path: "path",
    name: "name",
    description: "description",
    "shell-version": ["44", "45", "46"],
  });
});

describe(JunkNotificationCleaner.prototype.enable.name, () => {
  it("should connect to display and window_manager", () => {
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
    const notification = {
      destroy: vi.fn(),
    } as Partial<Notification> as Notification;
    const source = makeSource({ title: "Test", notifications: [notification] });
    const onFocusWindow = setupFocus({ excludedApps, sources: [source] });
    onFocusWindow({
      focusWindow: { title: "Test", wmClass } as Meta.Window,
    });

    expect(notification.destroy).toHaveBeenCalledTimes(1);
    expect(messageTray.getSources).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenNthCalledWith(
      1,
      `[uuid][debug] Window(Title: 'Test', WMClass: '${wmClass}', AppId: '${APP_ID}'): received focus`,
    );
    expect(log).toHaveBeenLastCalledWith(
      `[uuid][info] Window(Title: 'Test', WMClass: '${wmClass}', AppId: '${APP_ID}'): Source(Title: 'Test', PolicyId: '${APP_ID}'): removed notification`,
    );
  },
);

it("should clear notifications for app on close", () => {
  const notification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const source = makeSource({ title: "Test", notifications: [notification] });
  const onCloseWindow = setupClose({ sources: [source] });
  onCloseWindow(
    {},
    {
      metaWindow: { title: "Test" },
    },
  );

  expect(notification.destroy).toHaveBeenCalledTimes(1);
});

const focusWindowArg = { focusWindow: { title: "Test" } };

it("should not clear notifications for sources whose policy id does not match", () => {
  const appNotification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const otherNotification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const appSource = makeSource(
    { title: "Test", notifications: [appNotification] },
    APP_ID,
  );
  const otherSource = makeSource(
    { title: "Other", notifications: [otherNotification] },
    "com.app.other",
  );
  const onFocusWindow = setupFocus({ sources: [appSource, otherSource] });
  onFocusWindow(focusWindowArg);

  expect(appNotification.destroy).toHaveBeenCalledTimes(1);
  expect(otherNotification.destroy).not.toHaveBeenCalled();
  expect(messageTray.getSources).toHaveBeenCalledTimes(1);
});

it("should strip the .desktop suffix from app id when matching policy id", () => {
  const notification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const source = makeSource({ notifications: [notification] }, APP_ID);
  windowTracker.get_window_app.mockReturnValue(makeApp(`${APP_ID}.desktop`));
  const onFocusWindow = setupFocus({ sources: [source] });
  onFocusWindow(focusWindowArg);

  expect(notification.destroy).toHaveBeenCalledTimes(1);
});

it("should skip transient notifications", () => {
  const transient = {
    isTransient: true,
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const persistent = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const source = makeSource({ notifications: [transient, persistent] });
  const onFocusWindow = setupFocus({ sources: [source] });
  onFocusWindow(focusWindowArg);

  expect(transient.destroy).not.toHaveBeenCalled();
  expect(persistent.destroy).toHaveBeenCalledTimes(1);
});

it.each([
  { name: "clear", title: "Test App", appName: "Test App", called: 1 },
  { name: "skip", title: "Other", appName: "Test App", called: 0 },
  { name: "skip", title: "", appName: "", called: 0 },
])(
  "should $name non-app-policy sources based on title matching the app name",
  ({ title, appName, called }) => {
    windowTracker.get_window_app.mockReturnValue(makeApp(APP_ID, appName));
    const notification = {
      destroy: vi.fn(),
    } as Partial<Notification> as Notification;
    const source = {
      title,
      notifications: [notification],
      policy: { id: "generic" },
    } as unknown as Source;
    const onFocusWindow = setupFocus({ sources: [source] });
    onFocusWindow(focusWindowArg);

    expect(notification.destroy).toHaveBeenCalledTimes(called);
  },
);

it("should bail out and log when no app is associated with the window", () => {
  windowTracker.get_window_app.mockReturnValueOnce(null);
  const onFocusWindow = setupFocus();
  onFocusWindow(focusWindowArg);

  expect(messageTray.getSources).not.toHaveBeenCalled();
  expect(log).toHaveBeenLastCalledWith(
    "[uuid][debug] Window(Title: 'Test'): no app associated with window",
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
    const onFocusWindow = setupFocus({ excludedApps });
    onFocusWindow({
      focusWindow: { title: "Test", wmClass } as Meta.Window,
    });

    expect(messageTray.getSources).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith(
      `[uuid][debug] Window(Title: 'Test', WMClass: '${wmClass}', AppId: '${APP_ID}'): excluded by '${excludedApps[0]}'`,
    );
  },
);

it("should log warning and continue for invalid excluded app regex", () => {
  const onFocusWindow = setupFocus({
    excludedApps: ["[invalid", "com\\.app\\.test"],
  });
  onFocusWindow({
    focusWindow: { title: "Test", wmClass: "com.app.test" } as Meta.Window,
  });

  expect(messageTray.getSources).not.toHaveBeenCalled();
  expect(log).toHaveBeenNthCalledWith(
    2,
    `[uuid][warn] Window(Title: 'Test', WMClass: 'com.app.test', AppId: '${APP_ID}'): invalid regex '[invalid'`,
  );
});

it("should treat null wmClass as no match against excluded apps", () => {
  const onFocusWindow = setupFocus({ excludedApps: ["com\\.app\\.test"] });
  onFocusWindow({
    focusWindow: { title: "Test", wmClass: null } as unknown as Meta.Window,
  });

  expect(messageTray.getSources).toHaveBeenCalledTimes(1);
});

it("should not clear notifications for app on focus if not enabled", () => {
  const onFocusWindow = setupFocus({ enabled: false });
  onFocusWindow({});

  expect(settings.get_strv).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("should not clear notifications for app on close if not enabled", () => {
  const onCloseWindow = setupClose({ enabled: false });
  onCloseWindow({}, {});

  expect(settings.get_strv).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});
