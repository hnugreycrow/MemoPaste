import { Tray, Menu, nativeImage, app } from "electron";
import { WindowService } from "./window-service";
import { ClipboardService } from "./clipboard-service";

/** 系统托盘：左键切换浮窗，右键精简为暂停/恢复、偏好设置与退出 */
export class TrayService {
  private tray: Tray | null = null;
  private shortcutConflict = false;

  constructor(
    private readonly windowService: WindowService,
    private readonly clipboardService: ClipboardService,
    private readonly iconPath: string,
  ) {}

  public createTray(): Tray {
    const icon = nativeImage.createFromPath(this.iconPath);
    this.tray = new Tray(icon);
    this.updateTooltip();
    this.refreshMenu();

    this.tray.on("click", () => {
      this.windowService.togglePanel();
    });

    return this.tray;
  }

  public setShortcutConflict(conflict: boolean): void {
    this.shortcutConflict = !!conflict;
    this.updateTooltip();
  }

  private updateTooltip(): void {
    if (!this.tray) return;
    const suffixes: string[] = [];
    if (this.clipboardService.isPaused()) suffixes.push("已暂停记录");
    if (this.shortcutConflict) suffixes.push("快捷键未生效");
    const suffix = suffixes.length > 0 ? `（${suffixes.join("，")}）` : "";
    this.tray.setToolTip(`MemoPaste v${app.getVersion()}${suffix}`);
  }

  public refreshMenu(): void {
    if (!this.tray) return;

    this.updateTooltip();
    const paused = this.clipboardService.isPaused();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: paused ? "恢复记录" : "暂停记录",
        click: () => {
          this.clipboardService.setPaused(!this.clipboardService.isPaused());
        },
      },
      {
        label: "偏好设置",
        click: () => {
          this.windowService.showSettings();
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
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
