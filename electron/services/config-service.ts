import Store from "electron-store";
import { app, ipcMain } from "electron";
import type { AppConfig, ConfigKey } from "../../src/utils/type";
import { applyOpenAtLogin, syncOpenAtLoginFromSystem } from "../utils/login-item";

/** 渲染进程可读写的配置键；未列入的 key 一律拒绝，避免任意落盘 */
const CONFIG_KEYS = new Set<ConfigKey>([
  "theme",
  "shortcut",
  "minimizeToTray",
  "openAtLogin",
  "dataRetentionDays",
  "version",
  "autoCheckUpdate",
]);

function isConfigKey(key: unknown): key is ConfigKey {
  return typeof key === "string" && CONFIG_KEYS.has(key as ConfigKey);
}

/** 已知键再校验值类型，防止脏数据写进 electron-store */
function validateConfigValue(key: ConfigKey, value: unknown): boolean {
  switch (key) {
    case "theme":
      return value === "light" || value === "dark";
    case "shortcut":
    case "version":
      return typeof value === "string";
    case "minimizeToTray":
    case "openAtLogin":
    case "autoCheckUpdate":
      return typeof value === "boolean";
    case "dataRetentionDays":
      return typeof value === "number" && Number.isInteger(value) && value > 0;
    default:
      return false;
  }
}

/** 本地配置与开机自启（electron-store + 登录项 IPC） */
export class ConfigService {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      defaults: {
        theme: "light",
        shortcut: "Alt+Shift+C",
        minimizeToTray: false,
        openAtLogin: false,
        dataRetentionDays: 1,
        version: "1.0.0",
        autoCheckUpdate: true,
      },
      name: "config",
    });
  }

  public setConfig(config: Partial<AppConfig>): void {
    this.store.set(config);
  }

  /** 主进程可读写全部 AppConfig 键（含 lastUpdateCheckAt）；渲染进程经 IPC 白名单限制 */
  public get<T>(key: keyof AppConfig): T {
    return this.store.get(key) as T;
  }

  public set<T>(key: keyof AppConfig, value: T): void {
    this.store.set(key, value);
  }

  public getShortcut(): string {
    return this.store.get("shortcut");
  }

  public setShortcut(shortcut: string): void {
    this.store.set("shortcut", shortcut);
  }

  public getAll(): AppConfig {
    return this.store.store;
  }

  /**
   * 系统登录项可能被用户在系统设置里改掉；
   * 启动时以系统为准回写，避免 UI 与真实状态不一致。
   */
  public syncOpenAtLoginFromSystem(): void {
    syncOpenAtLoginFromSystem(
      () => !!this.get<boolean>("openAtLogin"),
      (enabled) => this.set("openAtLogin", enabled),
    );
  }

  public registerIpcHandlers(): void {
    ipcMain.handle("config-get", (_event, key: unknown) => {
      if (!isConfigKey(key)) {
        console.warn("Rejected config-get for unknown key:", key);
        return undefined;
      }
      return this.get(key);
    });

    ipcMain.handle("config-set", (_event, key: unknown, value: unknown) => {
      if (!isConfigKey(key)) {
        console.warn("Rejected config-set for unknown key:", key);
        return false;
      }
      if (!validateConfigValue(key, value)) {
        console.warn("Rejected config-set for invalid value:", key, value);
        return false;
      }
      this.set(key, value as AppConfig[ConfigKey]);
      return true;
    });

    ipcMain.handle("config-get-all", () => {
      return this.getAll();
    });

    // 写配置；真正改系统登录项仅在打包后生效（开发态 applied=false）
    ipcMain.handle("open-at-login-set", (_event, enabled: boolean) => {
      const value = !!enabled;
      this.set("openAtLogin", value);
      try {
        applyOpenAtLogin(value);
        return { success: true, openAtLogin: value, applied: app.isPackaged };
      } catch (error) {
        console.error("Failed to set open at login:", error);
        return {
          success: false,
          openAtLogin: value,
          applied: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }
}
