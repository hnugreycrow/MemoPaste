import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { registerWindowIpcHandlers } from "./window-ipc";
import { isAppQuitting } from "./app-quit-state";
import {
  captureForegroundWindow,
  readNativeHandle,
  restoreForegroundWindow,
  type ForegroundWindowHandle,
} from "../utils/foreground-window";

export { setAppIsQuitting } from "./app-quit-state";

export const PANEL_WIDTH = 380;
export const PANEL_HEIGHT = 520;
/** 透明窗体外留白，供 CSS 柔和阴影完整渲染，避免 Windows 透明窗裁切出四角黑块 */
export const SHADOW_PAD_X = 22;
export const SHADOW_PAD_TOP = 16;
export const SHADOW_PAD_BOTTOM = 28;
export const WINDOW_WIDTH = PANEL_WIDTH + SHADOW_PAD_X * 2;
export const WINDOW_HEIGHT = PANEL_HEIGHT + SHADOW_PAD_TOP + SHADOW_PAD_BOTTOM;

/** 打开后短时间内忽略 blur，避免快捷键松键或点托盘瞬间的焦点抖动误关浮窗 */
const BLUR_GRACE_MS = 180;

export type PanelShownPayload = {
  view: "list" | "settings";
};

/**
 * 单浮窗管理服务
 * - 唯一常驻隐藏浮窗（focusable: true），支持呼出即搜与内嵌设置
 * - 呼出前记录原前台窗口句柄，粘贴隐藏时归还焦点
 * - 失焦自动隐藏，支持在录制快捷键/弹窗时临时抑制
 */
export class WindowService {
  private panelWin: BrowserWindow | null = null;
  private previousForegroundHwnd: ForegroundWindowHandle | null = null;
  private shownAt = 0;
  private suppressBlurHide = false;
  private ipcRegistered = false;

  constructor(
    private readonly preloadPath: string,
    private readonly publicPath: string,
    private readonly rendererPath: string,
    private readonly devServerUrl?: string,
  ) {}

  private loadRenderer(win: BrowserWindow): void {
    if (this.devServerUrl) {
      win.loadURL(this.devServerUrl);
    } else {
      win.loadFile(path.join(this.rendererPath, "index.html"));
    }
  }

  private getSelfHandle(): ForegroundWindowHandle | null {
    if (!this.panelWin || this.panelWin.isDestroyed()) return null;
    try {
      return readNativeHandle(this.panelWin.getNativeWindowHandle());
    } catch {
      return null;
    }
  }

  /** 将浮窗可视卡片定位在光标附近，并夹紧在当前显示器工作区内 */
  private positionNearCursor(): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) return;

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: areaX, y: areaY, width: areaW, height: areaH } = display.workArea;

    // 先按可视卡片（PANEL_WIDTH × PANEL_HEIGHT）计算坐标，再减去阴影留白得到实际窗口左上角
    let cardX = cursor.x + 12;
    let cardY = cursor.y + 12;

    if (cardX + PANEL_WIDTH > areaX + areaW) {
      cardX = cursor.x - PANEL_WIDTH - 12;
    }
    if (cardY + PANEL_HEIGHT > areaY + areaH) {
      cardY = cursor.y - PANEL_HEIGHT - 12;
    }

    cardX = Math.max(areaX, Math.min(cardX, areaX + areaW - PANEL_WIDTH));
    cardY = Math.max(areaY, Math.min(cardY, areaY + areaH - PANEL_HEIGHT));

    this.panelWin.setPosition(Math.round(cardX - SHADOW_PAD_X), Math.round(cardY - SHADOW_PAD_TOP));
  }

  /** 创建唯一常驻浮窗；startHidden=false 时首次加载完成后展示一次 */
  public createPanelWindow(options?: { startHidden?: boolean }): BrowserWindow {
    const startHidden = !!options?.startHidden;

    this.panelWin = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      focusable: true,
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
      },
    });

    if (!this.ipcRegistered) {
      registerWindowIpcHandlers({
        hidePanel: () => this.hidePanel(),
        setBlurHideSuppressed: (suppressed) => this.setBlurHideSuppressed(suppressed),
      });
      this.ipcRegistered = true;
    }

    this.loadRenderer(this.panelWin);

    this.panelWin.once("ready-to-show", () => {
      if (!startHidden) {
        this.showPanel();
      }
    });

    this.panelWin.on("blur", () => {
      if (this.suppressBlurHide) return;
      if (Date.now() - this.shownAt < BLUR_GRACE_MS) return;
      this.hidePanel();
    });

    // 关闭操作仅隐藏，应用退出统一由托盘/设置退出按钮触发
    this.panelWin.on("close", (event) => {
      if (!isAppQuitting()) {
        event.preventDefault();
        this.hidePanel();
      }
    });

    return this.panelWin;
  }

  public getPanelWindow(): BrowserWindow | null {
    return this.panelWin;
  }

  public setBlurHideSuppressed(suppressed: boolean): void {
    this.suppressBlurHide = !!suppressed;
  }

  public showPanel(options?: { preserveState?: boolean; view?: "list" | "settings" }): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) {
      this.createPanelWindow({ startHidden: true });
    }
    if (!this.panelWin || this.panelWin.isDestroyed()) return;

    const preserveState = !!options?.preserveState;
    const view = options?.view ?? "list";

    if (!this.panelWin.isVisible()) {
      const captured = captureForegroundWindow(this.getSelfHandle());
      if (captured !== null) {
        this.previousForegroundHwnd = captured;
      }
    }

    if (!preserveState) {
      this.positionNearCursor();
    }

    this.suppressBlurHide = false;
    this.panelWin.setAlwaysOnTop(true, "pop-up-menu");
    this.shownAt = Date.now();
    this.panelWin.show();
    this.panelWin.focus();

    if (!preserveState || options?.view) {
      const payload: PanelShownPayload = { view };
      this.panelWin.webContents.send("panel-shown", payload);
    }
  }

  public showSettings(): void {
    this.showPanel({ view: "settings" });
  }

  public restorePanel(): void {
    this.showPanel({ preserveState: true });
  }

  public hidePanel(): void {
    this.suppressBlurHide = false;
    if (this.panelWin && !this.panelWin.isDestroyed() && this.panelWin.isVisible()) {
      this.panelWin.hide();
    }
  }

  /** 隐藏浮窗并将前台焦点交还给呼出前的目标窗口，供自动模拟粘贴使用 */
  public hideAndRestoreFocus(): void {
    this.hidePanel();
    restoreForegroundWindow(this.previousForegroundHwnd);
  }

  public togglePanel(): void {
    if (!this.panelWin || this.panelWin.isDestroyed()) {
      this.createPanelWindow({ startHidden: true });
    }
    if (this.panelWin?.isVisible()) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  public dispose(): void {
    this.previousForegroundHwnd = null;
    if (this.panelWin && !this.panelWin.isDestroyed()) {
      this.panelWin.removeAllListeners("close");
      this.panelWin.removeAllListeners("blur");
      this.panelWin.destroy();
    }
    this.panelWin = null;
  }
}
