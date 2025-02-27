# Junk Notification Cleaner

A GNOME Shell extension that automatically deletes notifications for an application when its window is focused or closed.

## Features

- Automatically delete notifications when an application window is focused
- Automatically delete notifications when an application window is closed
- Exclude specific applications from automatic notification cleanup

## Preferences

You can configure the extension behavior through the GNOME Extensions app or by running:

```
gnome-extensions prefs junk-notification-cleaner@murar8.github.com
```

### Available Options:

- **Delete on focus**: Enable/disable notification deletion when an application window is focused
- **Delete on close**: Enable/disable notification deletion when an application window is closed
- **Excluded Applications**: List of application WM_CLASS names that should be excluded from automatic notification cleanup

## Installation

From source:

```
make install
```

## Development

```
make build       # Build the extension
make schemas     # Compile schemas
make compile     # Create extension package
make install     # Install the extension
make clean       # Clean build artifacts
```
