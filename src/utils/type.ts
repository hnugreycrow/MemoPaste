/** 窗口控制 API */
export interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  /** 当前窗口角色：主窗口或快捷面板 */
  getRole: () => Promise<"main" | "panel">;
}

/** 剪贴板单项数据 */
export interface ClipboardItem {
  id: number;
  type: string;
  content: string;
  timestamp: Date;
  size: string;
  is_favorite?: boolean;
}

/** 剪贴板历史分页结果 */
export interface ClipboardHistoryResult {
  items: ClipboardItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 按类型统计的剪贴板计数 */
export interface TypeCounts {
  all: number;
  text: number;
  url: number;
  code: number;
  favorite: number;
}

/** 渲染进程暴露的剪贴板 API */
export interface ClipboardAPI {
  write: (text: string) => Promise<boolean>;
  // 监听
  startWatching: () => Promise<void>;
  stopWatching: () => Promise<void>;
  onChanged: (callback: (content: string) => void) => () => void;
  // 数据操作
  saveItem: (item: ClipboardItem) => Promise<number | null>;
  deleteItem: (id: number) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  clearExceptFavorites: () => Promise<number>;
  getHistory: (page: number, pageSize: number, type: string, keyword?: string) => Promise<ClipboardHistoryResult>;
  /** 写入剪贴板、隐藏面板并模拟粘贴到原窗口 */
  pasteAndHide: (text: string) => Promise<boolean>;
  // 收藏
  setFavorite: (id: number, isFavorite: boolean) => Promise<boolean>;
  // 计数
  getCounts: () => Promise<TypeCounts>;
}

/** 渲染进程暴露的配置 API */
export interface ConfigAPI {
  get: <T>(key: string) => Promise<T>;
  set: <T>(key: string, value: T) => Promise<boolean>;
  getAll: () => Promise<any>;
}

/** 渲染进程暴露的快捷面板 API */
export interface PanelControls {
  /** 隐藏快捷面板 */
  hide: () => void;
  /** 关闭面板并打开主窗口 */
  openMain: () => void;
  /** 监听面板显示事件，返回取消监听函数 */
  onShown: (callback: () => void) => () => void;
}

/** 渲染进程暴露的自动更新 API */
export interface UpdateControls {
  checkForUpdates: () => Promise<any>;
  downloadUpdate: () => Promise<boolean | { error: any }>;
  installUpdate: () => Promise<boolean>;
  setAutoUpdate: (enabled: boolean) => Promise<boolean>;
  getAutoUpdate: () => Promise<boolean>;
  onUpdateStatus: (callback: (status: { status: string; data?: any }) => void) => () => void;
}

/** 开机自启设置结果 */
export interface OpenAtLoginResult {
  success: boolean;
  openAtLogin: boolean;
  /** 是否已写入系统登录项（开发环境为 false） */
  applied: boolean;
  error?: string;
}

/** 应用信息 API */
export interface AppAPI {
  getVersion: () => Promise<string>;
  /** 设置开机自启（写配置；打包后同步系统登录项） */
  setOpenAtLogin: (enabled: boolean) => Promise<OpenAtLoginResult>;
}

/** 快捷键更新结果 */
export interface ShortcutUpdateResult {
  success: boolean;
  error?: string;
  shortcut: string;
}

/** 快捷键 API */
export interface ShortcutAPI {
  get: () => Promise<string | null>;
  update: (shortcut: string) => Promise<ShortcutUpdateResult>;
}

/** 打开外部链接 API */
export interface ShellAPI {
  openExternal: (url: string) => Promise<boolean>;
}
