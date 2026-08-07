import {
  WindowControls,
  UpdateControls,
  PanelControls,
  AppAPI,
  ShortcutAPI,
  ShellAPI,
  ThemeAPI,
  ConfigAPI,
  ConfigKey,
  ThemeMode,
} from "@/utils/type";
import { ipcRenderer, contextBridge } from "electron";

/**
 * 只暴露窄 API，不把整份 ipcRenderer 交给渲染进程。
 * 通道名与参数形状在这里固定，主进程再做校验。
 */

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const wrappedCallback = (_: unknown, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on("window-maximize-changed", wrappedCallback);
    // 返回取消函数，避免组件卸载后监听泄漏
    return () => ipcRenderer.removeListener("window-maximize-changed", wrappedCallback);
  },
  getRole: () => ipcRenderer.invoke("window-get-role"),
} as WindowControls);

contextBridge.exposeInMainWorld("panel", {
  hide: () => ipcRenderer.send("panel-hide"),
  openMain: () => ipcRenderer.send("panel-open-main"),
  /** 面板每次显示时回调（用于刷新列表） */
  onShown: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on("panel-shown", wrappedCallback);
    return () => ipcRenderer.removeListener("panel-shown", wrappedCallback);
  },
  /**
   * 面板窗口 focusable:false，无法自己收键盘；
   * ↑↓/Enter 由主进程全局快捷键转发过来。
   */
  onNav: (callback: (action: "up" | "down" | "enter") => void) => {
    const wrappedCallback = (_: unknown, action: "up" | "down" | "enter") => callback(action);
    ipcRenderer.on("panel-nav", wrappedCallback);
    return () => ipcRenderer.removeListener("panel-nav", wrappedCallback);
  },
} as PanelControls);

/** 跨窗口主题同步（主进程转发给其它 BrowserWindow） */
contextBridge.exposeInMainWorld("theme", {
  broadcast: (theme: ThemeMode) => ipcRenderer.send("theme-changed", theme),
  onChanged: (callback: (theme: ThemeMode) => void) => {
    const wrappedCallback = (_: unknown, theme: ThemeMode) => callback(theme);
    ipcRenderer.on("theme-changed", wrappedCallback);
    return () => ipcRenderer.removeListener("theme-changed", wrappedCallback);
  },
} as ThemeAPI);

contextBridge.exposeInMainWorld("clipboard", {
  write: (id: number) => ipcRenderer.invoke("clipboard-write", id),
  /** 按 id 写入剪贴板、隐藏面板并模拟粘贴到当前输入焦点 */
  pasteAndHide: (id: number) => ipcRenderer.invoke("clipboard-paste-and-hide", id),
  startWatching: () => ipcRenderer.invoke("clipboard-watch-start"),
  stopWatching: () => ipcRenderer.invoke("clipboard-watch-stop"),
  onChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on("clipboard-changed", wrappedCallback);
    return () => ipcRenderer.removeListener("clipboard-changed", wrappedCallback);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 载荷形状由主进程校验
  saveItem: (item: any) => ipcRenderer.invoke("clipboard-save-item", item),
  deleteItem: (id: number) => ipcRenderer.invoke("clipboard-delete-item", id),
  clearAll: () => ipcRenderer.invoke("clipboard-clear-all"),
  clearExceptFavorites: () => ipcRenderer.invoke("clipboard-clear-except-favorites"),
  getHistory: (page: number, pageSize: number, type: string, keyword: string = "") =>
    ipcRenderer.invoke("clipboard-get-history", page, pageSize, type, keyword),
  getItem: (id: number) => ipcRenderer.invoke("clipboard-get-item", id),
  setFavorite: (id: number, isFavorite: boolean) =>
    ipcRenderer.invoke("clipboard-set-favorite", id, isFavorite),
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
} as AppAPI);

contextBridge.exposeInMainWorld("shortcut", {
  get: () => ipcRenderer.invoke("shortcut-get"),
  update: (newShortcut: string) => ipcRenderer.invoke("shortcut-update", newShortcut),
} as ShortcutAPI);

/** 外链须经主进程白名单校验，禁止任意协议/域名 */
contextBridge.exposeInMainWorld("shell", {
  openExternal: (url: string) => ipcRenderer.invoke("open-external-url", url),
} as ShellAPI);

contextBridge.exposeInMainWorld("updater", {
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (callback: (status: { status: string; data?: unknown }) => void) => {
    const wrappedCallback = (_event: unknown, status: { status: string; data?: unknown }) =>
      callback(status);
    ipcRenderer.on("update-status", wrappedCallback);
    return () => ipcRenderer.removeListener("update-status", wrappedCallback);
  },
} as UpdateControls);
