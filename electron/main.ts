import { app, ipcMain } from "electron"; // 导入Electron核心模块：app(应用控制)
import { fileURLToPath } from "node:url"; // 导入Node模块：将URL转换为文件路径
import path from "node:path"; // 导入Node模块：处理文件路径
// 导入数据库服务
import { initDatabase, closeDatabase, clearExpiredClipboardItems } from "./database/clipboard";
// 导入自定义服务
import {
  WindowService,
  TrayService,
  ClipboardService,
  ShortcutService,
  ConfigService,
  UpdateService,
  setAppIsQuitting,
} from "./services";
import { isLaunchedHiddenAtLogin } from "./utils/login-item";

// 防止多开：单实例锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果获取锁失败，说明已有实例在运行，直接退出
  app.quit();
} else {
  app.on("second-instance", () => {
    // 当用户尝试打开第二个实例时，聚焦已有窗口
    if (windowService) {
      windowService.showAndFocus();
    }
  });
}

// 获取当前文件的目录路径（__dirname在ES模块中需手动定义）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 目录结构说明（项目构建后）：
// ├─┬─┬ dist                  # 渲染进程构建产物
// │ │ └── index.html          # 主页面
// │ │
// │ ├─┬ dist-electron         # 主进程构建产物
// │ │ ├── main.js             # 主进程入口
// │ │ └── preload.mjs         # 预加载脚本
// │

// 设置应用根目录环境变量（指向项目根目录，方便后续路径计算）
process.env.APP_ROOT = path.join(__dirname, "..");

// 开发环境下Vite服务器的URL（从环境变量获取，用于开发时热更新）
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
// 主进程构建产物目录（dist-electron）
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
// 渲染进程构建产物目录（dist）
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

// 公共资源目录：开发环境用public文件夹，生产环境用渲染进程构建目录
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

// 声明服务实例（全局变量避免被垃圾回收）
let windowService: WindowService | null = null;
let trayService: TrayService | null = null;
let clipboardService: ClipboardService | null = null;
let shortcutService: ShortcutService | null = null;
let configService: ConfigService | null = null;
let updateService: UpdateService | null = null;

/**
 * 清理应用资源
 * 在应用退出前释放所有资源
 */
function disposeServices() {
  // 关闭数据库连接
  closeDatabase();

  // 释放各服务资源
  if (clipboardService) {
    clipboardService.dispose();
    clipboardService = null;
  }

  if (shortcutService) {
    shortcutService.dispose();
    shortcutService = null;
  }

  if (trayService) {
    trayService.dispose();
    trayService = null;
  }

  if (updateService) {
    updateService.dispose();
    updateService = null;
  }

  if (windowService) {
    windowService.dispose();
    windowService = null;
  }

  // 配置服务不需要特别的清理操作
  configService = null;
}

// 监听所有窗口关闭事件：
// 在非macOS系统（如Windows、Linux），所有窗口关闭后退出应用
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // darwin是macOS的标识
    app.quit();
  }
});

// 监听应用激活事件（主要针对macOS）：
// 当点击 dock 图标且没有其他窗口打开时，重新创建窗口
app.on("activate", () => {
  if (!windowService || !windowService.getWindow()) {
    initializeServices();
  }
});

/**
 * 初始化应用服务
 * 创建并初始化所有服务实例
 */
function initializeServices() {
  // 创建配置服务（最先初始化，因为其他服务可能依赖它）
  configService = new ConfigService();

  // 清除过期的剪贴板记录
  const retentionDays = configService.get<number>("dataRetentionDays");
  const clearedCount = clearExpiredClipboardItems(retentionDays);
  console.log(`Cleared ${clearedCount} expired clipboard items on startup`);

  // 创建窗口服务
  windowService = new WindowService(
    path.join(__dirname, "preload.mjs"),
    process.env.VITE_PUBLIC as string,
    RENDERER_DIST,
    configService,
    VITE_DEV_SERVER_URL,
  );

  // 创建主窗口与不抢焦点的快捷面板（面板默认隐藏）
  const mainWindow = windowService.createWindow({
    startHidden: isLaunchedHiddenAtLogin(),
  });
  windowService.createPanelWindow();

  // 创建托盘服务
  trayService = new TrayService(
    windowService,
    path.join(process.env.VITE_PUBLIC as string, "icon.png"),
  );
  trayService.createTray();

  // 创建剪贴板服务
  clipboardService = new ClipboardService(mainWindow, windowService);

  // 创建快捷键服务
  shortcutService = new ShortcutService(windowService, configService);

  // 注册保存的快捷键
  const savedShortcut = configService.get<string>("shortcut");
  if (savedShortcut) {
    shortcutService.registerGlobalShortcut(savedShortcut);
  }

  // 创建更新服务
  updateService = new UpdateService(mainWindow, configService);
}

/**
 * 注册应用程序相关的IPC处理程序（版本、外链；配置/开机自启在 ConfigService）
 */
function registerAppIpcHandlers() {
  ipcMain.handle("app-get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("open-external-url", async (_event, url: unknown) => {
    // 渲染进程不可信：只放行 https + 已知 host，挡 file:/javascript: 等
    if (typeof url !== "string" || !isAllowedExternalUrl(url)) {
      console.warn("Rejected open-external-url:", url);
      return false;
    }
    try {
      const { shell } = await import("electron");
      await shell.openExternal(url);
      return true;
    } catch (error) {
      console.error("Failed to open external URL:", error);
      return false;
    }
  });
}

/** 当前产品只从设置页打开仓库链接；扩域时改这里即可 */
const ALLOWED_EXTERNAL_HOSTS = new Set(["github.com", "www.github.com"]);

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// 应用就绪后初始化数据库并创建主窗口（Electron应用启动的入口点）
app.whenReady().then(() => {
  // 初始化数据库，判断是否为开发环境
  const isDevelopment = !!VITE_DEV_SERVER_URL;
  try {
    initDatabase(isDevelopment);
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }

  // 初始化所有服务
  initializeServices();

  configService?.registerIpcHandlers();
  registerAppIpcHandlers();
  configService?.syncOpenAtLoginFromSystem();
});

app.on("before-quit", () => {
  setAppIsQuitting(true);
});

// 应用退出前清理资源
app.on("will-quit", () => {
  setAppIsQuitting(true);
  disposeServices();
});
