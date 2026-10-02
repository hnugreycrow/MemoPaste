import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import ts from "typescript";

const compiled = ts
  .transpileModule(
    readFileSync("electron/services/clipboard-service.ts", "utf8")
      .replace("const require = createRequire", "const runtimeRequire = createRequire")
      .replace('require("clipboard-event")', 'runtimeRequire("clipboard-event")'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  )
  .outputText.replaceAll("import.meta.url", '"file:///clipboard-service.js"');

function setup(kind = "text") {
  const listener = new EventEmitter();
  listener.startListening = () => {};
  listener.stopListening = () => {};
  const saves = [];
  const notifications = [];
  let succeeds = true;
  const handlers = new Map();
  const writes = [];
  const windows = [];
  let row = { type: "text", content: "full text beyond the preview" };
  let paste = async () => {};
  const mocks = {
    electron: {
      clipboard: {
        writeText: (text) => writes.push(text),
        readText: () => (kind === "text" ? "copied before launch" : ""),
        readImage: () => ({ isEmpty: () => false }),
      },
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      BrowserWindow: {
        getAllWindows: () => [
          {
            isDestroyed: () => false,
            webContents: { send: (event) => notifications.push(event) },
          },
        ],
      },
    },
    "node:module": { createRequire: () => () => listener },
    "../database/clipboard": {
      getClipboardItemById: () => row,
      saveClipboardItem: (item) => {
        saves.push(item);
        return succeeds ? { id: 1 } : null;
      },
    },
    "../utils/simulate-paste": { simulatePaste: () => paste() },
    "./image-storage": {
      resolveImageAbsolutePath: () => null,
      storeClipboardImage: () => ({ hash: "image-hash", width: 10, height: 10, sizeBytes: 100 }),
    },
    "@shared/content-type": { getContentType: () => "text", formatSize: () => "100 B" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => {
      assert.ok(name in mocks, `Unexpected import: ${name}`);
      return mocks[name];
    },
    module,
    module.exports,
  );
  const service = new module.exports.ClipboardService(
    {},
    { hidePanel: () => windows.push("hide"), restorePanel: () => windows.push("restore") },
  );
  return {
    service,
    saves,
    notifications,
    writes,
    windows,
    paste: () => handlers.get("clipboard-paste-and-hide")({}, 1),
    setRow: (value) => {
      row = value;
    },
    setPaste: (value) => {
      paste = value;
    },
    fail: () => {
      succeeds = false;
    },
    recover: () => {
      succeeds = true;
    },
  };
}

test("copying startup text saves it once without automatically capturing on launch", (t) => {
  const { service, saves, notifications } = setup();
  t.after(() => service.dispose());
  assert.equal(saves.length, 0);
  service.captureClipboardChange();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].content, "copied before launch");
  service.captureClipboardChange();
  assert.equal(saves.length, 1);
  assert.equal(notifications.length, 1);
});

for (const kind of ["text", "image"]) {
  test(`${kind} can retry identical content after a failed save`, (t) => {
    const { service, saves, notifications, fail, recover } = setup(kind);
    t.after(() => service.dispose());
    fail();
    service.captureClipboardChange();
    assert.equal(saves.length, 1);
    assert.equal(notifications.length, 0);
    recover();
    service.captureClipboardChange();
    assert.equal(saves.length, 2);
    assert.equal(notifications.length, 1);
    service.captureClipboardChange();
    assert.equal(saves.length, 2);
  });
}

test("paste reports missing records, sent input and failed automatic input accurately", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());
  assert.deepEqual(await context.paste(), { status: "sent" });
  assert.deepEqual(context.writes, ["full text beyond the preview"]);
  context.setRow(null);
  assert.deepEqual(await context.paste(), { status: "failed" });
  assert.deepEqual(context.windows, ["hide"]);
  context.setRow({ type: "text", content: "retry" });
  context.setPaste(async () => {
    throw new Error("SendInput failed");
  });
  assert.deepEqual(await context.paste(), { status: "copied" });
  assert.deepEqual(context.windows, ["hide", "hide", "restore"]);
});

test("repeated Enter cannot start a second paste while the first is pending", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());
  let finish;
  context.setPaste(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = context.paste();
  assert.deepEqual(await context.paste(), { status: "busy" });
  finish();
  assert.deepEqual(await pending, { status: "sent" });
  assert.equal(context.writes.length, 1);
});

test("missing image paths fail without copying the image label as text", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());
  for (const file_path of [null, "missing.png"]) {
    context.setRow({ type: "image", content: "图片 1920×1080", file_path });
    assert.deepEqual(await context.paste(), { status: "failed" });
  }
  assert.deepEqual(context.writes, []);
  assert.deepEqual(context.windows, []);
});
