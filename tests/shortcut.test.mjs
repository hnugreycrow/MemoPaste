import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(source, resolve = require) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(resolve, module, module.exports);
  return module.exports;
}

const shortcutModule = compile(readFileSync("shared/shortcut.ts", "utf8"));
const {
  DEFAULT_SHORTCUT,
  normalizeShortcut,
  validateShortcut,
  formatShortcutForDisplay,
  normalKeyFromCode,
} = shortcutModule;

function createShortcutServiceHarness({ blockedAccelerators = new Set(), initialShortcut = "Alt+V" } = {}) {
  const registered = new Map();
  const ipcHandlers = new Map();
  let configShortcut = initialShortcut;

  const globalShortcut = {
    register(accelerator, cb) {
      if (blockedAccelerators.has(accelerator)) return false;
      registered.set(accelerator, cb);
      return true;
    },
    unregister(accelerator) {
      registered.delete(accelerator);
    },
    unregisterAll() {
      registered.clear();
    },
  };

  const ipcMain = {
    handle(channel, handler) {
      ipcHandlers.set(channel, handler);
    },
  };

  const { ShortcutService } = compile(readFileSync("electron/services/shortcut-service.ts", "utf8"), (name) => {
    if (name === "electron") return { globalShortcut, ipcMain };
    if (name === "@shared/shortcut") return shortcutModule;
    if (name === "./window-service" || name === "./config-service") return {};
    return require(name);
  });

  let toggleCount = 0;
  const windowService = {
    togglePanel() {
      toggleCount += 1;
    },
  };
  const configService = {
    get(key) {
      return key === "shortcut" ? configShortcut : undefined;
    },
    set(key, value) {
      if (key === "shortcut") configShortcut = value;
    },
  };

  const service = new ShortcutService(windowService, configService);
  return {
    service,
    registered,
    ipcHandlers,
    getConfigShortcut: () => configShortcut,
    getToggleCount: () => toggleCount,
  };
}

test("default shortcut and valid combinations normalize and pass validation", () => {
  assert.equal(DEFAULT_SHORTCUT, "Alt+V");

  const validCases = [
    ["alt+v", "Alt+V"],
    ["ctrl+`", "CommandOrControl+`"],
    ["alt+space", "Alt+Space"],
    ["shift+ctrl+space", "CommandOrControl+Shift+Space"],
    ["alt+ctrl+space", "CommandOrControl+Alt+Space"],
    ["alt+num1", "Alt+num1"],
    ["ctrl+alt+;", "CommandOrControl+Alt+;"],
    ["alt+.", "Alt+."],
    ["ctrl+shift+v", "CommandOrControl+Shift+V"],
    ["alt+f12", "Alt+F12"],
  ];

  for (const [input, expected] of validCases) {
    assert.equal(normalizeShortcut(input), expected);
    const result = validateShortcut(input);
    assert.deepEqual(result, { success: true, shortcut: expected });
  }
});

test("shift-only, win/super, reserved, and malformed shortcuts are rejected", () => {
  const invalidCases = [
    "",
    "V",
    "Space",
    "Shift+Space",
    "Shift+A",
    "Win+V",
    "Super+Space",
    "Ctrl+Win+V",
    "Ctrl+Space",
    "Ctrl+C",
    "Ctrl+V",
    "Ctrl+W",
    "Ctrl+F",
    "Ctrl+R",
    "Ctrl+T",
    "Ctrl+Y",
    "Alt+F4",
    "Ctrl+A+B",
    "Alt+Tab",
  ];

  for (const input of invalidCases) {
    const result = validateShortcut(input);
    assert.equal(result.success, false, `Expected "${input}" to be rejected`);
    assert.ok(result.error.length > 0);
  }
});

test("normalKeyFromCode and formatShortcutForDisplay handle Space, Numpad, and punctuation", () => {
  assert.equal(normalKeyFromCode("Space"), "Space");
  assert.equal(normalKeyFromCode("Numpad0"), "num0");
  assert.equal(normalKeyFromCode("Numpad9"), "num9");
  assert.equal(normalKeyFromCode("Digit5"), "5");
  assert.equal(normalKeyFromCode("KeyV"), "V");
  assert.equal(normalKeyFromCode("Backquote"), "`");
  assert.equal(normalKeyFromCode("Semicolon"), ";");
  assert.equal(normalKeyFromCode("Period"), ".");
  assert.equal(normalKeyFromCode("Slash"), "/");
  assert.equal(normalKeyFromCode("Tab"), null);
  assert.equal(normalKeyFromCode("Enter"), null);

  assert.deepEqual(formatShortcutForDisplay("CommandOrControl+num1"), ["Ctrl", "Num1"]);
  assert.deepEqual(formatShortcutForDisplay("Alt+Space"), ["Alt", "Space"]);
});

test("ShortcutService tracks startup conflict and clears it once updated", () => {
  const blocked = new Set(["Alt+V"]);
  const { service, registered, getConfigShortcut } = createShortcutServiceHarness({
    blockedAccelerators: blocked,
    initialShortcut: "Alt+V",
  });

  const statuses = [];
  service.setOnStatusChanged((status) => statuses.push(status));

  const startup = service.registerGlobalShortcut("Alt+V");
  assert.equal(startup.success, false);
  assert.deepEqual(service.getStatus(), {
    shortcut: "Alt+V",
    registered: false,
    error: "快捷键已被其他应用占用，请换一个组合",
  });

  // Retrying the same shortcut after conflict is gone succeeds
  blocked.delete("Alt+V");
  const retry = service.updateShortcut("Alt+V");
  assert.deepEqual(retry, { success: true, shortcut: "Alt+V" });
  assert.equal(registered.has("Alt+V"), true);
  assert.deepEqual(service.getStatus(), {
    shortcut: "Alt+V",
    registered: true,
    error: null,
  });
  assert.equal(getConfigShortcut(), "Alt+V");
  assert.equal(statuses.at(-1)?.registered, true);
});

test("ShortcutService suspends during recording, resumes cleanly, and rolls back on failure", () => {
  const blocked = new Set(["Alt+Space"]);
  const { service, registered, getConfigShortcut } = createShortcutServiceHarness({
    blockedAccelerators: blocked,
  });

  assert.equal(service.registerGlobalShortcut("Alt+V").success, true);
  assert.equal(registered.has("Alt+V"), true);

  // Suspend unregisters active accelerator without reporting an error state
  service.suspend();
  assert.equal(registered.has("Alt+V"), false);
  assert.equal(service.getStatus().registered, true);
  assert.equal(service.getStatus().error, null);

  // Resume restores active accelerator
  service.resume();
  assert.equal(registered.has("Alt+V"), true);

  // Suspend again, then try updating to an occupied shortcut -> rolls back to Alt+V
  service.suspend();
  const failed = service.updateShortcut("Alt+Space");
  assert.equal(failed.success, false);
  assert.equal(failed.shortcut, "Alt+V");
  assert.equal(registered.has("Alt+V"), true);
  assert.equal(getConfigShortcut(), "Alt+V");

  // Suspend again, then commit a free shortcut -> updates and persists
  service.suspend();
  const updated = service.updateShortcut("Ctrl+`");
  assert.deepEqual(updated, { success: true, shortcut: "CommandOrControl+`" });
  assert.equal(registered.has("CommandOrControl+`"), true);
  assert.equal(registered.has("Alt+V"), false);
  assert.equal(getConfigShortcut(), "CommandOrControl+`");
});
