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
])("should NOT match when $description", ({ window, source }) => {
  expect(isMatch(window, source)).toBe(false);
});
