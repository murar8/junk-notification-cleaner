import { ChildProcess, exec, spawn } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

function wait(ms: number = 800) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnZenity(title: string) {
  return spawn("zenity", ["--info", "--title", title]);
}

function spawnNotifySend(title: string) {
  return spawn("notify-send", ["--wait", "-a", title, "Hi!"]);
}

describe("clear notifications by title", () => {
  let windowBg: ChildProcess;
  let windowFg: ChildProcess;

  beforeEach(async () => {
    windowBg = spawnZenity("TestApp");
    await wait();
    windowFg = spawnZenity("OtherApp");
    await wait();
  });

  afterEach(() => {
    windowBg.kill();
    windowFg.kill();
  });

  it("should clear notifications when the window is closed", async () => {
    await wait();
    const notification = spawnNotifySend("TestApp");
    await wait();
    windowBg.kill();
    await wait();
    expect(notification.exitCode).toBe(0);
  });

  it("should clear notifications when the window is focused", async () => {
    const notification = spawnNotifySend("TestApp");
    await wait();
    windowFg.kill();
    await wait();
    expect(notification.exitCode).toBe(0);
  });
});
