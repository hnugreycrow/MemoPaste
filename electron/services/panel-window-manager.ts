import { BrowserWindow, globalShortcut, screen } from "electron";
import path from "node:path";
import { installOutsideClickHook, uninstallOutsideClickHook } from "../utils/outside-click-hook";
import { isAppQuitting } from "./app-quit-state";

const PANEL_WIDTH = 350;
const PANEL_HEIGHT = 480;

export type RendererLoader = (win: BrowserWindow, hashPath?: string) => void;

/**
 * 快捷面板窗口：创建、定位、显隐、导航快捷键、外侧点击关闭
 */
export class PanelWindowManager {
  private panelWin: BrowserWindow | null = null;
  private panelShortcutsRegistered = false;

  constructor(
    private readonly preloadPath: string,
    private readonly publicPath: string,
    private readonly loadRenderer: RendererLoader,
  ) {}

  public getWindow(): BrowserWindow | null {
    return this.panelWin;
  }

  /**
   * 创建快捷面板（Win+V 风格）
   * focusable: false + 后续 showInactive：不抢原输入框焦点，便于直接粘贴
   */
  public create(): BrowserWindow {
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
      if (!isAppQuitting()) {
        event.preventDefault();
        this.hide();
      }
    });

    return this.panelWin;
  }

  /** 将面板放到光标附近，并夹紧在当前显示器工作区内 */
  private positionNearCursor(): void {
    if (!this.panelWin) return;

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: areaX, y: areaY, width: areaW, height: areaH } = display.workArea;

    let x = cursor.x + 12;
    let y = cursor.y + 12;

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

  /** 向面板发送导航指令（面板 focusable:false，需全局快捷键转发） */
  private sendNav(action: "up" | "down" | "enter"): void {
    if (!this.panelWin || this.panelWin.isDestroyed() || !this.panelWin.isVisible()) {
      return;
    }
    this.panelWin.webContents.send("panel-nav", action);
  }

  /** 面板打开时注册 Esc / ↑↓ / Enter（focusable:false 收不到键） */
  private registerShortcuts(): void {
    if (this.panelShortcutsRegistered) return;

    // 裸方向键/回车是全局抢占：只在面板可见时注册，hide 时必须注销
    const bindings: Array<{ accelerator: string; handler: () => void }> = [
      { accelerator: "Escape", handler: () => this.hide() },
      { accelerator: "Up", handler: () => this.sendNav("up") },
      { accelerator: "Down", handler: () => this.sendNav("down") },
      { accelerator: "Return", handler: () => this.sendNav("enter") },
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

  public unregisterShortcuts(): void {
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

  /** 面板可见时：点击落在 bounds 外则隐藏（WH_MOUSE_LL） */
  private installOutsideClickHook(): void {
    installOutsideClickHook({
      isPointInside: (screenX, screenY) => {
        const win = this.panelWin;
        if (!win || win.isDestroyed() || !win.isVisible()) return false;
        // WH_MOUSE_LL 给的是物理像素；getBounds() 是 DIP，高分屏必须先转换
        const dipPoint = screen.screenToDipPoint({ x: screenX, y: screenY });
        const b = win.getBounds();
        return (
          dipPoint.x >= b.x &&
          dipPoint.x < b.x + b.width &&
          dipPoint.y >= b.y &&
          dipPoint.y < b.y + b.height
        );
      },
      onOutsideClick: () => this.hide(),
    });
  }

  /**
   * 显示快捷面板：showInactive 不抢原输入框焦点；Esc / 全局快捷键关闭
   */
  public show(): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) return;

    this.positionNearCursor();
    this.panelWin.setAlwaysOnTop(true, "pop-up-menu");
    this.panelWin.showInactive();
    this.registerShortcuts();
    this.installOutsideClickHook();
    this.panelWin.webContents.send("panel-shown");
  }

  public hide(): void {
    uninstallOutsideClickHook();
    this.unregisterShortcuts();
    if (this.panelWin && !this.panelWin.isDestroyed() && this.panelWin.isVisible()) {
      this.panelWin.hide();
    }
  }

  public toggle(): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) {
      this.create();
    }

    if (this.panelWin?.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** 主窗口关闭或服务销毁时清理面板 */
  public destroy(): void {
    uninstallOutsideClickHook();
    this.unregisterShortcuts();
    if (this.panelWin && !this.panelWin.isDestroyed()) {
      this.panelWin.removeAllListeners("close");
      this.panelWin.destroy();
    }
    this.panelWin = null;
  }
}
