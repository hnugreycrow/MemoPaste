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
  const aliasCalls = [];
  const openedUrls = [];
  const copiedFiles = [];
  const blurSuppressed = [];
  let succeeds = true;
  let sensitive = false;
  let saveDialogResult = { canceled: false, filePath: "C:\\out\\shot.png" };
  let clipboardText = kind === "text" ? "copied before launch" : "";
  const handlers = new Map();
  const writes = [];
  const windows = [];
  const pasteOptions = [];
  let row = { type: "text", content: "full text beyond the preview" };
  let paste = async () => {};
  const mocks = {
    electron: {
      clipboard: {
        writeText: (text) => writes.push(text),
        readText: () => clipboardText,
        readImage: () => ({
          isEmpty: () => kind !== "image",
          toPNG: () => Buffer.from("fake-png-bytes"),
        }),
      },
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      BrowserWindow: {
        getAllWindows: () => [
          {
            isDestroyed: () => false,
            webContents: { send: (event, payload) => notifications.push({ event, payload }) },
          },
        ],
      },
      shell: {
        openExternal: async (url) => {
          openedUrls.push(url);
        },
      },
      dialog: {
        showSaveDialog: async () => saveDialogResult,
      },
    },
    "node:module": { createRequire: () => () => listener },
    "node:fs": {
      default: {
        existsSync: (p) => p === "/safe/img.png",
        promises: {
          copyFile: async (src, dst) => {
            copiedFiles.push({ src, dst });
          },
        },
      },
    },
    "../database/clipboard": {
      getClipboardItemById: () => row,
      saveClipboardItem: (item) => {
        saves.push(item);
        return succeeds ? { id: 1 } : null;
      },
      setClipboardItemAlias: (id, alias) => {
        aliasCalls.push({ id, alias });
        return true;
      },
    },
    "../utils/simulate-paste": {
      releasePressedModifiers: () => windows.push("release-modifiers"),
      simulatePaste: (options) => {
        pasteOptions.push(options);
        return paste(options);
      },
    },
    "../utils/clipboard-privacy": { isSensitiveClipboardContent: () => sensitive },
    "./image-storage": {
      resolveImageAbsolutePath: (p) => (p === "ok.png" ? "/safe/img.png" : null),
      storeClipboardImage: () => ({ hash: "image-hash", width: 10, height: 10, sizeBytes: 100 }),
    },
    "@shared/content-type": {
      getContentType: () => "text",
      formatSize: () => "100 B",
      collapseToSingleLine: (s) =>
        s
          .replace(/\r\n|\r|\n/g, " ")
          .replace(/[ \t]+/g, " ")
          .trim(),
      normalizeSafeExternalUrl: (raw) => {
        try {
          const u = new URL(raw.trim());
          return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
        } catch {
          return null;
        }
      },
    },
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
  const service = new module.exports.ClipboardService({
    hidePanel: () => windows.push("hide"),
    hideAndRestoreFocus: () => {
      windows.push("hide-restore");
      return 123456n;
    },
    restorePanel: () => windows.push("restore"),
    setBlurHideSuppressed: (flag) => blurSuppressed.push(flag),
    getPanelWindow: () => null,
  });
  return {
    service,
    saves,
    notifications,
    aliasCalls,
    openedUrls,
    copiedFiles,
    blurSuppressed,
    writes,
    windows,
    pasteOptions,
    handlers,
    paste: () => handlers.get("clipboard-paste-and-hide")({}, 1),
    pasteSingleLine: () => handlers.get("clipboard-paste-single-line")({}, 1),
    openUrl: () => handlers.get("clipboard-open-url")({}, 1),
    saveImage: () => handlers.get("clipboard-save-image")({}, 1),
    setClipboardText: (value) => {
      clipboardText = value;
    },
    setSensitive: (value) => {
      sensitive = value;
    },
    setSaveDialogResult: (value) => {
      saveDialogResult = value;
    },
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
  assert.equal(notifications.filter((n) => n.event === "clipboard-changed").length, 1);
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

test("sensitive clipboard content is skipped automatically and never backfilled", (t) => {
  const { service, saves, setSensitive, setClipboardText } = setup();
  t.after(() => service.dispose());

  setSensitive(true);
  setClipboardText("my-password-123");
  service.captureClipboardChange();
  assert.equal(saves.length, 0);

  // Even after privacy flag clears, identical secret stays skipped via fingerprint
  setSensitive(false);
  service.captureClipboardChange();
  assert.equal(saves.length, 0);

  // New normal text is saved as usual
  setClipboardText("public note");
  service.captureClipboardChange();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].content, "public note");
});

test("paused mode skips sensitive copies and does not backfill them on resume", (t) => {
  const { service, saves, notifications, setClipboardText } = setup();
  t.after(() => service.dispose());

  let callbackState = null;
  service.setOnPausedChanged((paused) => {
    callbackState = paused;
  });

  assert.equal(service.isPaused(), false);
  assert.equal(service.setPaused(true), true);
  assert.equal(callbackState, true);

  setClipboardText("super-secret-password");
  service.captureClipboardChange();
  assert.equal(saves.length, 0);

  assert.equal(service.setPaused(false), false);
  assert.equal(callbackState, false);
  service.captureClipboardChange();
  assert.equal(saves.length, 0);

  setClipboardText("normal text after resume");
  service.captureClipboardChange();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].content, "normal text after resume");
  assert.deepEqual(
    notifications.filter((n) => n.event === "clipboard-paused-changed").map((n) => n.payload),
    [true, false],
  );
});

test("paste hides with focus restore, handles missing records and failed input", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());
  assert.deepEqual(await context.paste(), { status: "sent" });
  assert.deepEqual(context.writes, ["full text beyond the preview"]);
  assert.deepEqual(context.pasteOptions, [{ targetHwnd: 123456n }]);
  context.setRow(null);
  assert.deepEqual(await context.paste(), { status: "failed" });
  assert.deepEqual(context.windows, ["release-modifiers", "hide-restore"]);
  context.setRow({ type: "text", content: "retry" });
  context.setPaste(async () => {
    throw new Error("SendInput failed");
  });
  assert.deepEqual(await context.paste(), { status: "copied" });
  assert.deepEqual(context.windows, [
    "release-modifiers",
    "hide-restore",
    "release-modifiers",
    "hide-restore",
    "restore",
  ]);
});

test("pasteSingleLine collapses newlines and rejects image items", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());

  context.setRow({ type: "text", content: "line 1\r\n   line 2\nline 3" });
  assert.deepEqual(await context.pasteSingleLine(), { status: "sent" });
  assert.deepEqual(context.writes, ["line 1 line 2 line 3"]);

  context.setRow({ type: "image", content: "图片 100×100", file_path: "ok.png" });
  assert.deepEqual(await context.pasteSingleLine(), { status: "failed" });
});

test("openUrl opens validated http/https URLs and blocks unsafe schemes", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());

  context.setRow({ type: "url", content: "https://example.com/docs" });
  assert.equal(await context.openUrl(), true);
  assert.deepEqual(context.openedUrls, ["https://example.com/docs"]);
  assert.deepEqual(context.windows, ["hide"]);

  context.setRow({ type: "url", content: "javascript:alert(1)" });
  assert.equal(await context.openUrl(), false);
  assert.deepEqual(context.openedUrls, ["https://example.com/docs"]);
});

test("saveImage suppresses blur-hide during dialog and copies image cleanly", async (t) => {
  const context = setup();
  t.after(() => context.service.dispose());

  context.setRow({ type: "image", content: "图片 100×100", file_path: "ok.png", alias: "架构图" });
  assert.deepEqual(await context.saveImage(), { status: "saved", filePath: "C:\\out\\shot.png" });
  assert.deepEqual(context.copiedFiles, [{ src: "/safe/img.png", dst: "C:\\out\\shot.png" }]);
  assert.deepEqual(context.blurSuppressed, [true, false]);

  context.setSaveDialogResult({ canceled: true });
  assert.deepEqual(await context.saveImage(), { status: "canceled" });
  assert.deepEqual(context.blurSuppressed, [true, false, true, false]);
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

test("clipboard-set-alias validates id and alias payload", (t) => {
  const { service, handlers, aliasCalls } = setup();
  t.after(() => service.dispose());
  const setAlias = handlers.get("clipboard-set-alias");
  assert.equal(setAlias({}, "1", "公司地址"), false);
  assert.equal(setAlias({}, 1, 123), false);
  assert.equal(setAlias({}, 1, "公司地址"), true);
  assert.equal(setAlias({}, 1, null), true);
  assert.deepEqual(aliasCalls, [
    { id: 1, alias: "公司地址" },
    { id: 1, alias: null },
  ]);
});
