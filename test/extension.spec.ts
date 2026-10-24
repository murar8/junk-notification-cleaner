import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import type Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { NotificationApplicationPolicy } from "resource:///org/gnome/shell/ui/messageTray.js";
import JunkNotificationCleaner from "../src/extension.js";

vi.mock("gi://Shell", () => {
  const tracker = { get_window_app: vi.fn() };
  return { default: { WindowTracker: { get_default: () => tracker } } };
});

vi.mock("resource:///org/gnome/shell/ui/main.js", () => ({
  messageTray: { getSources: vi.fn() },
}));

vi.mock("resource:///org/gnome/shell/extensions/extension.js", () => {
  class FakeExtension implements Pick<Extension, "metadata" | "getSettings"> {
    declare getSettings: Extension["getSettings"];
    constructor(public metadata: Extension["metadata"]) {}
  }
  FakeExtension.prototype.getSettings = vi.fn();
  return { Extension: FakeExtension };
});

vi.mock("resource:///org/gnome/shell/ui/messageTray.js", () => ({
  NotificationApplicationPolicy: class {
    constructor(public id: string) {}
  },
}));

type Callback = (...args: unknown[]) => void;

class FakeEmitter implements Pick<
  Shell.Global["display"] & Shell.Global["window_manager"],
  "connectObject" | "disconnectObject"
> {
  private handlers: { signal: string; cb: Callback; owner: object }[] = [];
  connectObject(signal: string, cb: Callback, owner: object) {
    this.handlers.push({ signal, cb, owner });
  }
  disconnectObject(owner: object) {
    this.handlers = this.handlers.filter((h) => h.owner !== owner);
  }
  isConnected(owner: object) {
    return this.handlers.some((h) => h.owner === owner);
  }
  emit(signal: string, ...args: unknown[]) {
    for (const h of this.handlers) if (h.signal === signal) h.cb(...args);
  }
}

const global = {
  display: new FakeEmitter(),
  window_manager: new FakeEmitter(),
};
vi.stubGlobal("global", global);
const log = vi.fn();
vi.stubGlobal("log", log);

const getSources = vi.mocked(Main.messageTray.getSources, {
  partial: true,
  deep: true,
});
const getWindowApp = vi.mocked<(window: Meta.Window) => Shell.App | null>(
  Shell.WindowTracker.get_default().get_window_app,
  { partial: true, deep: true },
);
const getSettings = vi.mocked(Extension.prototype.getSettings, {
  partial: true,
  deep: true,
});
let ext: JunkNotificationCleaner;

beforeEach(() => {
  getWindowApp.mockReturnValue({
    id: "org.gnome.clocks.desktop",
    get_name: () => "Clocks",
  });
  mockSettings({});

  ext = new JunkNotificationCleaner({
    uuid: "test",
    name: "",
    description: "",
    "shell-version": [],
  });
});

function mockSettings({
  excluded = [],
  off,
  level = 0,
}: {
  excluded?: string[];
  off?: string;
  level?: number;
}) {
  getSettings.mockReturnValue({
    get_boolean: (k: string) => k !== off,
    get_enum: () => level,
    get_strv: () => excluded,
  });
}

function notification(extra = {}) {
  return { title: "hi", destroy: vi.fn(), ...extra };
}

function mockSources(
  n: object,
  source: object = {
    policy: new NotificationApplicationPolicy("org.gnome.clocks"),
  },
) {
  getSources.mockReturnValue([{ ...source, notifications: [n] }]);
}

function focus(focusWindow: object | null = { title: "Clocks" }) {
  ext.enable();
  global.display.emit("notify::focus-window", { focusWindow });
}

function close(metaWindow: object | null = { title: "Clocks" }) {
  ext.enable();
  global.window_manager.emit("destroy", null, { metaWindow });
}

const triggers = [
  ["focus", focus],
  ["close", close],
] as const;

afterEach(() => {
  ext.disable();
});

it.each(triggers)(
  "removes notification from matching policy on %s",
  (event, trigger) => {
    const n = notification();
    mockSources(n);

    trigger();

    expect(n.destroy).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      `[test][debug] Window(Title: 'Clocks', AppId: 'org.gnome.clocks.desktop', AppName: 'Clocks'): received ${event}`,
    );
  },
);

it("removes all notifications when destroy mutates the source", () => {
  const notifications: object[] = [];
  const destroy = vi.fn(() => notifications.shift());
  notifications.push(notification({ destroy }), notification({ destroy }));
  getSources.mockReturnValue([
    {
      policy: new NotificationApplicationPolicy("org.gnome.clocks"),
      notifications,
    },
  ]);

  focus();

  expect(destroy).toHaveBeenCalledTimes(2);
  expect(notifications).toHaveLength(0);
});

it("handles each source independently", () => {
  const hit = notification();
  const miss = notification();
  getSources.mockReturnValue([
    {
      policy: new NotificationApplicationPolicy("org.gnome.Solanum"),
      notifications: [miss],
    },
    {
      policy: new NotificationApplicationPolicy("org.gnome.clocks"),
      notifications: [hit],
    },
  ]);

  focus();

  expect(hit.destroy).toHaveBeenCalledOnce();
  expect(miss.destroy).not.toHaveBeenCalled();
});

it("labels untitled notification and source title", () => {
  mockSources(notification({ title: null }), {
    app: { id: "org.gnome.clocks.desktop" },
    title: "Clocks",
  });

  focus();

  expect(log).toHaveBeenCalledWith(
    "[test][info] Window(Title: 'Clocks', AppId: 'org.gnome.clocks.desktop', AppName: 'Clocks'): Source(AppId: 'org.gnome.clocks.desktop', Title: 'Clocks'): removed notification: (untitled notification)",
  );
});

it("removes notification from policy matching window gtkApplicationId", () => {
  const n = notification();
  mockSources(n, {
    policy: new NotificationApplicationPolicy("com.mitchellh.ghostty"),
  });
  getWindowApp.mockReturnValue({
    id: "ghostty_ghostty.desktop",
    get_name: () => "Ghostty",
  });

  focus({ title: "sh", gtkApplicationId: "com.mitchellh.ghostty" });

  expect(n.destroy).toHaveBeenCalledOnce();
});

it("keeps notification from non-matching policy", () => {
  const n = notification();
  mockSources(n, {
    policy: new NotificationApplicationPolicy("org.gnome.Solanum"),
  });

  focus({ title: "Clocks", gtkApplicationId: "com.mitchellh.ghostty" });

  expect(n.destroy).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(
    "[test][debug] Window(Title: 'Clocks', AppId: 'org.gnome.clocks.desktop', AppName: 'Clocks'): Source(PolicyId: 'org.gnome.Solanum'): found persistent notification: hi",
  );
});

it("removes notification from source with matching window-backed app", () => {
  const n = notification();
  mockSources(n, { app: { id: "window:91" }, title: "cursor" });
  getWindowApp.mockReturnValue({ id: "window:91", get_name: () => "cursor" });

  focus({ title: "Cursor Agents" });

  expect(n.destroy).toHaveBeenCalledOnce();
});

it.each([
  ["different", { app: { id: "org.gnome.Solanum.desktop" } }],
  ["missing", {}],
])("keeps notification from source with %s app", (_, source) => {
  const n = notification();
  mockSources(n, source);

  focus();

  expect(n.destroy).not.toHaveBeenCalled();
});

it.each([
  ["transient", { isTransient: true }],
  ["resident", { resident: true }],
])("keeps %s notification", (kind, extra) => {
  const n = notification(extra);
  mockSources(n);

  focus();

  expect(n.destroy).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(
    `[test][debug] Window(Title: 'Clocks', AppId: 'org.gnome.clocks.desktop', AppName: 'Clocks'): Source(PolicyId: 'org.gnome.clocks'): found ${kind} notification: hi`,
  );
});

it("keeps notifications of excluded app", () => {
  const n = notification();
  mockSources(n);
  mockSettings({ excluded: ["org.gnome.clocks"] });

  focus();

  expect(n.destroy).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(
    "[test][debug] Window(Title: 'Clocks', AppId: 'org.gnome.clocks.desktop', AppName: 'Clocks'): excluded by app id 'org.gnome.clocks'",
  );
});

it("skips debug logs at info level", () => {
  mockSources(notification());
  mockSettings({ level: 1 });

  focus();

  expect(log).not.toHaveBeenCalledWith(
    expect.stringContaining("[test][debug]"),
  );
  expect(log).toHaveBeenCalledWith(expect.stringContaining("[test][info]"));
});

it("skips info logs at warn level", () => {
  mockSources(notification());
  mockSettings({ level: 2 });

  focus();

  expect(log).not.toHaveBeenCalled();
});

it.each(triggers)("ignores null window on %s", (_, trigger) => {
  const n = notification();
  mockSources(n);

  trigger(null);

  expect(getWindowApp).not.toHaveBeenCalled();
  expect(n.destroy).not.toHaveBeenCalled();
});

it("disconnects signals on disable", () => {
  ext.enable();
  expect(global.display.isConnected(ext)).toBe(true);
  expect(global.window_manager.isConnected(ext)).toBe(true);

  ext.disable();
  expect(global.display.isConnected(ext)).toBe(false);
  expect(global.window_manager.isConnected(ext)).toBe(false);
});

it("keeps notifications when window has no app", () => {
  const n = notification();
  mockSources(n);
  getWindowApp.mockReturnValue(null);

  focus({ title: "Clocks", gtkApplicationId: "org.gnome.clocks" });

  expect(n.destroy).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(
    "[test][debug] Window(Title: 'Clocks'): no app associated with window",
  );
});

it.each(triggers)(
  "keeps notifications when delete-on-%s is off",
  (event, trigger) => {
    const n = notification();
    mockSources(n);
    mockSettings({ off: `delete-on-${event}` });

    trigger();

    expect(n.destroy).not.toHaveBeenCalled();
  },
);
