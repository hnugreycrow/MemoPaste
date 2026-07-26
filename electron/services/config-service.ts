import Store from 'electron-store';
import { app, ipcMain } from 'electron';
import {
  applyOpenAtLogin,
  syncOpenAtLoginFromSystem,
} from '../utils/login-item';

// 定义配置类型
interface ConfigSchema {
  theme: 'light' | 'dark';
  shortcut: string;
  minimizeToTray: boolean;
  openAtLogin: boolean;
  dataRetentionDays: number; // 数据保存天数
  version?: string;
  // 可以在这里添加更多配置项
  [key: string]: any; // 允许任意键值对
}

/**
 * 配置服务类
 * 负责处理所有与配置相关的操作，包括：
 * - 读取配置
 * - 保存配置
 * - 配置 / 开机自启 IPC
 */
export class ConfigService {
  private store: Store<ConfigSchema>;

  /**
   * 构造函数
   */
  constructor() {
    // 创建配置存储实例
    this.store = new Store<ConfigSchema>({
      // 默认配置
      defaults: {
        theme: 'dark',
        shortcut: 'Alt+Shift+C',
        minimizeToTray: false,
        openAtLogin: false,
        dataRetentionDays: 1, // 默认保存1天
        version: '1.0.0'
      },
      // 配置文件名
      name: 'config',
    });
  }

  /**
   * 设置整个配置对象
   * @param config 配置对象
   */
  public setConfig(config: Partial<ConfigSchema>): void {
    this.store.set(config);
  }
  
  /**
   * 通用的获取配置项方法
   * @param key 配置键名
   * @returns 配置值
   */
  public get<T>(key: string): T {
    return this.store.get(key) as T;
  }
  
  /**
   * 通用的设置配置项方法
   * @param key 配置键名
   * @param value 配置值
   */
  public set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }


  /**
   * 获取快捷键配置
   * @returns 当前快捷键
   */
  public getShortcut(): string {
    return this.store.get('shortcut');
  }

  /**
   * 设置快捷键配置
   * @param shortcut 快捷键
   */
  public setShortcut(shortcut: string): void {
    this.store.set('shortcut', shortcut);
  }

  /**
   * 获取所有配置
   * @returns 所有配置
   */
  public getAll(): ConfigSchema {
    return this.store.store;
  }

  /** 以系统登录项为准回写 openAtLogin */
  public syncOpenAtLoginFromSystem(): void {
    syncOpenAtLoginFromSystem(
      () => !!this.get<boolean>('openAtLogin'),
      (enabled) => this.set('openAtLogin', enabled),
    );
  }

  /** 注册配置与开机自启相关 IPC */
  public registerIpcHandlers(): void {
    ipcMain.handle('config-get', (_event, key: string) => {
      return this.get(key);
    });

    ipcMain.handle('config-set', (_event, key: string, value: unknown) => {
      this.set(key, value);
      return true;
    });

    ipcMain.handle('config-get-all', () => {
      return this.getAll();
    });

    // 开机自启：写配置 + 打包后同步系统登录项
    ipcMain.handle('open-at-login-set', (_event, enabled: boolean) => {
      const value = !!enabled;
      this.set('openAtLogin', value);
      try {
        applyOpenAtLogin(value);
        return { success: true, openAtLogin: value, applied: app.isPackaged };
      } catch (error) {
        console.error('Failed to set open at login:', error);
        return {
          success: false,
          openAtLogin: value,
          applied: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }
}
