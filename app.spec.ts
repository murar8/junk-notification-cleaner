import { ChildProcess, exec, spawn } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

/**
 * Wait for the given amount of milliseconds.
 */
function wait(ms: number = 800) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Edit the window manager class of the given window.
 */
function editClass(title: string, className: string) {
  return execAsync(
    `xdotool search --name "${title}" set_window --class "${className}"`,
  );
}

/**
 * Spawn a zenity window with the given title and class.
 */
async function spawnZenity(
  title: string,
  className: string = "com.murar8.TestApp",
) {
  const child = spawn("zenity", ["--info", "--title", title]);
  await wait();
  await editClass(title, className);
  return child;
}

/**
 * Spawn a notify-send notification with the given title.
 */
async function spawnNotifySend(title: string, icon?: string) {
  const args = ["--wait", "-a", title, "Hi!"];
  if (icon) args.push("--icon", icon);
  const child = spawn("notify-send", args);
  await wait();
  return child;
}

/**
 * Write a setting to the extension's dconf key.
 */
async function writeSetting(key: string, value: string) {
  await execAsync(
    `dconf write /org/gnome/shell/extensions/junk-notification-cleaner/${key} "${value}"`,
  );
}

/**
 * Close the given window.
 */
async function closeWindow(window: ChildProcess) {
  window.kill();
  await wait();
}

let windowTest: ChildProcess;
let windowUnrelated: ChildProcess;

beforeEach(async () => {
  windowTest = await spawnZenity("TestApp");
  windowUnrelated = await spawnZenity("OtherApp");
});

afterEach(async () => {
  await Promise.allSettled([
    closeWindow(windowTest),
    closeWindow(windowUnrelated),
  ]);
});

it("should clear notifications by title when the window is closed", async () => {
  const notification = await spawnNotifySend("TestApp");
  await closeWindow(windowTest);
  expect(notification.exitCode).toBe(0);
});

it("should clear notifications by title when the window is focused", async () => {
  const notification = await spawnNotifySend("TestApp");
  await closeWindow(windowUnrelated);
  expect(notification.exitCode).toBe(0);
});

it("should clear notifications by window class when the window is closed", async () => {
  const notification = await spawnNotifySend("AppTitle", "com.murar8.TestApp");
  await closeWindow(windowTest);
  expect(notification.exitCode).toBe(0);
});

it("should clear notifications by window class when the window is focused", async () => {
  const notification = await spawnNotifySend("AppTitle", "com.murar8.TestApp");
  await closeWindow(windowUnrelated);
  expect(notification.exitCode).toBe(0);
});

it("should not clear notifications for other apps", async () => {
  const notification = await spawnNotifySend("UnrelatedApp");
  await Promise.all([closeWindow(windowTest), closeWindow(windowUnrelated)]);
  expect(notification.exitCode).toBe(null);
});

it("should respect excluded-apps setting", async () => {
  await writeSetting("excluded-apps", "['com.murar8.TestApp']");
  const notification = await spawnNotifySend("TestApp");
  await closeWindow(windowUnrelated);
  expect(notification.exitCode).toBe(null);
});

it("should respect delete-on-focus setting", async () => {
  await writeSetting("delete-on-focus", "false");
  const notification = await spawnNotifySend("TestApp");
  await closeWindow(windowTest);
  expect(notification.exitCode).toBe(null);
});

it("should respect delete-on-close setting", async () => {
  await writeSetting("delete-on-close", "false");
  const notification = await spawnNotifySend("TestApp");
  await closeWindow(windowTest);
  expect(notification.exitCode).toBe(null);
});
