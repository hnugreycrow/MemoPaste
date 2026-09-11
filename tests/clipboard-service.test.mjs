import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync("electron/services/clipboard-service.ts", "utf8")
    .replace("const require = createRequire", "const runtimeRequire = createRequire")
    .replace('require("clipboard-event")', 'runtimeRequire("clipboard-event")'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText.replaceAll("import.meta.url", '"file:///clipboard-service.js"');

function setup(kind = "text") {
  const listener = new EventEmitter();
  listener.startListening = () => {};
  listener.stopListening = () => {};
  const saves = [];
  const notifications = [];
  let succeeds = true;
  const mocks = {
    electron: {
      clipboard: {
        readText: () => (kind === "text" ? "copied before launch" : ""),
        readImage: () => ({ isEmpty: () => false }),
      },
      ipcMain: { handle: () => {} },
      BrowserWindow: {
        getAllWindows: () => [{
          isDestroyed: () => false,
          webContents: { send: (event) => notifications.push(event) },
        }],
      },
    },
    "node:module": { createRequire: () => () => listener },
    "../database/clipboard": {
      saveClipboardItem: (item) => {
        saves.push(item);
        return succeeds ? { id: 1 } : null;
      },
    },
    "../utils/simulate-paste": {},
    "./image-storage": {
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
  const service = new module.exports.ClipboardService({});
  return {
    service, saves, notifications,
    fail: () => { succeeds = false; },
    recover: () => { succeeds = true; },
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
