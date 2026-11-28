import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadTsModule(filePath, mocks = {}) {
  const source = readFileSync(filePath, "utf8")
    .replace("const require = createRequire", "const runtimeRequire = createRequire")
    .replaceAll('require("koffi")', 'runtimeRequire("koffi")');
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replaceAll("import.meta.url", `"file:///${filePath.replace(/\\/g, "/")}"`);

  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected import in ${filePath}: ${name}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}

test("foreground-window ignores Windows taskbar and tray overflow classes", () => {
  const mod = loadTsModule("electron/utils/foreground-window.ts", {
    "node:path": {},
    "node:module": { createRequire: () => () => ({}) },
  });

  assert.equal(mod.isIgnoredForegroundWindowClass("Shell_TrayWnd"), true);
  assert.equal(mod.isIgnoredForegroundWindowClass("Shell_SecondaryTrayWnd"), true);
  assert.equal(mod.isIgnoredForegroundWindowClass("NotifyIconOverflowWindow"), true);
  assert.equal(mod.isIgnoredForegroundWindowClass("TopLevelWindowForOverflowXamlIsland"), true);
  assert.equal(mod.isIgnoredForegroundWindowClass("Chrome_WidgetWin_1"), false);
  assert.equal(mod.isIgnoredForegroundWindowClass("Notepad"), false);
  assert.equal(mod.isIgnoredForegroundWindowClass(null), false);
});

test("selectPressedModifiers only returns keys with high bit set", () => {
  const mod = loadTsModule("electron/utils/simulate-paste.ts", {
    "node:child_process": { execFile: () => {} },
    "node:util": { promisify: (fn) => fn },
    "node:module": { createRequire: () => () => ({}) },
    "./foreground-window": { waitForForegroundWindow: async () => true },
  });

  // No modifier pressed (low bit 0x0001 only means pressed since last call, not currently down)
  assert.deepEqual(
    mod.selectPressedModifiers(() => 0x0001),
    [],
  );

  // Left Alt (0xa4) and Left Control (0xa2) currently pressed (negative int16 / bit 15 set)
  assert.deepEqual(
    mod.selectPressedModifiers((vk) => (vk === 0xa4 || vk === 0xa2 ? -32768 : 0)),
    [0xa4, 0xa2],
  );
});
