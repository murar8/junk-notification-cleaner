import type { Extension } from "@girs/gnome-shell/extensions/extension";
import type Meta from "gi://Meta";
import type Shell from "gi://Shell";
import type {
  Notification,
  Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";

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

const tracker = { get_window_app: vi.fn() };

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
    WindowTracker: { get_default: () => tracker },
  },
}));

vi.mock("resource:///org/gnome/shell/ui/messageTray.js", () => {
  class NotificationApplicationPolicy {
    constructor(public id: string) {}
  }
  class NotificationGenericPolicy {}
  return { NotificationApplicationPolicy, NotificationGenericPolicy };
});

vi.mock("resource:///org/gnome/shell/ui/main.js", () => ({
  messageTray: {
    getSources: vi.fn(),
  },
}));

import JunkNotificationCleaner from "../src/extension.js";
import { messageTray } from "resource:///org/gnome/shell/ui/main.js";
import {
  NotificationApplicationPolicy,
  NotificationGenericPolicy,
} from "resource:///org/gnome/shell/ui/messageTray.js";

function mockApp(id: string): Shell.App {
  return { get_id: () => id } as Shell.App;
}

function mockNotification(): Notification {
  return { destroy: vi.fn() } as Partial<Notification> as Notification;
}

function mockWindow(props: Partial<Meta.Window> = {}): Meta.Window {
  return { title: "Slack", wmClass: "slack", ...props } as Meta.Window;
}

function mockSource(props: {
  title: string;
  notifications: Notification[];
  appId?: string | null;
}): Source {
  const policy =
    props.appId == null
      ? new NotificationGenericPolicy()
      : new NotificationApplicationPolicy(props.appId);
  return {
    title: props.title,
    notifications: props.notifications,
    policy,
  } as Partial<Source> as Source;
}

function triggerFocus(focusWindow: Meta.Window | null = mockWindow()) {
  const handler = vi.mocked(global.display.connect).mock.calls[0][1];
  handler({ focusWindow });
}

function triggerClose(metaWindow: Meta.Window | null = mockWindow()) {
  const handler = vi.mocked(global.window_manager.connect).mock.calls[0][1];
  handler({}, { metaWindow });
}

let extension: JunkNotificationCleaner;

beforeEach(() => {
  settings.get_string.mockReturnValue("debug");
  settings.get_boolean.mockReturnValue(true);
  settings.get_strv.mockReturnValue([]);
  vi.mocked(messageTray.getSources).mockReturnValue([]);
  tracker.get_window_app.mockReturnValue(null);
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

describe("clearNotificationsForApp", () => {
  beforeEach(() => {
    extension.enable();
  });

  it("should clear notifications for app on focus", () => {
    const notification = mockNotification();
    vi.mocked(messageTray.getSources).mockReturnValueOnce([
      mockSource({
        title: "Slack",
        notifications: [notification],
        appId: "com.slack.Slack",
      }),
    ]);
    tracker.get_window_app.mockReturnValueOnce(
      mockApp("com.slack.Slack.desktop"),
    );

    triggerFocus();

    expect(settings.get_boolean).toHaveBeenCalledWith("delete-on-focus");
    expect(settings.get_strv).toHaveBeenCalledWith("excluded-apps");
    expect(notification.destroy).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenNthCalledWith(
      1,
      "[uuid][debug] Window(Title: 'Slack', WMClass: 'slack', AppId: 'com.slack.Slack'): received focus",
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      "[uuid][debug] Window(Title: 'Slack', WMClass: 'slack', AppId: 'com.slack.Slack'): Source(Title: 'Slack', AppId: 'com.slack.Slack'): found persistent notification",
    );
    expect(log).toHaveBeenNthCalledWith(
      3,
      "[uuid][info] Window(Title: 'Slack', WMClass: 'slack', AppId: 'com.slack.Slack'): Source(Title: 'Slack', AppId: 'com.slack.Slack'): removed notification",
    );
  });

  it("should clear notifications for app on close", () => {
    const notification = mockNotification();
    vi.mocked(messageTray.getSources).mockReturnValueOnce([
      mockSource({
        title: "Slack",
        notifications: [notification],
        appId: "com.slack.Slack",
      }),
    ]);
    tracker.get_window_app.mockReturnValueOnce(
      mockApp("com.slack.Slack.desktop"),
    );

    triggerClose();

    expect(settings.get_boolean).toHaveBeenCalledWith("delete-on-close");
    expect(notification.destroy).toHaveBeenCalledTimes(1);
  });

  it("should not clear notifications for other apps", () => {
    const appNotification = mockNotification();
    const otherNotification = mockNotification();
    vi.mocked(messageTray.getSources).mockReturnValueOnce([
      mockSource({
        title: "Slack",
        notifications: [appNotification],
        appId: "com.slack.Slack",
      }),
      mockSource({
        title: "Discord",
        notifications: [otherNotification],
        appId: "com.discord.Discord",
      }),
    ]);
    tracker.get_window_app.mockReturnValueOnce(
      mockApp("com.slack.Slack.desktop"),
    );

    triggerFocus();

    expect(appNotification.destroy).toHaveBeenCalledTimes(1);
    expect(otherNotification.destroy).not.toHaveBeenCalled();
  });

  it("should not clear notifications when source has no resolvable app", () => {
    const notification = mockNotification();
    vi.mocked(messageTray.getSources).mockReturnValueOnce([
      mockSource({
        title: "notify-send",
        notifications: [notification],
        appId: null,
      }),
    ]);
    tracker.get_window_app.mockReturnValueOnce(
      mockApp("com.slack.Slack.desktop"),
    );

    triggerFocus();

    expect(notification.destroy).not.toHaveBeenCalled();
  });

  it("should not clear notifications when window has no resolvable app", () => {
    const notification = mockNotification();
    vi.mocked(messageTray.getSources).mockReturnValueOnce([
      mockSource({
        title: "Slack",
        notifications: [notification],
        appId: "com.slack.Slack",
      }),
    ]);

    triggerFocus();

    expect(notification.destroy).not.toHaveBeenCalled();
  });

  it.each([
    { wmClass: "com.app.test", excludedApps: ["com.app.test"] },
    { wmClass: "com.app.test", excludedApps: ["com\\.app\\.test"] },
    { wmClass: "com.app.test", excludedApps: ["\\w+\\.\\w+\\.\\w+"] },
  ])(
    "should not clear notifications for excluded apps",
    ({ wmClass, excludedApps }) => {
      settings.get_strv.mockReturnValueOnce(excludedApps);
      tracker.get_window_app.mockReturnValueOnce(
        mockApp("com.app.test.desktop"),
      );

      triggerFocus(mockWindow({ title: "Test", wmClass }));

      expect(messageTray.getSources).not.toHaveBeenCalled();
    },
  );

  it("should log warning and continue for invalid excluded app regex", () => {
    settings.get_strv.mockReturnValueOnce(["[invalid", "com\\.app\\.test"]);
    tracker.get_window_app.mockReturnValueOnce(mockApp("com.app.test.desktop"));

    triggerFocus(mockWindow({ title: "Test", wmClass: "com.app.test" }));

    expect(messageTray.getSources).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("invalid regex '[invalid'"),
    );
  });

  it("should not clear notifications for app on focus if not enabled", () => {
    settings.get_boolean.mockReturnValueOnce(false);

    triggerFocus();

    expect(settings.get_strv).not.toHaveBeenCalled();
    expect(messageTray.getSources).not.toHaveBeenCalled();
  });

  it("should not clear notifications for app on close if not enabled", () => {
    settings.get_boolean.mockReturnValueOnce(false);

    triggerClose();

    expect(settings.get_strv).not.toHaveBeenCalled();
    expect(messageTray.getSources).not.toHaveBeenCalled();
  });
});
