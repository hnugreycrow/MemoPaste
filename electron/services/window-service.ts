import { BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { ConfigService } from "./config-service";

/**
 * 窗口管理服务类
 * 负责处理所有与窗口相关的操作，包括：
 * - 创建主窗口
 * - 处理窗口事件（最小化、最大化、关闭等）
 * - 管理窗口状态
 */
export class WindowService {
  private win: BrowserWindow | null = null;
  private readonly preloadPath: string;
  private readonly publicPath: string;
  private readonly rendererPath: string;
  private readonly devServerUrl: string | undefined;
  private configService: ConfigService;

  /**
   * 构造函数
   * @param preloadPath 预加载脚本路径
   * @param publicPath 公共资源目录路径
   * @param rendererPath 渲染进程构建产物目录路径
   * @param devServerUrl 开发服务器URL（开发环境）
   */
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
   * 智能自适应窗口尺寸计算
   * 以设计稿为基准；小屏按工作区比例缩小，大屏用绝对上限避免过大。
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
    // 大屏硬顶，避免随分辨率线性放大
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

  /**
   * 创建主窗口
   * @returns 创建的BrowserWindow实例
   */
  public createWindow(): BrowserWindow {
    const { width, height } = this.calculateSmartWindowSize();
    // 创建窗口
    this.win = new BrowserWindow({
      width: width,
      height: height,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      icon: path.join(this.publicPath, "electron.svg"), // 窗口图标路径
      show: false, // 先不显示窗口，等窗口准备好了才显示，防止渲染未完成时出现白框
      webPreferences: {
        preload: this.preloadPath, // 预加载脚本路径（用于安全地在渲染进程中暴露API）
      },
    });

    // 注册IPC事件处理程序
    this.registerIpcHandlers();

    // 窗口加载完成后，向渲染进程发送测试消息（主进程→渲染进程通信示例）
    this.win.webContents.on("did-finish-load", () => {
      this.win?.webContents.send(
        "main-process-message",
        new Date().toLocaleString(),
      );
    });

    // 根据环境加载不同的页面：
    // 开发环境：加载Vite开发服务器（支持热更新）
    // 生产环境：加载本地构建好的index.html
    if (this.devServerUrl) {
      this.win.loadURL(this.devServerUrl);
    } else {
      this.win.loadFile(path.join(this.rendererPath, "index.html"));
    }

    // 窗口准备好后显示
    this.win.once("ready-to-show", () => {
      this.win?.show();
    });

    // 监听窗口最大化状态变化
    this.win.on("maximize", () => {
      this.win?.webContents.send("window-maximize-changed", true);
    });

    this.win.on("unmaximize", () => {
      this.win?.webContents.send("window-maximize-changed", false);
    });

    return this.win;
  }

  /**
   * 注册IPC事件处理程序
   */
  private registerIpcHandlers(): void {
    // 最小化窗口（实际是隐藏窗口）
    ipcMain.on("window-minimize", () => {
      const minimizeToTray = this.configService.get<boolean>("minimizeToTray");
      if (minimizeToTray) {
        this.win?.hide();
      } else {
        this.win?.minimize();
      }
    });

    // 最大化/还原窗口
    ipcMain.on("window-maximize", () => {
      if (this.win?.isMaximized()) {
        this.win.unmaximize();
      } else {
        this.win?.maximize();
      }
    });

    // 获取窗口最大化状态
    ipcMain.handle("window-is-maximized", () => {
      return this.win?.isMaximized() || false;
    });

    // 关闭窗口
    ipcMain.on("window-close", () => {
      this.win?.close();
    });
  }

  /**
   * 安全地显示并聚焦窗口
   * 适用于：单实例二次启动、托盘点击、全局快捷键
   */
  public showAndFocus(): void {
    if (!this.win) return; // 窗口还没创建就忽略

    if (this.win.isMinimized()) {
      this.win.restore(); // 从最小化恢复
    }
    if (!this.win.isVisible()) {
      this.win.show(); // 从“隐藏到托盘”恢复
    }
    this.win.focus(); // 抢焦点
  }

  /**
   * 获取当前窗口实例
   * @returns 当前窗口实例或null
   */
  public getWindow(): BrowserWindow | null {
    return this.win;
  }

  /**
   * 显示窗口
   */
  public showWindow(): void {
    if (this.win) {
      this.win.show();
      this.win.focus();
    }
  }

  /**
   * 隐藏窗口
   */
  public hideWindow(): void {
    if (this.win) {
      this.win.hide();
    }
  }

  /**
   * 最小化窗口
   */
  public minimizeWindow(): void {
    if (this.win) {
      this.win.minimize();
    }
  }

  /**
   * 切换窗口显示状态
   */
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
   * 清理资源
   * 在应用退出前调用，确保释放所有资源
   */
  public dispose(): void {
    this.win = null;
  }
}
