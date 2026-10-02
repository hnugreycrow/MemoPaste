/* eslint-disable @typescript-eslint/no-require-imports -- Electron sandbox preload and test runner use CommonJS. */
// Isolated renderer fixtures: never reads or writes the system clipboard or user configuration.
const { contextBridge } = require("electron");
const noop = () => {};
const listen = () => noop;
const mode = process.argv.find((arg) => arg.startsWith("--test-theme="))?.split("=")[1] || "light";
const config = { theme: mode, clipboardListRatio: 0.4, version: "test", dataRetentionDays: 1 };
const rows = [
  {
    id: 1,
    type: "text",
    content:
      "常用说明：整理项目资料，保留重要内容，方便之后快速检索与复制。\n".repeat(120) +
      "Needle 中文 <script> %_\\",
    timestamp: "2026-10-02T06:00:00Z",
    size: "12 KB",
    is_favorite: true,
  },
  {
    id: 2,
    type: "code",
    content: "const value = 42; // example line\n".repeat(160) + "// Needle <script> %_\\",
    timestamp: "2026-10-02T05:00:00Z",
    size: "6 KB",
  },
  {
    id: 3,
    type: "text",
    content: "短文本：记录列表的第二行摘要应保持清晰，不与时间或类型重叠。",
    timestamp: "2026-10-01T05:00:00Z",
    size: "96 B",
  },
];
let failSave = false;
let throwSave = false;
let failSearch = false;
let pasted = "sent";
let written = "";
let broadcastCount = 0;
const api = {
  windowControls: {
    getRole: async () => (location.hash.includes("panel") ? "panel" : "main"),
    isMaximized: async () => false,
    onMaximizeChange: listen,
    minimize: noop,
    maximize: noop,
    close: noop,
  },
  config: {
    get: async (key) => config[key],
    set: async (key, value) => {
      if (throwSave) throw new Error("test save exception");
      if (failSave) return false;
      config[key] = value;
      return true;
    },
  },
  theme: {
    onChanged: listen,
    broadcast: () => {
      broadcastCount++;
    },
  },
  app: {
    getVersion: async () => "test",
    setOpenAtLogin: async (enabled) => ({ success: true, openAtLogin: enabled, applied: true }),
  },
  shortcut: {
    get: async () => "Alt+Shift+C",
    update: async (shortcut) => ({ success: true, shortcut }),
  },
  shell: { openExternal: noop },
  updater: {
    onUpdateStatus: listen,
    getUpdateStatus: async () => null,
    checkForUpdates: async () => null,
  },
  panel: { hide: noop, openMain: noop, onShown: listen, onNav: listen },
  clipboard: {
    startWatching: async () => {},
    stopWatching: async () => {},
    onChanged: listen,
    getCounts: async () => ({ all: rows.length, text: 2, code: 1, image: 0, favorite: 1 }),
    getHistory: async (page, size, type, keyword = "") => {
      if (failSearch) throw new Error("test search failure");
      const result = rows.filter(
        (row) =>
          (type === "all" || (type === "favorite" ? row.is_favorite : row.type === type)) &&
          row.content.toLowerCase().includes(keyword.toLowerCase()),
      );
      return {
        items: result
          .slice((page - 1) * size, page * size)
          .map((row) => ({
            ...row,
            content: row.content.slice(0, 200),
            searchPreview: keyword
              ? "…" +
                row.content.slice(
                  Math.max(0, row.content.toLowerCase().indexOf(keyword.toLowerCase()) - 16),
                )
              : undefined,
          })),
        total: result.length,
      };
    },
    getItem: async (id) => rows.find((row) => row.id === id),
    write: async (id) => {
      written = rows.find((row) => row.id === id).content;
      return true;
    },
    pasteAndHide: async () => ({ status: pasted }),
    setFavorite: async () => !failSave,
  },
  __test: {
    failSave: (value, throws = false) => {
      failSave = value;
      throwSave = throws;
    },
    failSearch: (value) => {
      failSearch = value;
    },
    pasteStatus: (value) => {
      pasted = value;
    },
    snapshot: () => ({ config: { ...config }, written, broadcastCount }),
  },
};
for (const [name, value] of Object.entries(api)) contextBridge.exposeInMainWorld(name, value);
