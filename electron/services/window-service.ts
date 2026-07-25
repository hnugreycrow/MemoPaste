import { BrowserWindow, ipcMain, screen, app, globalShortcut } from "electron";
import path from "node:path";
import { ConfigService } from "./config-service";
import {
  installOutsideClickHook,
  uninstallOutsideClickHook,
} from "../utils/outside-click-hook";

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
  /** 面板显示期间临时注册的导航快捷键（Esc/↑↓/Enter） */
  private panelShortcutsRegistered = false;

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
    const baseWidth = 1000;
    const baseHeight = 700;
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
      icon: path.join(this.publicPath, "icon.png"),
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

    // 唯一关主窗策略：点 × / Alt+F4 / IPC 都走 close；托盘退出前会置 appIsQuitting
    this.win.on("close", (event) => {
      if (appIsQuitting) return;
      if (this.configService.get<boolean>("minimizeToTray")) {
        event.preventDefault();
        this.win?.hide();
      }
    });

    // 场景：用户主动关闭主窗口（点击 ×），且应用未开启「关闭到托盘」功能。
    // 判定：如果 appIsQuitting === false，说明这次关闭不是由 app.quit() 发起的正常退出流程。
    // 动作：此时主窗口虽已销毁，但 panelWin（常驻面板）可能仍在运行，会阻止 Electron 进程退出。
    //       必须手动清理 panelWin 并主动调用 app.quit()，否则应用会在后台常驻挂起。
    this.win.on("closed", () => {
      this.win = null;
      if (appIsQuitting) return;
      appIsQuitting = true;
      uninstallOutsideClickHook();
      this.unregisterPanelShortcuts();
      if (this.panelWin && !this.panelWin.isDestroyed()) {
        this.panelWin.destroy();
      }
      this.panelWin = null;
      app.quit();
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
      icon: path.join(this.publicPath, "icon.png"),
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

  /** 向面板发送导航指令（面板 focusable:false，需全局快捷键转发） */
  private sendPanelNav(action: "up" | "down" | "enter"): void {
    if (!this.panelWin || this.panelWin.isDestroyed() || !this.panelWin.isVisible()) {
      return;
    }
    this.panelWin.webContents.send("panel-nav", action);
  }

  /** 面板打开时注册 Esc / ↑↓ / Enter（面板自身收不到键盘焦点） */
  private registerPanelShortcuts(): void {
    if (this.panelShortcutsRegistered) return;

    const bindings: Array<{ accelerator: string; handler: () => void }> = [
      { accelerator: "Escape", handler: () => this.hidePanel() },
      { accelerator: "Up", handler: () => this.sendPanelNav("up") },
      { accelerator: "Down", handler: () => this.sendPanelNav("down") },
      { accelerator: "Return", handler: () => this.sendPanelNav("enter") },
    ];

    let anyOk = false;
    for (const { accelerator, handler } of bindings) {
      try {
        const ok = globalShortcut.register(accelerator, handler);
        if (!ok) {
          console.warn(`Failed to register panel shortcut: ${accelerator}`);
        } else {
          anyOk = true;
        }
      } catch (error) {
        console.warn(`Error registering panel shortcut ${accelerator}:`, error);
      }
    }
    this.panelShortcutsRegistered = anyOk;
  }

  private unregisterPanelShortcuts(): void {
    if (!this.panelShortcutsRegistered) return;
    for (const accelerator of ["Escape", "Up", "Down", "Return"]) {
      try {
        globalShortcut.unregister(accelerator);
      } catch {
        // ignore
      }
    }
    this.panelShortcutsRegistered = false;
  }

  private registerIpcHandlers(): void {
    ipcMain.on("window-minimize", () => {
      this.win?.minimize();
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
      // 主窗一律 close；是否藏托盘由 win.on("close") 统一决定
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
    this.registerPanelShortcuts();
    this.installPanelOutsideClickHook();
    this.panelWin.webContents.send("panel-shown");
  }

  public hidePanel(): void {
    uninstallOutsideClickHook();
    this.unregisterPanelShortcuts();
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
    uninstallOutsideClickHook();
    this.unregisterPanelShortcuts();
    if (this.panelWin && !this.panelWin.isDestroyed()) {
      this.panelWin.removeAllListeners("close");
      this.panelWin.destroy();
    }
    this.panelWin = null;
    this.win = null;
  }

  /** 面板可见时：点击落在 bounds 外则隐藏（WH_MOUSE_LL） */
  private installPanelOutsideClickHook(): void {
    installOutsideClickHook({
      isPointInside: (screenX, screenY) => {
        const win = this.panelWin;
        if (!win || win.isDestroyed() || !win.isVisible()) return false;
        // 钩子坐标为屏幕物理像素；getBounds 为 DIP
        const dipPoint = screen.screenToDipPoint({ x: screenX, y: screenY });
        const b = win.getBounds();
        return (
          dipPoint.x >= b.x &&
          dipPoint.x < b.x + b.width &&
          dipPoint.y >= b.y &&
          dipPoint.y < b.y + b.height
        );
      },
      onOutsideClick: () => this.hidePanel(),
    });
  }
}

/** 应用退出中：允许面板真正 destroy，而不只是 hide */
let appIsQuitting = false;

export function setAppIsQuitting(value: boolean): void {
  appIsQuitting = value;
}
