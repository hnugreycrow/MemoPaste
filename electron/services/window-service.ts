import { BrowserWindow, ipcMain, screen, app, globalShortcut } from "electron";
import path from "node:path";
import { ConfigService } from "./config-service";

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 480;

/**
 * 窗口管理服务
 * - 主窗口：完整管理界面
 * - 快捷面板：不抢焦点的浮层，用于快速粘贴；Esc / 全局快捷键关闭
 */
export class WindowService {
  private win: BrowserWindow | null = null;
  private panelWin: BrowserWindow | null = null;
  private readonly preloadPath: string;
  private readonly publicPath: string;
  private readonly rendererPath: string;
  private readonly devServerUrl: string | undefined;
  private configService: ConfigService;
  private blurHideTimer: NodeJS.Timeout | null = null;
  /** 面板显示期间临时注册的 Esc 全局快捷键 */
  private escapeRegistered = false;

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
    const baseWidth = 1100;
    const baseHeight = 760;
    const absoluteMaxWidth = 1280;
    const absoluteMaxHeight = 900;
    const screenRatioCap = 0.9;

    const maxWidth = Math.min(
      Math.floor(screenWidth * screenRatioCap),
      absoluteMaxWidth,
    );
    const maxHeight = Math.min(
      Math.floor(screenHeight * screenRatioCap),
      absoluteMaxHeight,
    );

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

  /** 将面板放到光标附近，并夹紧在当前显示器工作区内 */
  private positionPanelNearCursor(): void {
    if (!this.panelWin) return;

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: areaX, y: areaY, width: areaW, height: areaH } = display.workArea;

    let x = cursor.x + 12;
    let y = cursor.y + 12;

    // 右侧/下方放不下则翻到光标另一侧
    if (x + PANEL_WIDTH > areaX + areaW) {
      x = cursor.x - PANEL_WIDTH - 12;
    }
    if (y + PANEL_HEIGHT > areaY + areaH) {
      y = cursor.y - PANEL_HEIGHT - 12;
    }

    x = Math.max(areaX, Math.min(x, areaX + areaW - PANEL_WIDTH));
    y = Math.max(areaY, Math.min(y, areaY + areaH - PANEL_HEIGHT));

    this.panelWin.setPosition(Math.round(x), Math.round(y));
  }

  /** 加载渲染页；hashPath 用于区分主窗口与面板路由（hash history） */
  private loadRenderer(win: BrowserWindow, hashPath?: string): void {
    if (this.devServerUrl) {
      const url = hashPath
        ? `${this.devServerUrl}#${hashPath}`
        : this.devServerUrl;
      win.loadURL(url);
    } else {
      const options = hashPath ? { hash: hashPath } : undefined;
      win.loadFile(path.join(this.rendererPath, "index.html"), options);
    }
  }

  /**
   * 创建主窗口
   */
  public createWindow(): BrowserWindow {
    const { width, height } = this.calculateSmartWindowSize();

    this.win = new BrowserWindow({
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      icon: path.join(this.publicPath, "electron.svg"),
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        additionalArguments: ["--window-role=main"],
      },
    });

    this.registerIpcHandlers();
    this.loadRenderer(this.win);

    this.win.once("ready-to-show", () => {
      this.win?.show();
    });

    this.win.on("maximize", () => {
      this.win?.webContents.send("window-maximize-changed", true);
    });

    this.win.on("unmaximize", () => {
      this.win?.webContents.send("window-maximize-changed", false);
    });

    // 主窗口销毁时退出应用（面板常驻隐藏，不会触发 window-all-closed）
    this.win.on("closed", () => {
      this.win = null;
      if (!appIsQuitting) {
        appIsQuitting = true;
        this.unregisterPanelEscape();
        if (this.panelWin && !this.panelWin.isDestroyed()) {
          this.panelWin.destroy();
        }
        this.panelWin = null;
        app.quit();
      }
    });

    return this.win;
  }

  /**
   * 创建快捷面板（Win+V 风格）
   * focusable: false + 后续 showInactive：不抢原输入框焦点，便于直接粘贴
   */
  public createPanelWindow(): BrowserWindow {
    this.panelWin = new BrowserWindow({
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      frame: false,
      focusable: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      icon: path.join(this.publicPath, "electron.svg"),
      webPreferences: {
        preload: this.preloadPath,
        additionalArguments: ["--window-role=panel"],
      },
    });

    this.loadRenderer(this.panelWin, "/panel");

    // 关闭按钮只隐藏，避免销毁后快捷键无法再打开
    this.panelWin.on("close", (event) => {
      if (!appIsQuitting) {
        event.preventDefault();
        this.hidePanel();
      }
    });

    return this.panelWin;
  }

  /** 面板打开时注册 Esc 关闭（面板自身收不到键盘焦点） */
  private registerPanelEscape(): void {
    if (this.escapeRegistered) return;
    const ok = globalShortcut.register("Escape", () => {
      this.hidePanel();
    });
    this.escapeRegistered = !!ok;
  }

  private unregisterPanelEscape(): void {
    if (!this.escapeRegistered) return;
    globalShortcut.unregister("Escape");
    this.escapeRegistered = false;
  }

  private registerIpcHandlers(): void {
    ipcMain.on("window-minimize", () => {
      const minimizeToTray = this.configService.get<boolean>("minimizeToTray");
      if (minimizeToTray) {
        this.win?.hide();
      } else {
        this.win?.minimize();
      }
    });

    ipcMain.on("window-maximize", () => {
      if (this.win?.isMaximized()) {
        this.win.unmaximize();
      } else {
        this.win?.maximize();
      }
    });

    ipcMain.handle("window-is-maximized", () => {
      return this.win?.isMaximized() || false;
    });

    ipcMain.on("window-close", (event) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      // 面板的关闭等同隐藏
      if (senderWin === this.panelWin) {
        this.hidePanel();
        return;
      }
      this.win?.close();
    });

    // 渲染进程据此区分主窗口 / 面板（主题背景、更新弹窗等）
    ipcMain.handle("window-get-role", (event) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (senderWin === this.panelWin) return "panel";
      return "main";
    });

    ipcMain.on("panel-hide", () => {
      this.hidePanel();
    });

    ipcMain.on("panel-open-main", () => {
      this.hidePanel();
      this.showAndFocus();
    });

    // 主窗口改主题后广播到其他窗口（如快捷面板）
    ipcMain.on("theme-changed", (event, theme: string) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.webContents.id !== event.sender.id) {
          win.webContents.send("theme-changed", theme);
        }
      }
    });
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
    return this.panelWin;
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

  /**
   * 显示快捷面板：showInactive 不抢原输入框焦点；Esc / 全局快捷键关闭
   */
  public showPanel(): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) return;

    this.positionPanelNearCursor();
    this.panelWin.setAlwaysOnTop(true, "pop-up-menu");
    this.panelWin.showInactive();
    this.registerPanelEscape();
    this.panelWin.webContents.send("panel-shown");
  }

  public hidePanel(): void {
    if (this.blurHideTimer) {
      clearTimeout(this.blurHideTimer);
      this.blurHideTimer = null;
    }
    this.unregisterPanelEscape();
    if (this.panelWin && !this.panelWin.isDestroyed() && this.panelWin.isVisible()) {
      this.panelWin.hide();
    }
  }

  /**
   * 切换快捷面板显隐
   */
  public togglePanel(): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) {
      this.createPanelWindow();
    }

    if (this.panelWin?.isVisible()) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  public dispose(): void {
    if (this.blurHideTimer) {
      clearTimeout(this.blurHideTimer);
      this.blurHideTimer = null;
    }
    this.unregisterPanelEscape();
    if (this.panelWin && !this.panelWin.isDestroyed()) {
      this.panelWin.removeAllListeners("close");
      this.panelWin.destroy();
    }
    this.panelWin = null;
    this.win = null;
  }
}

/** 应用退出中：允许面板真正 destroy，而不只是 hide */
let appIsQuitting = false;

export function setAppIsQuitting(value: boolean): void {
  appIsQuitting = value;
}
