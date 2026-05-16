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
  return { id, get_name: () => name } as Partial<Shell.App> as Shell.App;
}

interface WindowOverrides {
  title?: string | null;
  wmClass?: string;
  gtkApplicationId?: string | null;
  get_sandboxed_app_id?: () => string | null;
}

function makeWindow(overrides: WindowOverrides = {}): Meta.Window {
  return {
    title: "Test",
    get_sandboxed_app_id: () => null,
    ...overrides,
  } as WindowOverrides as Meta.Window;
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
  { excludedApps: [] },
  { excludedApps: ["com.app.other", "com.app.test2"] },
])("should clear notifications for app on focus", ({ excludedApps }) => {
  const notification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const source = makeSource({ title: "Test", notifications: [notification] });
  const onFocusWindow = setupFocus({ excludedApps, sources: [source] });
  onFocusWindow({
    focusWindow: makeWindow({ wmClass: "com.app.test" }),
  });

  expect(notification.destroy).toHaveBeenCalledTimes(1);
  expect(messageTray.getSources).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenNthCalledWith(
    1,
    `[uuid][debug] Window(Title: 'Test', AppId: '${APP_ID}'): received focus`,
  );
  expect(log).toHaveBeenLastCalledWith(
    `[uuid][info] Window(Title: 'Test', AppId: '${APP_ID}'): Source(Title: 'Test', PolicyId: '${APP_ID}'): removed notification: (untitled notification)`,
  );
});

it("should clear notifications for app on close", () => {
  const notification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const source = makeSource({ title: "Test", notifications: [notification] });
  const onCloseWindow = setupClose({ sources: [source] });
  onCloseWindow(
    {},
    {
      metaWindow: makeWindow(),
    },
  );

  expect(notification.destroy).toHaveBeenCalledTimes(1);
});

const focusWindowArg = { focusWindow: makeWindow() };

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
  {
    name: "clear",
    sourceTitle: "Test App",
    windowTitle: "Test App",
    called: 1,
  },
  { name: "skip", sourceTitle: "Other", windowTitle: "Test App", called: 0 },
  { name: "skip", sourceTitle: "", windowTitle: "", called: 0 },
])(
  "should $name non-app-policy sources based on title matching the window title",
  ({ sourceTitle, windowTitle, called }) => {
    const notification = {
      destroy: vi.fn(),
    } as Partial<Notification> as Notification;
    const source = makeSource(
      { title: sourceTitle, notifications: [notification] },
      "generic",
    );
    const onFocusWindow = setupFocus({ sources: [source] });
    onFocusWindow({ focusWindow: makeWindow({ title: windowTitle }) });

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
  { excludedApps: [APP_ID] },
  { excludedApps: [APP_ID, "com.app.other"] },
  { excludedApps: ["com.app.other", APP_ID] },
])("should not clear notifications for excluded apps", ({ excludedApps }) => {
  const onFocusWindow = setupFocus({ excludedApps });
  onFocusWindow({
    focusWindow: makeWindow({ wmClass: "com.app.test" }),
  });

  expect(messageTray.getSources).not.toHaveBeenCalled();
  expect(log).toHaveBeenLastCalledWith(
    `[uuid][debug] Window(Title: 'Test', AppId: '${APP_ID}'): excluded by app id '${APP_ID}'`,
  );
});

it("should match excluded apps after stripping .desktop suffix from app id", () => {
  windowTracker.get_window_app.mockReturnValue(makeApp(`${APP_ID}.desktop`));
  const onFocusWindow = setupFocus({ excludedApps: [APP_ID] });
  onFocusWindow(focusWindowArg);

  expect(messageTray.getSources).not.toHaveBeenCalled();
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

// Heuristic matching: sources without NotificationApplicationPolicy fall
// through to icon/title comparisons against the focused window.
interface HeuristicCase {
  description: string;
  window: {
    gtkApplicationId: string | null;
    get_sandboxed_app_id: () => string | null;
    wmClass: string;
    title: string | null;
  };
  source: {
    title: string;
    icon: { to_string: () => string | null };
  };
}

interface IconStub {
  to_string: () => string | null;
}

function stubIcon(s: IconStub) {
  return s as Partial<Source["icon"]> as Source["icon"];
}

const NO_ICON: IconStub = { to_string: () => null };

function runHeuristic({ window, source }: HeuristicCase) {
  const notification = {
    destroy: vi.fn(),
  } as Partial<Notification> as Notification;
  const src = makeSource(
    { ...source, icon: stubIcon(source.icon), notifications: [notification] },
    "generic",
  );
  const onFocusWindow = setupFocus({ sources: [src] });
  onFocusWindow({ focusWindow: makeWindow(window) });
  return notification.destroy;
}

describe("heuristic match (non-app policy)", () => {
  it.each<HeuristicCase>([
    {
      description: "gtkApplicationId and icon",
      window: {
        gtkApplicationId: "com.slack.Slack",
        get_sandboxed_app_id: () => "com.slack.Slack",
        wmClass: "slack",
        title: "Slack",
      },
      source: { title: "Slack", icon: { to_string: () => "com.slack.Slack" } },
    },
    {
      description: "gtkApplicationId and icon with different titles",
      window: {
        gtkApplicationId: "com.mitchellh.ghostty",
        get_sandboxed_app_id: () => null,
        wmClass: "ghostty",
        title: "Ghostty",
      },
      source: {
        title: "Terminal",
        icon: { to_string: () => "com.mitchellh.ghostty" },
      },
    },
    {
      description: "sandboxed app id and icon",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => "org.mozilla.firefox",
        wmClass: "firefox",
        title: "Firefox",
      },
      source: {
        title: "Browser",
        icon: { to_string: () => "org.mozilla.firefox" },
      },
    },
    {
      description: "wmClass and icon",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "firefox",
        title: "Mozilla Firefox",
      },
      source: { title: "Downloads", icon: { to_string: () => "firefox" } },
    },
    {
      description: "exact title with null icon",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "protonmail-bridge",
        title: "Proton Mail Bridge",
      },
      source: { title: "Proton Mail Bridge", icon: NO_ICON },
    },
    {
      description: "title pattern extraction",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "cursor",
        title: "isMatch.ts - junk-notification-cleaner - Cursor",
      },
      source: { title: "Cursor", icon: NO_ICON },
    },
    {
      description: "gtkApplicationId and title",
      window: {
        gtkApplicationId: "org.gnome.TextEditor",
        get_sandboxed_app_id: () => null,
        wmClass: "text-editor",
        title: "Text Editor",
      },
      source: {
        title: "Text Editor",
        icon: { to_string: () => "org.gnome.TextEditor" },
      },
    },
    {
      description: "title pattern with multiple dashes",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "code",
        title: "main.ts - my-project-name - Visual Studio Code",
      },
      source: { title: "Visual Studio Code", icon: NO_ICON },
    },
    {
      description: "title pattern with multiple dashes in app name",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "code",
        title: "main.ts - my-project-name - app-name",
      },
      source: { title: "app-name", icon: NO_ICON },
    },
    {
      description: "title pattern with pipe in app name",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "code",
        title: "main.ts - my-project-name - app|name",
      },
      source: { title: "app|name", icon: NO_ICON },
    },
    {
      description: "title pattern with pipe as separator",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "code",
        title: "main.ts | my-project-name | app|name",
      },
      source: { title: "app|name", icon: NO_ICON },
    },
    {
      description: "exact title when all other identifiers are null",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "",
        title: "Simple App",
      },
      source: { title: "Simple App", icon: NO_ICON },
    },
    {
      description: "wmClass icon match with different titles",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "telegram-desktop",
        title: "Telegram",
      },
      source: {
        title: "Different Title",
        icon: { to_string: () => "telegram-desktop" },
      },
    },
    {
      description: "title pattern with single dash separator",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "browser",
        title: "Document - Firefox",
      },
      source: { title: "Firefox", icon: NO_ICON },
    },
    {
      description: "title pattern with extra whitespace in title",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "editor",
        title: "file.txt - project - VSCode   App",
      },
      source: { title: "VSCode   App", icon: NO_ICON },
    },
    {
      description: "gtkApplicationId with empty wmClass",
      window: {
        gtkApplicationId: "org.gnome.Calculator",
        get_sandboxed_app_id: () => null,
        wmClass: "",
        title: "Calculator",
      },
      source: {
        title: "Math App",
        icon: { to_string: () => "org.gnome.Calculator" },
      },
    },
    {
      description: "sandboxed app id with empty gtkApplicationId",
      window: {
        gtkApplicationId: "",
        get_sandboxed_app_id: () => "com.spotify.Client",
        wmClass: "spotify",
        title: "Spotify",
      },
      source: {
        title: "Music Player",
        icon: { to_string: () => "com.spotify.Client" },
      },
    },
    {
      description: "Firefox snap with file path icon",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => "firefox_firefox",
        wmClass: "firefox_firefox",
        title: "Notification Test — Mozilla Firefox",
      },
      source: {
        title: "Firefox",
        icon: { to_string: () => "/snap/firefox/6638/default256.png" },
      },
    },
    {
      description: "Thunderbird: source title equals wmClass",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "thunderbird",
        title: "Calendario - Mozilla Thunderbird",
      },
      source: { title: "thunderbird", icon: NO_ICON },
    },
    {
      description: "Discord snap: title_title matches sandboxed id",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => "discord_discord",
        wmClass: "discord_discord",
        title: "Amici - Discord",
      },
      source: { title: "discord", icon: NO_ICON },
    },
    {
      description: "Discord composite channel title",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => "discord_discord",
        wmClass: "discord_discord",
        title: "#general | Character.AI - Discord",
      },
      source: { title: "Discord", icon: NO_ICON },
    },
    {
      description: "Telegram snap with file path icon",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => "telegram-desktop_telegram-desktop",
        wmClass: "telegram-desktop_telegram-desktop",
        title: "Telegram",
      },
      source: {
        title: "Telegram",
        icon: {
          to_string: () => "/snap/telegram-desktop/6767/meta/gui/icon.png",
        },
      },
    },
    {
      description: "Empty window title with gtkApplicationId match",
      window: {
        gtkApplicationId: "com.mitchellh.ghostty",
        get_sandboxed_app_id: () => null,
        wmClass: "com.mitchellh.ghostty",
        title: "",
      },
      source: {
        title: "Ghostty",
        icon: { to_string: () => "com.mitchellh.ghostty" },
      },
    },
    {
      description: "Google Chrome title pattern extraction",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "google-chrome",
        title: "e2e - Google Chrome",
      },
      source: { title: "Google Chrome", icon: NO_ICON },
    },
    {
      description: "xdg-desktop-portal-gnome icon match",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "xdg-desktop-portal-gnome",
        title: "Compartición de pantalla",
      },
      source: {
        title: "Screen Share",
        icon: { to_string: () => "xdg-desktop-portal-gnome" },
      },
    },
    {
      description: "Slack flatpak with channel title",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => "com.slack.Slack",
        wmClass: "com.slack.Slack",
        title: "product-team-status (Canal) - Koda Health - Slack",
      },
      source: {
        title: "Slack",
        icon: { to_string: () => "com.slack.Slack" },
      },
    },
  ])("matches: $description", (kase) => {
    expect(runHeuristic(kase)).toHaveBeenCalledTimes(1);
  });

  it.each<HeuristicCase>([
    {
      description: "different applications with no matching criteria",
      window: {
        gtkApplicationId: "com.slack.Slack",
        get_sandboxed_app_id: () => "com.slack.Slack",
        wmClass: "slack",
        title: "Slack",
      },
      source: {
        title: "Discord",
        icon: { to_string: () => "com.discord.Discord" },
      },
    },
    {
      description: "different identifiers",
      window: {
        gtkApplicationId: "com.example.App",
        get_sandboxed_app_id: () => null,
        wmClass: "example-app",
        title: "Example App",
      },
      source: {
        title: "Different App",
        icon: { to_string: () => "com.different.App" },
      },
    },
    {
      description: "no matching identifiers or titles",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "unknown",
        title: "Unknown Window",
      },
      source: { title: "Different Title", icon: NO_ICON },
    },
    {
      description: "simple title without pattern format",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "some-app",
        title: "Just a simple title without dashes",
      },
      source: { title: "Different App", icon: NO_ICON },
    },
    {
      description: "title pattern but source does not match extracted part",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "editor",
        title: "file.txt - MyProject - VSCode",
      },
      source: { title: "Atom", icon: NO_ICON },
    },
    {
      description: "source icon mismatch",
      window: {
        gtkApplicationId: "com.app.One",
        get_sandboxed_app_id: () => "com.app.One",
        wmClass: "app-one",
        title: "App One",
      },
      source: {
        title: "App Two",
        icon: { to_string: () => "com.app.Two" },
      },
    },
    {
      description: "empty source title and null icon",
      window: {
        gtkApplicationId: "com.example.App",
        get_sandboxed_app_id: () => null,
        wmClass: "example",
        title: "Example",
      },
      source: { title: "", icon: NO_ICON },
    },
    {
      description: "source icon returns empty string",
      window: {
        gtkApplicationId: "com.example.App",
        get_sandboxed_app_id: () => null,
        wmClass: "example",
        title: "Example",
      },
      source: { title: "Different", icon: { to_string: () => "" } },
    },
    {
      description: "title pattern with pipe as separator but wrong match",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "code",
        title: "main.ts | my-project-name | app|name",
      },
      source: { title: "name", icon: NO_ICON },
    },
    {
      description: "case-sensitive gtkApplicationId mismatch",
      window: {
        gtkApplicationId: "com.slack.Slack",
        get_sandboxed_app_id: () => null,
        wmClass: "slack",
        title: "Slack",
      },
      source: {
        title: "Different",
        icon: { to_string: () => "com.slack.slack" },
      },
    },
    {
      description: "case-sensitive title mismatch",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "app",
        title: "My Application",
      },
      source: { title: "my application", icon: NO_ICON },
    },
    {
      description: "title pattern with only one part",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "app",
        title: "SingleTitle",
      },
      source: { title: "DifferentApp", icon: NO_ICON },
    },
    {
      description: "title pattern with empty extracted part",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "app",
        title: "file.txt - project - ",
      },
      source: { title: "SomeApp", icon: NO_ICON },
    },
    {
      description: "whitespace-only source title",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "app",
        title: "Application",
      },
      source: { title: "   ", icon: NO_ICON },
    },
    {
      description: "window title is empty string",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "app",
        title: "",
      },
      source: { title: "SomeApp", icon: NO_ICON },
    },
    {
      description: "window title is null",
      window: {
        gtkApplicationId: null,
        get_sandboxed_app_id: () => null,
        wmClass: "app",
        title: null,
      },
      source: {
        title: "SomeApp",
        icon: { to_string: () => "com.example.App" },
      },
    },
  ])("does not match: $description", (kase) => {
    expect(runHeuristic(kase)).not.toHaveBeenCalled();
  });
});
