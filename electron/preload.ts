import type {
  PanelControls,
  PanelShownPayload,
  AppAPI,
  ShortcutAPI,
  ConfigAPI,
  ConfigKey,
} from "@/utils/type";
import { ipcRenderer, contextBridge } from "electron";

/**
 * 只暴露窄 API，不把整份 ipcRenderer 交给渲染进程。
 * 通道名与参数形状在这里固定，主进程再做校验。
 */

contextBridge.exposeInMainWorld("panel", {
  hide: () => ipcRenderer.send("panel-hide"),
  setBlurHideSuppressed: (suppressed: boolean) =>
    ipcRenderer.send("panel-set-blur-suppressed", suppressed),
  /** 面板每次显示时回调（携带目标视图：list / settings） */
  onShown: (callback: (payload: PanelShownPayload) => void) => {
    const wrappedCallback = (_event: unknown, payload: PanelShownPayload) =>
      callback(payload ?? { view: "list" });
    ipcRenderer.on("panel-shown", wrappedCallback);
    return () => ipcRenderer.removeListener("panel-shown", wrappedCallback);
  },
} as PanelControls);

contextBridge.exposeInMainWorld("clipboard", {
  write: (id: number) => ipcRenderer.invoke("clipboard-write", id),
  /** 按 id 写入剪贴板、隐藏面板、归还前台焦点并模拟粘贴 */
  pasteAndHide: (id: number) => ipcRenderer.invoke("clipboard-paste-and-hide", id),
  getPaused: () => ipcRenderer.invoke("clipboard-get-paused"),
  setPaused: (paused: boolean) => ipcRenderer.invoke("clipboard-set-paused", paused),
  onChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on("clipboard-changed", wrappedCallback);
    return () => ipcRenderer.removeListener("clipboard-changed", wrappedCallback);
  },
  onPausedChanged: (callback: (paused: boolean) => void) => {
    const wrappedCallback = (_event: unknown, paused: boolean) => callback(!!paused);
    ipcRenderer.on("clipboard-paused-changed", wrappedCallback);
    return () => ipcRenderer.removeListener("clipboard-paused-changed", wrappedCallback);
  },
  deleteItem: (id: number) => ipcRenderer.invoke("clipboard-delete-item", id),
  clearAll: () => ipcRenderer.invoke("clipboard-clear-all"),
  clearExceptFavorites: () => ipcRenderer.invoke("clipboard-clear-except-favorites"),
  getHistory: (page: number, pageSize: number, type: string, keyword: string = "") =>
    ipcRenderer.invoke("clipboard-get-history", page, pageSize, type, keyword),
  getItem: (id: number) => ipcRenderer.invoke("clipboard-get-item", id),
  setFavorite: (id: number, isFavorite: boolean) =>
    ipcRenderer.invoke("clipboard-set-favorite", id, isFavorite),
  setAlias: (id: number, alias: string | null) =>
    ipcRenderer.invoke("clipboard-set-alias", id, alias),
  getCounts: () => ipcRenderer.invoke("clipboard-get-counts"),
});

contextBridge.exposeInMainWorld("config", {
  get: (key: ConfigKey) => ipcRenderer.invoke("config-get", key),
  set: (key: ConfigKey, value: unknown) => ipcRenderer.invoke("config-set", key, value),
  getAll: () => ipcRenderer.invoke("config-get-all"),
} as ConfigAPI);

contextBridge.exposeInMainWorld("app", {
  getVersion: () => ipcRenderer.invoke("app-get-version"),
  setOpenAtLogin: (enabled: boolean) => ipcRenderer.invoke("open-at-login-set", enabled),
  quit: () => ipcRenderer.send("app-quit"),
} as AppAPI);

contextBridge.exposeInMainWorld("shortcut", {
  get: () => ipcRenderer.invoke("shortcut-get"),
  update: (newShortcut: string) => ipcRenderer.invoke("shortcut-update", newShortcut),
} as ShortcutAPI);
