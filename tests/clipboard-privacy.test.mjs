import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(source, resolve = require) {
  const code = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replaceAll("import.meta.url", '"file:///privacy.js"');
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(resolve, module, module.exports);
  return module.exports;
}

const privacy = compile(readFileSync("electron/utils/clipboard-privacy.ts", "utf8"), (name) => {
  if (name === "electron") return { clipboard: {} };
  if (name === "./foreground-window") return { getForegroundProcessName: () => null };
  return require(name);
});

const contentType = compile(readFileSync("shared/content-type.ts", "utf8"));

test("shouldIgnoreClipboardCapture detects Windows & macOS privacy clipboard markers", () => {
  const zeroBuf = Buffer.alloc(4);
  zeroBuf.writeUInt32LE(0, 0);
  const oneBuf = Buffer.alloc(4);
  oneBuf.writeUInt32LE(1, 0);

  assert.equal(
    privacy.shouldIgnoreClipboardCapture({
      formats: ["text/plain", "ExcludeClipboardContentFromMonitorProcessing"],
      readBuffer: () => Buffer.alloc(0),
      foregroundProcessName: "chrome.exe",
    }),
    true,
  );

  assert.equal(
    privacy.shouldIgnoreClipboardCapture({
      formats: ["text/plain", "CanIncludeInClipboardHistory"],
      readBuffer: () => zeroBuf,
      foregroundProcessName: "chrome.exe",
    }),
    true,
  );

  // CanIncludeInClipboardHistory = 1 means explicitly allowed
  assert.equal(
    privacy.shouldIgnoreClipboardCapture({
      formats: ["text/plain", "CanIncludeInClipboardHistory"],
      readBuffer: () => oneBuf,
      foregroundProcessName: "chrome.exe",
    }),
    false,
  );

  assert.equal(
    privacy.shouldIgnoreClipboardCapture({
      formats: ["Clipboard Viewer Ignore"],
      readBuffer: () => Buffer.alloc(0),
      foregroundProcessName: null,
    }),
    true,
  );

  assert.equal(
    privacy.shouldIgnoreClipboardCapture({
      formats: ["org.nspasteboard.ConcealedType"],
      readBuffer: () => Buffer.alloc(0),
      foregroundProcessName: null,
    }),
    true,
  );
});

test("shouldIgnoreClipboardCapture blocks known password manager processes case-insensitively", () => {
  for (const proc of ["Bitwarden.exe", "KeePassXC.exe", "1Password.exe", "CredentialUIBroker.exe"]) {
    assert.equal(
      privacy.shouldIgnoreClipboardCapture({
        formats: ["text/plain"],
        readBuffer: () => Buffer.alloc(0),
        foregroundProcessName: proc,
      }),
      true,
      `Expected ${proc} to be ignored`,
    );
  }

  for (const proc of ["Code.exe", "notepad.exe", "chrome.exe", null]) {
    assert.equal(
      privacy.shouldIgnoreClipboardCapture({
        formats: ["text/plain"],
        readBuffer: () => Buffer.alloc(0),
        foregroundProcessName: proc,
      }),
      false,
      `Expected ${proc} to be allowed`,
    );
  }
});

test("collapseToSingleLine merges multiline and redundant spaces cleanly", () => {
  assert.equal(
    contentType.collapseToSingleLine("  第一行\r\n   第二行\n\n\t第三行  "),
    "第一行 第二行 第三行",
  );
  assert.equal(contentType.collapseToSingleLine(""), "");
});

test("normalizeSafeExternalUrl allows http/https/www and blocks dangerous protocols", () => {
  assert.equal(
    contentType.normalizeSafeExternalUrl("https://example.com/a?b=1"),
    "https://example.com/a?b=1",
  );
  assert.equal(
    contentType.normalizeSafeExternalUrl("  www.example.com/docs "),
    "https://www.example.com/docs",
  );
  assert.equal(contentType.normalizeSafeExternalUrl("javascript:alert(1)"), null);
  assert.equal(contentType.normalizeSafeExternalUrl("file:///C:/Windows/win.ini"), null);
  assert.equal(contentType.normalizeSafeExternalUrl("not a url"), null);
});
