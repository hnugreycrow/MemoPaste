import { Tray, Menu, nativeImage, app } from "electron";
import { WindowService } from "./window-service";
import { ClipboardService } from "./clipboard-service";
import { ShortcutService } from "./shortcut-service";
import { formatShortcutForDisplay } from "@shared/shortcut";

/** 系统托盘：左键切换浮窗，右键控制监听暂停、打开设置与退出 */
export class TrayService {
  private tray: Tray | null = null;

  constructor(
    private readonly windowService: WindowService,
    private readonly clipboardService: ClipboardService,
    private readonly shortcutService: ShortcutService,
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

  private updateTooltip(): void {
    if (!this.tray) return;
    const pausedSuffix = this.clipboardService.isPaused() ? "（已暂停记录）" : "";
    this.tray.setToolTip(`MemoPaste v${app.getVersion()}${pausedSuffix}`);
  }

  public refreshMenu(): void {
    if (!this.tray) return;

    this.updateTooltip();
    const paused = this.clipboardService.isPaused();
    const rawShortcut = this.shortcutService.getCurrentShortcut();
    const shortcutLabel = rawShortcut ? formatShortcutForDisplay(rawShortcut).join("+") : "";
    const openLabel = shortcutLabel ? `打开剪贴板（${shortcutLabel}）` : "打开剪贴板";

    const contextMenu = Menu.buildFromTemplate([
      {
        label: openLabel,
        click: () => {
          this.windowService.showPanel();
        },
      },
      {
        label: "暂停记录",
        type: "checkbox",
        checked: paused,
        click: () => {
          this.clipboardService.setPaused(!this.clipboardService.isPaused());
        },
      },
      {
        label: "设置",
        click: () => {
          this.windowService.showSettings();
        },
      },
      { type: "separator" },
      {
        label: "退出 MemoPaste",
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
