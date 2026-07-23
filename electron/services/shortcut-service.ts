import { globalShortcut, ipcMain } from "electron";
import { WindowService } from "./window-service";
import { ConfigService } from "./config-service";

/**
 * 快捷键服务类
 * 负责处理所有与全局快捷键相关的操作，包括：
 * - 注册全局快捷键
 * - 注销全局快捷键
 * - 处理快捷键更新
 */
export class ShortcutService {
  private windowService: WindowService;
  private configService: ConfigService;
  private currentShortcut: string | null = null;

  /**
   * 构造函数
   * @param windowService 窗口服务实例，用于控制窗口显示/隐藏
   * @param configService 配置服务实例，用于存储和读取配置
   */
  constructor(windowService: WindowService, configService: ConfigService) {
    this.windowService = windowService;
    this.configService = configService;
    this.registerIpcHandlers();
  }

  /**
   * 注册IPC事件处理程序
   */
  private registerIpcHandlers(): void {
    // 获取当前快捷键
    ipcMain.on("get-current-shortcut", (event) => {
      const currentShortcut = this.configService.get<string>('shortcut');
      event.sender.send("shortcut-current", currentShortcut);
    });
    
    // 修改启动快捷键
    ipcMain.on("update-shortcut", (_event, { oldShortcut, newShortcut }) => {
      // 先注销旧快捷键
      if (oldShortcut) {
        globalShortcut.unregister(oldShortcut);
      }

      // 注册新快捷键
      if (newShortcut) {
        const result = this.registerGlobalShortcut(newShortcut);
        const window = this.windowService.getWindow();

        // 如果注册失败，发送错误消息回渲染进程
        if (!result.success) {
          console.log("快捷键注册失败，发送错误消息:", result.error);
          window?.webContents.send("shortcut-update-result", {
            success: false,
            error: result.error,
            shortcut: oldShortcut,
          });
          // 尝试重新注册旧快捷键
          if (oldShortcut) {
            this.registerGlobalShortcut(oldShortcut);
          }
        } else {
          // 注册成功，发送成功消息
          console.log("快捷键注册成功，发送成功消息");
          window?.webContents.send("shortcut-update-result", {
            success: true,
            shortcut: newShortcut,
          });
          // 使用通用配置方法保存快捷键
          this.configService.set('shortcut', newShortcut);
        }
      }
    });
  }

  /**
   * 注册全局快捷键
   * @param shortcut 要注册的快捷键
   * @returns 包含注册结果和错误信息的对象
   */
  public registerGlobalShortcut(shortcut: string): {
    success: boolean;
    error: string | null;
  } {
    // 检查快捷键格式是否有效
    if (!shortcut || shortcut.trim() === "") {
      return { success: false, error: "快捷键格式无效" };
    }

    try {
      // 检查快捷键是否已被注册（被其他应用占用）
      if (globalShortcut.isRegistered(shortcut)) {
        return { success: false, error: "快捷键已被其他应用占用" };
      }

      const shortcutRegistered = globalShortcut.register(shortcut, () => {
        // 全局快捷键切换不抢焦点的快捷面板（而非主窗口）
        this.windowService.togglePanel();
      });

      if (!shortcutRegistered) {
        console.error("快捷键注册失败");
        return { success: false, error: "快捷键注册失败" };
      }

      this.currentShortcut = shortcut;
      return { success: true, error: null };
    } catch (error) {
      console.error("注册快捷键时发生错误:", error);
      return { success: false, error: "注册快捷键时发生错误" };
    }
  }

  /**
   * 获取当前注册的快捷键
   * @returns 当前注册的快捷键或null
   */
  public getCurrentShortcut(): string | null {
    return this.currentShortcut;
  }

  /**
   * 清理资源
   * 在应用退出前调用，确保释放所有资源
   */
  public dispose(): void {
    // 注销所有快捷键
    globalShortcut.unregisterAll();
    this.currentShortcut = null;
  }
}
