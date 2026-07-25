import { Tray, Menu, nativeImage, app } from 'electron';
import { WindowService } from './window-service';

/**
 * 托盘服务类
 * 负责处理所有与系统托盘相关的操作，包括：
 * - 创建系统托盘图标
 * - 设置托盘菜单
 * - 处理托盘事件
 */
export class TrayService {
  private tray: Tray | null = null;
  private readonly windowService: WindowService;
  private readonly iconPath: string;

  /**
   * 构造函数
   * @param windowService 窗口服务实例，用于控制窗口显示/隐藏
   * @param iconPath 托盘图标路径
   */
  constructor(windowService: WindowService, iconPath: string) {
    this.windowService = windowService;
    this.iconPath = iconPath;
  }

  /**
   * 创建系统托盘
   * @returns 创建的Tray实例
   */
  public createTray(): Tray {
    // 创建托盘图标
    const icon = nativeImage.createFromPath(this.iconPath);
    this.tray = new Tray(icon);
    this.tray.setToolTip(`MemoPaste v${app.getVersion()}`);

    // 设置托盘菜单
    this.updateContextMenu();

    // 点击托盘图标时显示/隐藏窗口
    this.tray.on('click', () => {
      this.windowService.toggleWindow();
    });

    return this.tray;
  }

  /**
   * 更新托盘上下文菜单
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    // 托盘菜单：快捷面板与主窗口分离入口
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开快捷面板',
        click: () => {
          this.windowService.showPanel();
        },
      },
      {
        label: '显示主窗口',
        click: () => {
          this.windowService.showWindow();
        },
      },
      {
        label: '隐藏主窗口',
        click: () => {
          this.windowService.hideWindow();
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          // before-quit 会置 appIsQuitting，避免被「关闭到托盘」拦截
          app.quit();
        },
      },
    ]);

    // 设置托盘菜单
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * 获取当前托盘实例
   * @returns 当前托盘实例或null
   */
  public getTray(): Tray | null {
    return this.tray;
  }

  /**
   * 清理资源
   * 在应用退出前调用，确保释放所有资源
   */
  public dispose(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}