import { isMatch } from "../src/isMatch.js";

test.each<{
  description: string;
  window: (typeof isMatch)["arguments"][0];
  source: (typeof isMatch)["arguments"][1];
}>([
  {
    description: "gtkApplicationId and icon",
    window: {
      gtkApplicationId: "com.slack.Slack",
      get_sandboxed_app_id: () => "com.slack.Slack",
      wmClass: "slack",
      title: "Slack",
    },
    source: {
      title: "Slack",
      icon: {
        to_string: () => "com.slack.Slack",
      },
    },
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
      icon: {
        to_string: (): string => "com.mitchellh.ghostty",
      },
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
      icon: {
        to_string: (): string => "org.mozilla.firefox",
      },
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
    source: {
      title: "Downloads",
      icon: {
        to_string: () => "firefox",
      },
    },
  },
  {
    description: "exact title with null icon",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "protonmail-bridge",
      title: "Proton Mail Bridge",
    },
    source: {
      title: "Proton Mail Bridge",
      icon: null,
    },
  },
  {
    description: "title pattern extraction",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "cursor",
      title: "isMatch.ts - junk-notification-cleaner - Cursor",
    },
    source: {
      title: "Cursor",
      icon: null,
    },
  },
  {
    description: "exact title with null icon",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "some-app",
      title: "Some Application",
    },
    source: {
      title: "Some Application",
      icon: null,
    },
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
      icon: {
        to_string: () => "org.gnome.TextEditor",
      },
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
    source: {
      title: "Visual Studio Code",
      icon: null,
    },
  },
  {
    description: "title pattern with multiple dashes in app name",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "code",
      title: "main.ts - my-project-name - app-name",
    },
    source: {
      title: "app-name",
      icon: null,
    },
  },
  {
    description: "title pattern with pipe in app name",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "code",
      title: "main.ts - my-project-name - app|name",
    },
    source: {
      title: "app|name",
      icon: null,
    },
  },
  {
    description: "title pattern with pipe as separator",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "code",
      title: "main.ts | my-project-name | app|name",
    },
    source: {
      title: "app|name",
      icon: null,
    },
  },
  {
    description: "exact title when all other identifiers are null",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "",
      title: "Simple App",
    },
    source: {
      title: "Simple App",
      icon: null,
    },
  },
  {
    description:
      "wmClass matching with null gtkApplicationId and sandboxed app id",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "telegram-desktop",
      title: "Telegram",
    },
    source: {
      title: "Different Title",
      icon: {
        to_string: () => "telegram-desktop",
      },
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
    source: {
      title: "Firefox",
      icon: null,
    },
  },
  {
    description: "title pattern with extra whitespace in title",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "editor",
      title: "file.txt - project - VSCode   App",
    },
    source: {
      title: "VSCode   App",
      icon: null,
    },
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
      icon: {
        to_string: () => "org.gnome.Calculator",
      },
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
      icon: {
        to_string: () => "com.spotify.Client",
      },
    },
  },
  {
    description: "Firefox sandboxed app with file path icon",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => "firefox_firefox",
      wmClass: "firefox_firefox",
      title:
        "HTML5 Web Notifications Test - Bennish.net — Perfil original — Mozilla Firefox",
    },
    source: {
      title: "Firefox",
      icon: {
        to_string: () => "/snap/firefox/6638/default256.png",
      },
    },
  },
  {
    description: "source title is the same as the window manager class",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "thunderbird",
      title: "Calendario - Mozilla Thunderbird",
    },
    source: {
      title: "thunderbird",
      icon: null,
    },
  },
  {
    description: "Discord snap - source title matches wmClass lowercase",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => "discord_discord",
      wmClass: "discord_discord",
      title: "Amici - Discord",
    },
    source: {
      title: "discord",
      icon: null,
    },
  },
  {
    description: "Discord with channel title pattern",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => "discord_discord",
      wmClass: "discord_discord",
      title: "#💬︱general | Character.AI - Discord",
    },
    source: {
      title: "Discord",
      icon: null,
    },
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
      icon: {
        to_string: () => "com.mitchellh.ghostty",
      },
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
    source: {
      title: "Google Chrome",
      icon: null,
    },
  },
  {
    description: "Complex WMClass with dashes (xdg-desktop-portal-gnome)",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "xdg-desktop-portal-gnome",
      title: "Compartición de pantalla",
    },
    source: {
      title: "Screen Share",
      icon: {
        to_string: () => "xdg-desktop-portal-gnome",
      },
    },
  },
  {
    description: "Slack with channel title pattern",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => "com.slack.Slack",
      wmClass: "com.slack.Slack",
      title: "product-team-status (Canal) - Koda Health - Slack",
    },
    source: {
      title: "Slack",
      icon: {
        to_string: () => "com.slack.Slack",
      },
    },
  },
])("should match by $description", ({ window, source }) => {
  expect(isMatch(window, source)).toBe(true);
});

test.each<{
  description: string;
  window: (typeof isMatch)["arguments"][0];
  source: (typeof isMatch)["arguments"][1];
}>([
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
      icon: {
        to_string: () => "com.discord.Discord",
      },
    },
  },
  {
    description: "different applications with different identifiers",
    window: {
      gtkApplicationId: "com.example.App",
      get_sandboxed_app_id: () => null,
      wmClass: "example-app",
      title: "Example App",
    },
    source: {
      title: "Different App",
      icon: {
        to_string: () => "com.different.App",
      },
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
    source: {
      title: "Different Title",
      icon: null,
    },
  },
  {
    description: "simple title without pattern format",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "some-app",
      title: "Just a simple title without dashes",
    },
    source: {
      title: "Different App",
      icon: null,
    },
  },
  {
    description: "title pattern but source does not match extracted part",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "editor",
      title: "file.txt - MyProject - VSCode",
    },
    source: {
      title: "Atom",
      icon: null,
    },
  },
  {
    description: "source with icon but no matching criteria",
    window: {
      gtkApplicationId: "com.app.One",
      get_sandboxed_app_id: () => "com.app.One",
      wmClass: "app-one",
      title: "App One",
    },
    source: {
      title: "App Two",
      icon: {
        to_string: () => "com.app.Two",
      },
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
    source: {
      title: "",
      icon: null,
    },
  },
  {
    description: "source icon returns empty string",
    window: {
      gtkApplicationId: "com.example.App",
      get_sandboxed_app_id: () => null,
      wmClass: "example",
      title: "Example",
    },
    source: {
      title: "Different",
      icon: {
        to_string: () => "",
      },
    },
  },
  {
    description: "title pattern with pipe as separator but wrong match",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "code",
      title: "main.ts | my-project-name | app|name",
    },
    source: {
      title: "name",
      icon: null,
    },
  },
  {
    description: "case sensitivity - different case in gtkApplicationId",
    window: {
      gtkApplicationId: "com.slack.Slack",
      get_sandboxed_app_id: () => null,
      wmClass: "slack",
      title: "Slack",
    },
    source: {
      title: "Different",
      icon: {
        to_string: () => "com.slack.slack",
      },
    },
  },
  {
    description: "case sensitivity - different case in title",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "app",
      title: "My Application",
    },
    source: {
      title: "my application",
      icon: null,
    },
  },
  {
    description: "title pattern with only one part",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "app",
      title: "SingleTitle",
    },
    source: {
      title: "DifferentApp",
      icon: null,
    },
  },
  {
    description: "title pattern with empty extracted part",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "app",
      title: "file.txt - project - ",
    },
    source: {
      title: "SomeApp",
      icon: null,
    },
  },
  {
    description: "whitespace-only source title",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "app",
      title: "Application",
    },
    source: {
      title: "   ",
      icon: null,
    },
  },
  {
    description: "window title is empty string",
    window: {
      gtkApplicationId: null,
      get_sandboxed_app_id: () => null,
      wmClass: "app",
      title: "",
    },
    source: {
      title: "SomeApp",
      icon: null,
    },
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
      icon: {
        to_string: () => "com.example.App",
      },
    },
  },
])("should NOT match when $description", ({ window, source }) => {
  expect(isMatch(window, source)).toBe(false);
});
