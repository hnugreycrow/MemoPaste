import { globalShortcut, ipcMain } from "electron";
import { WindowService } from "./window-service";
import { ConfigService } from "./config-service";
import { normalizeShortcut, validateShortcut } from "@shared/shortcut";

export type ShortcutUpdateResult = {
  success: boolean;
  error?: string;
  shortcut: string;
};

/**
 * 快捷键服务：注册 / 更新全局快捷键（切换快捷面板）
 */
export class ShortcutService {
  private windowService: WindowService;
  private configService: ConfigService;
  private currentShortcut: string | null = null;

  constructor(windowService: WindowService, configService: ConfigService) {
    this.windowService = windowService;
    this.configService = configService;
    this.registerIpcHandlers();
  }

  private registerIpcHandlers(): void {
    ipcMain.handle("shortcut-get", () => {
      return this.currentShortcut ?? this.configService.get<string>("shortcut") ?? null;
    });

    ipcMain.handle("shortcut-update", (_event, newShortcut: string): ShortcutUpdateResult => {
      return this.updateShortcut(newShortcut);
    });
  }

  /**
   * 更新用户全局快捷键：校验 → 注销旧键 → 注册新键；失败则回滚旧键，避免快捷键丢了
   */
  public updateShortcut(rawShortcut: string): ShortcutUpdateResult {
    const oldShortcut = this.currentShortcut ?? this.configService.get<string>("shortcut") ?? null;

    const validated = validateShortcut(rawShortcut);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error,
        shortcut: oldShortcut ?? "",
      };
    }

    const newShortcut = validated.shortcut;

    if (oldShortcut && normalizeShortcut(oldShortcut) === newShortcut) {
      return { success: true, shortcut: newShortcut };
    }

    if (oldShortcut) {
      globalShortcut.unregister(oldShortcut);
    }

    const result = this.registerGlobalShortcut(newShortcut);
    if (!result.success) {
      if (oldShortcut) {
        this.registerGlobalShortcut(oldShortcut);
      }
      return {
        success: false,
        error: result.error ?? "快捷键注册失败，可能已被占用或格式无效",
        shortcut: oldShortcut ?? "",
      };
    }

    this.configService.set("shortcut", newShortcut);
    return { success: true, shortcut: newShortcut };
  }

  public registerGlobalShortcut(shortcut: string): {
    success: boolean;
    error: string | null;
  } {
    const validated = validateShortcut(shortcut);
    if (!validated.success) {
      return { success: false, error: validated.error };
    }

    const normalized = validated.shortcut;

    try {
      const registered = globalShortcut.register(normalized, () => {
        this.windowService.togglePanel();
      });

      if (!registered) {
        return {
          success: false,
          error: "快捷键注册失败，可能已被占用或格式无效",
        };
      }

      this.currentShortcut = normalized;
      return { success: true, error: null };
    } catch (error) {
      console.error("注册快捷键时发生错误:", error);
      return { success: false, error: "注册快捷键时发生错误" };
    }
  }

  public getCurrentShortcut(): string | null {
    return this.currentShortcut;
  }

  public dispose(): void {
    globalShortcut.unregisterAll();
    this.currentShortcut = null;
  }
}
