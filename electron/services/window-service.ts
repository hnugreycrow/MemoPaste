import { BrowserWindow, screen, app } from "electron";
import path from "node:path";
import { ConfigService } from "./config-service";
import { PanelWindowManager } from "./panel-window-manager";
import { registerWindowIpcHandlers } from "./window-ipc";
import { isAppQuitting, setAppIsQuitting } from "./app-quit-state";
import { uninstallOutsideClickHook } from "../utils/outside-click-hook";

export { setAppIsQuitting } from "./app-quit-state";

/**
 * 窗口管理服务（门面）
 * - 主窗口：完整管理界面
 * - 快捷面板：委托 PanelWindowManager
 */
export class WindowService {
  private win: BrowserWindow | null = null;
  private readonly preloadPath: string;
  private readonly publicPath: string;
  private readonly rendererPath: string;
  private readonly devServerUrl: string | undefined;
  private configService: ConfigService;
  private panel: PanelWindowManager;

  constructor(
    preloadPath: string,
    publicPath: string,
    rendererPath: string,
    configService: ConfigService,
    devServerUrl?: string,
  ) {
    this.preloadPath = preloadPath;
    this.publicPath = publicPath;
    this.rendererPath = rendererPath;
    this.devServerUrl = devServerUrl;
    this.configService = configService;
    this.panel = new PanelWindowManager(preloadPath, publicPath, (win, hashPath) =>
      this.loadRenderer(win, hashPath),
    );
  }

  /**
   * 智能自适应主窗口尺寸：设计稿基准 + 屏幕比例上限 + 绝对上限
   */
  private calculateSmartWindowSize(): {
    width: number;
    height: number;
    x?: number;
    y?: number;
  } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const {
      width: screenWidth,
      height: screenHeight,
      x: screenX,
      y: screenY,
    } = primaryDisplay.workArea;

    const minWidth = 800;
    const minHeight = 600;
    const baseWidth = 1000;
    const baseHeight = 700;
    const absoluteMaxWidth = 1280;
    const absoluteMaxHeight = 900;
    const screenRatioCap = 0.9;

    const maxWidth = Math.min(Math.floor(screenWidth * screenRatioCap), absoluteMaxWidth);
    const maxHeight = Math.min(Math.floor(screenHeight * screenRatioCap), absoluteMaxHeight);

    const finalWidth = Math.max(minWidth, Math.min(baseWidth, maxWidth));
    const finalHeight = Math.max(minHeight, Math.min(baseHeight, maxHeight));

    const x = Math.floor(screenX + (screenWidth - finalWidth) / 2);
    const y = Math.floor(screenY + (screenHeight - finalHeight) / 2);

    return {
      width: finalWidth,
      height: finalHeight,
      x,
      y,
    };
  }

  /** 加载渲染页；hashPath 用于区分主窗口与面板路由（hash history） */
  private loadRenderer(win: BrowserWindow, hashPath?: string): void {
    if (this.devServerUrl) {
      const url = hashPath ? `${this.devServerUrl}#${hashPath}` : this.devServerUrl;
      win.loadURL(url);
    } else {
      const options = hashPath ? { hash: hashPath } : undefined;
      win.loadFile(path.join(this.rendererPath, "index.html"), options);
    }
  }

  /**
   * 创建主窗口
   * @param options.startHidden 登录启动时为 true，ready-to-show 后不自动显示
   */
  public createWindow(options?: { startHidden?: boolean }): BrowserWindow {
    const startHidden = !!options?.startHidden;
    const { width, height } = this.calculateSmartWindowSize();

    this.win = new BrowserWindow({
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      icon: path.join(this.publicPath, "icon.png"),
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        additionalArguments: ["--window-role=main"],
      },
    });

    registerWindowIpcHandlers({
      getMainWindow: () => this.win,
      getPanelWindow: () => this.panel.getWindow(),
      hidePanel: () => this.hidePanel(),
      showAndFocus: () => this.showAndFocus(),
    });
    this.loadRenderer(this.win);

    this.win.once("ready-to-show", () => {
      if (!startHidden) {
        this.win?.show();
      }
    });

    this.win.on("maximize", () => {
      this.win?.webContents.send("window-maximize-changed", true);
    });

    this.win.on("unmaximize", () => {
      this.win?.webContents.send("window-maximize-changed", false);
    });

    // 唯一关主窗策略：点 × / Alt+F4 / IPC 都走 close；托盘退出前会置 appIsQuitting
    this.win.on("close", (event) => {
      if (isAppQuitting()) return;
      if (this.configService.get<boolean>("minimizeToTray")) {
        event.preventDefault();
        this.win?.hide();
      }
    });

    // 用户主动关闭主窗口且未开「关闭到托盘」时：清理面板并退出，避免后台常驻
    this.win.on("closed", () => {
      this.win = null;
      if (isAppQuitting()) return;
      setAppIsQuitting(true);
      uninstallOutsideClickHook();
      this.panel.unregisterShortcuts();
      this.panel.destroy();
      app.quit();
    });

    return this.win;
  }

  public createPanelWindow(): BrowserWindow {
    return this.panel.create();
  }

  public showAndFocus(): void {
    if (!this.win) return;

    if (this.win.isMinimized()) {
      this.win.restore();
    }
    if (!this.win.isVisible()) {
      this.win.show();
    }
    this.win.focus();
  }

  public getWindow(): BrowserWindow | null {
    return this.win;
  }

  public getPanelWindow(): BrowserWindow | null {
    return this.panel.getWindow();
  }

  public showWindow(): void {
    if (this.win) {
      this.win.show();
      this.win.focus();
    }
  }

  public hideWindow(): void {
    if (this.win) {
      this.win.hide();
    }
  }

  public minimizeWindow(): void {
    if (this.win) {
      this.win.minimize();
    }
  }

  public toggleWindow(): void {
    if (this.win) {
      if (this.win.isVisible()) {
        this.win.hide();
      } else {
        this.win.show();
        this.win.focus();
      }
    }
  }

  public showPanel(): void {
    this.panel.show();
  }

  public hidePanel(): void {
    this.panel.hide();
  }

  public togglePanel(): void {
    this.panel.toggle();
  }

  public dispose(): void {
    this.panel.destroy();
    this.win = null;
  }
}
