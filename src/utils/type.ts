export interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  /** 主窗 vs 面板：决定透明背景、是否弹更新等 */
  getRole: () => Promise<"main" | "panel">;
}

export interface ClipboardItem {
  id: number;
  type: string;
  content: string;
  timestamp: Date;
  size: string;
  is_favorite?: boolean;
}

export interface ClipboardHistoryResult {
  items: ClipboardItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 新建或同内容置顶（isNew=false） */
export interface SaveClipboardResult {
  id: number;
  isNew: boolean;
  is_favorite: boolean;
}

export interface TypeCounts {
  all: number;
  text: number;
  url: number;
  code: number;
  favorite: number;
}

export interface ClipboardAPI {
  write: (text: string) => Promise<boolean>;
  startWatching: () => Promise<void>;
  stopWatching: () => Promise<void>;
  onChanged: (callback: (content: string) => void) => () => void;
  saveItem: (item: ClipboardItem) => Promise<SaveClipboardResult | null>;
  deleteItem: (id: number) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  clearExceptFavorites: () => Promise<number>;
  getHistory: (
    page: number,
    pageSize: number,
    type: string,
    keyword?: string,
  ) => Promise<ClipboardHistoryResult>;
  /** 写入剪贴板、隐藏面板并模拟粘贴到原窗口 */
  pasteAndHide: (text: string) => Promise<boolean>;
  setFavorite: (id: number, isFavorite: boolean) => Promise<boolean>;
  getCounts: () => Promise<TypeCounts>;
}

export type ThemeMode = "light" | "dark";

/** 与主进程 config 白名单一致；未知键会被拒绝 */
export type ConfigKey =
  "theme" | "shortcut" | "minimizeToTray" | "openAtLogin" | "dataRetentionDays" | "version";

export interface AppConfig {
  theme: ThemeMode;
  shortcut: string;
  minimizeToTray: boolean;
  openAtLogin: boolean;
  dataRetentionDays: number;
  version?: string;
}

export interface ConfigAPI {
  get: <T>(key: ConfigKey) => Promise<T | undefined>;
  set: <T>(key: ConfigKey, value: T) => Promise<boolean>;
  getAll: () => Promise<AppConfig>;
}

/** 跨窗口主题同步（替代裸露 ipcRenderer） */
export interface ThemeAPI {
  broadcast: (theme: ThemeMode) => void;
  onChanged: (callback: (theme: ThemeMode) => void) => () => void;
}

export type PanelNavAction = "up" | "down" | "enter";

export interface PanelControls {
  hide: () => void;
  openMain: () => void;
  onShown: (callback: () => void) => () => void;
  /** 面板不抢焦点，↑↓/Enter 由主进程全局快捷键转发 */
  onNav: (callback: (action: PanelNavAction) => void) => () => void;
}

export interface UpdateControls {
  checkForUpdates: () => Promise<any>;
  downloadUpdate: () => Promise<boolean | { error: any }>;
  installUpdate: () => Promise<boolean>;
  setAutoUpdate: (enabled: boolean) => Promise<boolean>;
  getAutoUpdate: () => Promise<boolean>;
  onUpdateStatus: (callback: (status: { status: string; data?: any }) => void) => () => void;
}

export interface OpenAtLoginResult {
  success: boolean;
  openAtLogin: boolean;
  /** 开发环境不会真正写系统登录项 */
  applied: boolean;
  error?: string;
}

export interface AppAPI {
  getVersion: () => Promise<string>;
  /** 写配置；打包后才同步系统登录项 */
  setOpenAtLogin: (enabled: boolean) => Promise<OpenAtLoginResult>;
}

export interface ShortcutUpdateResult {
  success: boolean;
  error?: string;
  shortcut: string;
}

export interface ShortcutAPI {
  get: () => Promise<string | null>;
  update: (shortcut: string) => Promise<ShortcutUpdateResult>;
}

export interface ShellAPI {
  openExternal: (url: string) => Promise<boolean>;
}
