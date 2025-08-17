# Junk Notification Cleaner

A GNOME Shell extension that automatically deletes notifications for an application when its window is focused or closed.

## Features

- Automatically delete notifications when an application window is focused.
- Automatically delete notifications when an application window is closed.
- Exclude specific applications from automatic notification cleanup using regex patterns.

## Preferences

You can configure the extension behavior through the GNOME Extensions app or by running:

```
gnome-extensions prefs junk-notification-cleaner@murar8.github.com
```

### Available Options:

- **Delete on focus**: Enable/disable notification deletion when an application window is focused.
- **Delete on close**: Enable/disable notification deletion when an application window is closed.
- **Excluded Applications**: Regex patterns for application WM_CLASS values that should be excluded from automatic notification cleanup.
- **Log Level**: Set the logging level (debug, info, warn, error) for troubleshooting notification matching.

## Installation

From source:

```
npm run install-extension
```

## Development

```
npm run build                # Build the extension
npm run compile-schemas      # Compile schemas
npm run package              # Create extension package
npm run install-extension    # Install the extension
npm run format               # Format code with prettier
```
