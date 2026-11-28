import { globalShortcut, ipcMain } from "electron";
import { WindowService } from "./window-service";
import { ConfigService } from "./config-service";
import { DEFAULT_SHORTCUT, normalizeShortcut, validateShortcut } from "@shared/shortcut";
import type { ShortcutStatus, ShortcutUpdateResult } from "../../src/utils/type";

export type { ShortcutStatus, ShortcutUpdateResult };

/**
 * 快捷键服务：注册 / 更新 / 临时暂停全局快捷键（切换浮窗）
 */
export class ShortcutService {
  private currentShortcut: string | null = null;
  private suspendedShortcut: string | null = null;
  private lastRegistrationError: string | null = null;
  private onStatusChanged: ((status: ShortcutStatus) => void) | null = null;

  constructor(
    private readonly windowService: WindowService,
    private readonly configService: ConfigService,
  ) {
    this.registerIpcHandlers();
  }

  public setOnStatusChanged(listener: ((status: ShortcutStatus) => void) | null): void {
    this.onStatusChanged = listener;
  }

  private registerIpcHandlers(): void {
    ipcMain.handle("shortcut-get", () => this.getStatus().shortcut);
    ipcMain.handle("shortcut-get-status", (): ShortcutStatus => this.getStatus());

    ipcMain.handle("shortcut-update", (_event, newShortcut: unknown): ShortcutUpdateResult => {
      if (typeof newShortcut !== "string") {
        return { success: false, error: "请输入有效的快捷键组合", shortcut: this.getStatus().shortcut };
      }
      return this.updateShortcut(newShortcut);
    });

    ipcMain.handle("shortcut-set-suspended", (_event, suspended: unknown): void => {
      if (typeof suspended !== "boolean") return;
      if (suspended) this.suspend();
      else this.resume();
    });
  }

  public getStatus(): ShortcutStatus {
    const active = this.currentShortcut ?? this.suspendedShortcut;
    const configured = this.configService.get<string>("shortcut") || DEFAULT_SHORTCUT;
    return {
      shortcut: active ?? configured,
      registered: active !== null,
      error: active !== null ? null : this.lastRegistrationError,
    };
  }

  /** 录制期间临时注销当前全局热键，避免按到原快捷键直接关闭浮窗 */
  public suspend(): void {
    if (!this.currentShortcut) return;
    const active = this.currentShortcut;
    this.currentShortcut = null;
    this.suspendedShortcut = active;
    globalShortcut.unregister(active);
  }

  /** 结束录制或隐藏浮窗时恢复被暂停的全局热键 */
  public resume(): void {
    if (!this.suspendedShortcut) return;
    const toRestore = this.suspendedShortcut;
    this.suspendedShortcut = null;
    this.registerGlobalShortcut(toRestore);
  }

  /** 更新全局快捷键：校验 → 注销旧键 → 注册新键；失败则回滚旧键 */
  public updateShortcut(rawShortcut: string): ShortcutUpdateResult {
    const activeBefore = this.currentShortcut ?? this.suspendedShortcut;
    const oldShortcut = activeBefore ?? this.configService.get<string>("shortcut") ?? DEFAULT_SHORTCUT;

    const validated = validateShortcut(rawShortcut);
    if (!validated.success) {
      return { success: false, error: validated.error, shortcut: oldShortcut };
    }

    const newShortcut = validated.shortcut;
    if (activeBefore && normalizeShortcut(activeBefore) === newShortcut) {
      if (this.suspendedShortcut) {
        this.suspendedShortcut = null;
        const restored = this.registerGlobalShortcut(newShortcut);
        if (!restored.success) {
          return { success: false, error: restored.error ?? "快捷键注册失败", shortcut: oldShortcut };
        }
      }
      return { success: true, shortcut: newShortcut };
    }

    if (this.currentShortcut) {
      globalShortcut.unregister(this.currentShortcut);
      this.currentShortcut = null;
    }
    this.suspendedShortcut = null;

    const result = this.registerGlobalShortcut(newShortcut);
    if (!result.success) {
      if (activeBefore) {
        this.registerGlobalShortcut(activeBefore);
      }
      return { success: false, error: result.error ?? "快捷键注册失败", shortcut: oldShortcut };
    }

    this.configService.set("shortcut", newShortcut);
    return { success: true, shortcut: newShortcut };
  }

  public registerGlobalShortcut(shortcut: string): { success: boolean; error: string | null } {
    const validated = validateShortcut(shortcut);
    if (!validated.success) {
      this.lastRegistrationError = validated.error;
      this.onStatusChanged?.(this.getStatus());
      return { success: false, error: validated.error };
    }

    const normalized = validated.shortcut;
    try {
      const registered = globalShortcut.register(normalized, () => {
        this.windowService.togglePanel();
      });

      if (!registered) {
        const error = "快捷键已被其他应用占用，请换一个组合";
        this.lastRegistrationError = error;
        this.onStatusChanged?.(this.getStatus());
        return { success: false, error };
      }

      this.currentShortcut = normalized;
      this.lastRegistrationError = null;
      this.onStatusChanged?.(this.getStatus());
      return { success: true, error: null };
    } catch (error) {
      console.error("注册快捷键时发生错误:", error);
      const message = "注册快捷键时发生错误";
      this.lastRegistrationError = message;
      this.onStatusChanged?.(this.getStatus());
      return { success: false, error: message };
    }
  }

  public dispose(): void {
    globalShortcut.unregisterAll();
    this.currentShortcut = null;
    this.suspendedShortcut = null;
    this.lastRegistrationError = null;
    this.onStatusChanged = null;
  }
}
