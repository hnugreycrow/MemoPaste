import { autoUpdater } from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";
import { ConfigService } from "./config-service";

/** GitHub Releases 自动更新：检查 / 下载 / 安装，状态推给主窗口 */
export class UpdateService {
  private mainWindow: BrowserWindow;
  private configService: ConfigService;

  constructor(mainWindow: BrowserWindow, configService: ConfigService) {
    this.mainWindow = mainWindow;
    this.configService = configService;
    void this.configService;

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
      this.sendStatusToWindow("error", err);
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
        return await autoUpdater.checkForUpdates();
      } catch (error) {
        console.error("检查更新失败:", error);
        return { error };
      }
    });

    ipcMain.handle("download-update", async () => {
      try {
        autoUpdater.downloadUpdate();
        return true;
      } catch (error) {
        console.error("下载更新失败:", error);
        return { error };
      }
    });

    ipcMain.handle("install-update", () => {
      // isSilent=false：走正常安装 UI；isForceRunAfter=true：装完强制重启进新版本
      autoUpdater.quitAndInstall(false, true);
      return true;
    });
  }

  private sendStatusToWindow(status: string, data?: any) {
    this.mainWindow.webContents.send("update-status", { status, data });
  }

  public checkForUpdates() {
    return autoUpdater.checkForUpdates();
  }

  public dispose() {
    ipcMain.removeHandler("check-for-updates");
    ipcMain.removeHandler("download-update");
    ipcMain.removeHandler("install-update");
    // 旧版曾暴露这两路；退出时清掉，防重复注册/幽灵 handler
    ipcMain.removeHandler("set-auto-update");
    ipcMain.removeHandler("get-auto-update");
  }
}
