import Store from 'electron-store';

// 定义配置类型
interface ConfigSchema {
  theme: 'light' | 'dark';
  shortcut: string;
  minimizeToTray: boolean;
  openAtLogin: boolean;
  dataRetentionDays: number; // 数据保存天数
  // 可以在这里添加更多配置项
  [key: string]: any; // 允许任意键值对
}

/**
 * 配置服务类
 * 负责处理所有与配置相关的操作，包括：
 * - 读取配置
 * - 保存配置
 * - 监听配置变更
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
}