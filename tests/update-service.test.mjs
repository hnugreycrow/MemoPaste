import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["electron/services/update-service.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "electron-updater"],
  write: false,
});
function setup() {
  const updater = new EventEmitter();
  const handlers = new Map();
  const events = [];
  const config = new Map([["autoCheckUpdate", true]]);
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    (name) =>
      name === "electron-updater"
        ? { autoUpdater: updater }
        : {
            ipcMain: {
              handle: (key, fn) => handlers.set(key, fn),
              removeHandler: (key) => handlers.delete(key),
            },
          },
    module,
    module.exports,
  );
  const service = new module.exports.UpdateService(
    {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: (_channel, event) => events.push(event) },
    },
    { get: (key) => config.get(key), set: (key, value) => config.set(key, value) },
  );
  return { updater, handlers, events, config, service };
}

test("automatic failure retains reason, deduplicates event/rejection, and recovers on manual retry", async () => {
  const { updater, handlers, events, config, service } = setup();
  updater.checkForUpdates = async () => {
    updater.emit("checking-for-update");
    const error = new Error("network timeout");
    updater.emit("error", error);
    throw error;
  };
  await service.maybeAutoCheck();
  assert.equal(events.filter((event) => event.status === "error").length, 1);
  const snapshot = handlers.get("get-update-status")();
  assert.equal(snapshot.source, "auto");
  assert.equal(snapshot.data.message, "network timeout");
  assert.ok(snapshot.checkedAt > 0);
  assert.deepEqual(handlers.get("get-update-status")(), snapshot);
  assert.equal(config.has("lastUpdateCheckAt"), false);
  updater.checkForUpdates = async () => {
    updater.emit("checking-for-update");
    assert.equal(handlers.get("get-update-status")().data, undefined);
    updater.emit("update-not-available", { version: "1.12.0" });
    return {};
  };
  await handlers.get("check-for-updates")();
  assert.equal(handlers.get("get-update-status")().status, "update-not-available");
  assert.equal(handlers.get("get-update-status")().source, "manual");
  service.dispose();
  assert.equal(handlers.size, 0);
});

test("rejection-only manual and download errors are returned and broadcast once", async () => {
  const { updater, handlers, events } = setup();
  updater.checkForUpdates = async () => {
    throw new Error("offline");
  };
  assert.equal((await handlers.get("check-for-updates")()).error.message, "offline");
  const check = handlers.get("get-update-status")();
  updater.downloadUpdate = async () => {
    updater.emit("error", new Error("download failed"));
    throw new Error("download failed");
  };
  assert.equal((await handlers.get("download-update")()).error.message, "download failed");
  assert.deepEqual(
    events.map((event) => event.source),
    ["manual", "download"],
  );
  assert.deepEqual(handlers.get("get-update-status")(), check);
});

test("automatic check respects switch and throttle and announces available updates", async () => {
  const { updater, config, service, events } = setup();
  let calls = 0;
  updater.checkForUpdates = async () => {
    calls++;
    updater.emit("update-available", { version: "2.0.0" });
    return {};
  };
  config.set("autoCheckUpdate", false);
  await service.maybeAutoCheck();
  assert.equal(calls, 0);
  config.set("autoCheckUpdate", true);
  await service.maybeAutoCheck();
  await service.maybeAutoCheck();
  assert.equal(calls, 1);
  assert.equal(events[0].status, "update-available");
  assert.equal(events[0].source, "auto");
});

test("installation errors remain observable without replacing the check snapshot", () => {
  const { updater, handlers, events } = setup();
  updater.quitAndInstall = () => {
    updater.emit("error", new Error("installer failed"));
    throw new Error("installer failed");
  };
  handlers.get("install-update")();
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "install");
  assert.equal(handlers.get("get-update-status")().status, "idle");
});
