export interface ClipboardItem {
  id: number;
  type: string;
  /** 列表可能为预览截断；详情经 getItem 取全文 */
  content: string;
  searchPreview?: string;
  timestamp: Date;
  size: string;
  is_favorite?: boolean;
  /** 常用片段备注名（可为空） */
  alias?: string | null;
  content_hash?: string | null;
  file_path?: string | null;
  thumb_path?: string | null;
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
  image: number;
  favorite: number;
}

export type PasteResult = { status: "sent" | "copied" | "failed" | "busy" };

export interface ClipboardAPI {
  /** 按历史 id 写回系统剪贴板（文本或图片） */
  write: (id: number) => Promise<boolean>;
  /** 按 id 写入剪贴板、隐藏面板、归还前台焦点并模拟粘贴 */
  pasteAndHide: (id: number) => Promise<PasteResult>;
  getPaused: () => Promise<boolean>;
  setPaused: (paused: boolean) => Promise<boolean>;
  /** 主进程入库后通知刷新（无内容载荷） */
  onChanged: (callback: () => void) => () => void;
  onPausedChanged: (callback: (paused: boolean) => void) => () => void;
  deleteItem: (id: number) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  clearExceptFavorites: () => Promise<number>;
  getHistory: (
    page: number,
    pageSize: number,
    type: string,
    keyword?: string,
  ) => Promise<ClipboardHistoryResult>;
  /** 按 id 取全文（列表 getHistory 只含预览） */
  getItem: (id: number) => Promise<ClipboardItem | null>;
  setFavorite: (id: number, isFavorite: boolean) => Promise<boolean>;
  setAlias: (id: number, alias: string | null) => Promise<boolean>;
  getCounts: () => Promise<TypeCounts>;
}

export type ThemeMode = "light" | "dark";

/** 与主进程 config 白名单一致；未知键会被拒绝 */
export type ConfigKey = "theme" | "shortcut" | "openAtLogin";

export interface AppConfig {
  theme: ThemeMode;
  shortcut: string;
  openAtLogin: boolean;
}

export interface ConfigAPI {
  get: <T>(key: ConfigKey) => Promise<T | undefined>;
  set: <T>(key: ConfigKey, value: T) => Promise<boolean>;
  getAll: () => Promise<AppConfig>;
}

export type PanelShownPayload = {
  view: "list" | "settings";
};

export interface PanelControls {
  hide: () => void;
  /** 打开内嵌确认框或录制快捷键时临时抑制失焦隐藏 */
  setBlurHideSuppressed: (suppressed: boolean) => void;
  onShown: (callback: (payload: PanelShownPayload) => void) => () => void;
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
  quit: () => void;
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
