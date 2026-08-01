import { autoUpdater } from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";
import { ConfigService } from "./config-service";

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** GitHub Releases 自动更新：检查 / 下载 / 安装，状态推给主窗口 */
export class UpdateService {
  private mainWindow: BrowserWindow;
  private configService: ConfigService;
  private checking = false;
  private autoCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(mainWindow: BrowserWindow, configService: ConfigService) {
    this.mainWindow = mainWindow;
    this.configService = configService;

    this.configureAutoUpdater();
    this.registerIpcHandlers();
  }

  private configureAutoUpdater() {
    // 默认不自动下包，等用户在弹窗里确认，避免抢带宽/意外更新
    autoUpdater.autoDownload = false;

    autoUpdater.on("checking-for-update", () => {
      this.sendStatusToWindow("checking-for-update");
    });

    autoUpdater.on("update-available", (info) => {
      this.sendStatusToWindow("update-available", info);
    });

    autoUpdater.on("update-not-available", (info) => {
      this.sendStatusToWindow("update-not-available", info);
    });

    autoUpdater.on("error", (err) => {
      this.sendStatusToWindow("error", {
        name: err?.name || "Error",
        message: err?.message || String(err),
      });
    });

    autoUpdater.on("download-progress", (progressObj) => {
      this.sendStatusToWindow("download-progress", progressObj);
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.sendStatusToWindow("update-downloaded", info);
    });
  }

  private registerIpcHandlers() {
    ipcMain.handle("check-for-updates", async () => {
      try {
        return await this.checkForUpdates();
      } catch (error) {
        console.error("检查更新失败:", error);
        return {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });

    ipcMain.handle("download-update", async () => {
      try {
        await autoUpdater.downloadUpdate();
        return true;
      } catch (error) {
        console.error("下载更新失败:", error);
        return {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });

    ipcMain.handle("install-update", () => {
      // isSilent=false：走正常安装 UI；isForceRunAfter=true：装完强制重启进新版本
      autoUpdater.quitAndInstall(false, true);
      return true;
    });
  }

  private sendStatusToWindow(status: string, data?: unknown) {
    if (this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) {
      return;
    }
    this.mainWindow.webContents.send("update-status", { status, data });
  }

  /** 窗口就绪后安排一次自动检查（已显示则短延迟，避免抢启动） */
  public scheduleAutoCheck() {
    const run = () => {
      void this.maybeAutoCheck();
    };

    if (this.mainWindow.isVisible()) {
      this.autoCheckTimer = setTimeout(run, 3000);
      return;
    }

    this.mainWindow.once("ready-to-show", () => {
      this.autoCheckTimer = setTimeout(run, 3000);
    });
  }

  /** 尊重开关与 24h 节流；手动检查不走此路径 */
  private async maybeAutoCheck() {
    const enabled = this.configService.get<boolean>("autoCheckUpdate");
    if (!enabled) return;

    const lastCheckAt = this.configService.get<number | undefined>("lastUpdateCheckAt") ?? 0;
    if (Date.now() - lastCheckAt < AUTO_CHECK_INTERVAL_MS) return;

    try {
      const result = await this.checkForUpdates();
      // null 表示已有检查在进行，不写入时间戳以免误跳过下次自动检查
      if (result !== null) {
        this.configService.set("lastUpdateCheckAt", Date.now());
      }
    } catch (error) {
      console.error("自动检查更新失败:", error);
    }
  }

  public async checkForUpdates() {
    if (this.checking) {
      return null;
    }
    this.checking = true;
    try {
      return await autoUpdater.checkForUpdates();
    } finally {
      this.checking = false;
    }
  }

  public dispose() {
    if (this.autoCheckTimer) {
      clearTimeout(this.autoCheckTimer);
      this.autoCheckTimer = null;
    }
    ipcMain.removeHandler("check-for-updates");
    ipcMain.removeHandler("download-update");
    ipcMain.removeHandler("install-update");
    autoUpdater.removeAllListeners();
  }
}
