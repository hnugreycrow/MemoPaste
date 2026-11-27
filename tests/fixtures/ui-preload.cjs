/* eslint-disable @typescript-eslint/no-require-imports -- Electron sandbox preload and test runner use CommonJS. */
// Isolated renderer fixtures for single-panel UI smoke tests.
const { contextBridge } = require("electron");
const noop = () => {};
const listen = () => noop;
const mode = process.argv.find((arg) => arg.startsWith("--test-theme="))?.split("=")[1] || "light";
const config = {
  theme: mode,
  shortcut: "Alt+V",
  openAtLogin: false,
};
let rows = [
  {
    id: 1,
    type: "text",
    alias: "公司发票抬头",
    content:
      "常用说明：整理项目资料，保留重要内容，方便之后快速检索与复制。\n".repeat(80) +
      "Needle 中文 <script> %_\\",
    timestamp: new Date(Date.now() - 2 * 60_000).toISOString(),
    size: "8 KB",
    is_favorite: true,
  },
  {
    id: 2,
    type: "code",
    alias: null,
    content: "const value = 42; // example line\n".repeat(90) + "// Needle <script> %_\\",
    timestamp: new Date(Date.now() - 25 * 60_000).toISOString(),
    size: "4 KB",
    is_favorite: false,
  },
  {
    id: 3,
    type: "url",
    alias: null,
    content: "https://example.com/docs/clipboard-workflow",
    timestamp: new Date(Date.now() - 3 * 3600_000).toISOString(),
    size: "43 B",
    is_favorite: false,
  },
  {
    id: 4,
    type: "image",
    alias: null,
    content: "图片 494×594",
    timestamp: new Date(Date.now() - 4 * 3600_000).toISOString(),
    size: "128 KB",
    is_favorite: false,
    file_path: "shot.png",
    thumb_path: "shot_thumb.png",
  },
  {
    id: 5,
    type: "image",
    alias: "架构白板草图",
    content: "图片 1920×1080",
    timestamp: new Date(Date.now() - 5 * 3600_000).toISOString(),
    size: "420 KB",
    is_favorite: true,
    file_path: "board.png",
    thumb_path: "board_thumb.png",
  },
];
let failSave = false;
let throwSave = false;
let pasted = "sent";
let paused = false;
let written = "";
let singleLinePastedId = null;
let openedUrlId = null;
let savedImageId = null;
let hideCount = 0;

function computeCounts() {
  return {
    all: rows.length,
    text: rows.filter((r) => r.type === "text").length,
    url: rows.filter((r) => r.type === "url").length,
    code: rows.filter((r) => r.type === "code").length,
    image: rows.filter((r) => r.type === "image").length,
    favorite: rows.filter((r) => r.is_favorite).length,
  };
}

const api = {
  config: {
    get: async (key) => config[key],
    set: async (key, value) => {
      if (throwSave) throw new Error("test save exception");
      if (failSave) return false;
      config[key] = value;
      return true;
    },
    getAll: async () => ({ ...config }),
  },
  app: {
    getVersion: async () => "1.13.0-test",
    setOpenAtLogin: async (enabled) => {
      config.openAtLogin = !!enabled;
      return { success: true, openAtLogin: config.openAtLogin, applied: true };
    },
    quit: noop,
  },
  shortcut: {
    get: async () => config.shortcut,
    update: async (shortcut) => {
      config.shortcut = shortcut;
      return { success: true, shortcut };
    },
  },
  panel: {
    hide: () => {
      hideCount++;
    },
    setBlurHideSuppressed: noop,
    onShown: listen,
  },
  clipboard: {
    getPaused: async () => paused,
    setPaused: async (next) => {
      paused = !!next;
      return paused;
    },
    onChanged: listen,
    onPausedChanged: listen,
    getCounts: async () => computeCounts(),
    getHistory: async (page, size, type, keyword = "") => {
      const term = keyword.trim().toLowerCase();
      const result = rows.filter((row) => {
        const typeOk =
          type === "all" || (type === "favorite" ? !!row.is_favorite : row.type === type);
        if (!typeOk) return false;
        if (!term) return true;
        return (
          row.content.toLowerCase().includes(term) ||
          (row.alias && row.alias.toLowerCase().includes(term))
        );
      });
      return {
        items: result.slice((page - 1) * size, page * size).map((row) => {
          const contentIdx = term ? row.content.toLowerCase().indexOf(term) : -1;
          return {
            ...row,
            content: row.content.slice(0, 200),
            searchPreview:
              term && contentIdx >= 0
                ? "…" + row.content.slice(Math.max(0, contentIdx - 16), contentIdx + 120)
                : undefined,
          };
        }),
        total: result.length,
        page,
        pageSize: size,
      };
    },
    getItem: async (id) => rows.find((row) => row.id === id) || null,
    write: async (id) => {
      const target = rows.find((row) => row.id === id);
      if (!target) return false;
      written = target.content;
      return true;
    },
    pasteAndHide: async () => ({ status: pasted }),
    pasteSingleLineAndHide: async (id) => {
      singleLinePastedId = id;
      return { status: pasted };
    },
    openUrl: async (id) => {
      openedUrlId = id;
      return true;
    },
    saveImage: async (id) => {
      savedImageId = id;
      return { status: "saved", filePath: "C:\\tmp\\shot.png" };
    },
    setFavorite: async (id, fav) => {
      if (failSave) return false;
      const target = rows.find((row) => row.id === id);
      if (!target) return false;
      target.is_favorite = !!fav;
      return true;
    },
    setAlias: async (id, alias) => {
      if (failSave) return false;
      const target = rows.find((row) => row.id === id);
      if (!target) return false;
      target.alias = alias;
      return true;
    },
    deleteItem: async (id) => {
      rows = rows.filter((row) => row.id !== id);
      return true;
    },
    clearExceptFavorites: async () => {
      const before = rows.length;
      rows = rows.filter((row) => row.is_favorite);
      return before - rows.length;
    },
    clearAll: async () => {
      rows = [];
      return true;
    },
  },
  __test: {
    failSave: (value, throws = false) => {
      failSave = value;
      throwSave = throws;
    },
    pasteStatus: (value) => {
      pasted = value;
    },
    snapshot: () => ({
      config: { ...config },
      written,
      singleLinePastedId,
      openedUrlId,
      savedImageId,
      paused,
      hideCount,
      rows: rows.map((r) => ({ id: r.id, alias: r.alias, is_favorite: r.is_favorite })),
    }),
  },
};

for (const [name, value] of Object.entries(api)) {
  contextBridge.exposeInMainWorld(name, value);
}
