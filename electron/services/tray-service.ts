import { Tray, Menu, nativeImage, app } from "electron";
import { WindowService } from "./window-service";

/** 系统托盘：快捷面板 / 主窗入口，以及真正退出 */
export class TrayService {
  private tray: Tray | null = null;
  private readonly windowService: WindowService;
  private readonly iconPath: string;

  constructor(windowService: WindowService, iconPath: string) {
    this.windowService = windowService;
    this.iconPath = iconPath;
  }

  public createTray(): Tray {
    const icon = nativeImage.createFromPath(this.iconPath);
    this.tray = new Tray(icon);
    this.tray.setToolTip(`MemoPaste v${app.getVersion()}`);

    this.updateContextMenu();

    this.tray.on("click", () => {
      this.windowService.toggleWindow();
    });

    return this.tray;
  }

  private updateContextMenu(): void {
    if (!this.tray) return;

    // 面板与主窗分开入口，避免「显示主窗口」误当成打开面板
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "打开快捷面板",
        click: () => {
          this.windowService.showPanel();
        },
      },
      {
        label: "显示主窗口",
        click: () => {
          this.windowService.showWindow();
        },
      },
      {
        label: "隐藏主窗口",
        click: () => {
          this.windowService.hideWindow();
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          // before-quit 会置 appIsQuitting，避免被「关闭到托盘」拦截
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public getTray(): Tray | null {
    return this.tray;
  }

  public dispose(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
