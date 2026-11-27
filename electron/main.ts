import { app, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initDatabase, closeDatabase, clearExpiredClipboardItems } from "./database/clipboard";
import {
  WindowService,
  TrayService,
  ClipboardService,
  ShortcutService,
  ConfigService,
  setAppIsQuitting,
} from "./services";
import { isLaunchedHiddenAtLogin } from "./utils/login-item";
import {
  registerClipimgSchemePrivileged,
  registerClipimgProtocolHandler,
} from "./clipimg-protocol";

// 自定义图片协议须在 ready 前注册特权
registerClipimgSchemePrivileged();

/** 禁止多开：第二个进程拿不到锁则退出，由已有实例呼出浮窗 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    windowService?.showPanel();
  });
}

// ESM 无 __dirname，从 import.meta.url 还原
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

// 挂到模块级，避免被 GC 掉导致托盘/快捷键失效
let windowService: WindowService | null = null;
let trayService: TrayService | null = null;
let clipboardService: ClipboardService | null = null;
let shortcutService: ShortcutService | null = null;
let configService: ConfigService | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** 非收藏历史固定保留 1 天（24 小时），启动时及每小时定时清理 */
const RETENTION_DAYS = 1;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function runExpiredCleanup() {
  const clearedCount = clearExpiredClipboardItems(RETENTION_DAYS);
  if (clearedCount > 0) {
    console.log(`Cleared ${clearedCount} expired clipboard items`);
    const panelWin = windowService?.getPanelWindow();
    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.webContents.send("clipboard-changed");
    }
  }
}

function disposeServices() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  closeDatabase();

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

  if (windowService) {
    windowService.dispose();
    windowService = null;
  }

  configService = null;
}

// 单浮窗常驻系统托盘，关闭/隐藏窗口不退出进程（仅托盘/设置「退出」调用 app.quit）
app.on("window-all-closed", () => {
  // intentionally keep running in tray
});

app.on("activate", () => {
  if (!windowService) {
    initializeServices();
  } else {
    windowService.showPanel();
  }
});

function initializeServices() {
  configService = new ConfigService();

  runExpiredCleanup();
  cleanupTimer = setInterval(runExpiredCleanup, CLEANUP_INTERVAL_MS);

  windowService = new WindowService(
    path.join(__dirname, "preload.mjs"),
    process.env.VITE_PUBLIC as string,
    RENDERER_DIST,
    VITE_DEV_SERVER_URL,
  );

  // 开机自启带 --hidden 时静默进托盘；手动启动时浮窗就绪后展示一次
  const savedTheme = configService.get<"light" | "dark">("theme");
  windowService.createPanelWindow({
    startHidden: isLaunchedHiddenAtLogin(),
    theme: savedTheme === "dark" ? "dark" : "light",
  });

  clipboardService = new ClipboardService(windowService);

  shortcutService = new ShortcutService(windowService, configService);
  const savedShortcut = configService.get<string>("shortcut");
  if (savedShortcut) {
    shortcutService.registerGlobalShortcut(savedShortcut);
  }

  trayService = new TrayService(
    windowService,
    clipboardService,
    shortcutService,
    path.join(process.env.VITE_PUBLIC as string, "tray-icon.png"),
  );
  trayService.createTray();

  clipboardService.setOnPausedChanged(() => trayService?.refreshMenu());
  shortcutService.setOnShortcutChanged(() => trayService?.refreshMenu());
}

/** 版本与退出 IPC；配置/开机自启在 ConfigService */
function registerAppIpcHandlers() {
  ipcMain.handle("app-get-version", () => {
    return app.getVersion();
  });

  ipcMain.on("app-quit", () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  const isDevelopment = !!VITE_DEV_SERVER_URL;
  try {
    initDatabase(isDevelopment);
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }

  registerClipimgProtocolHandler();
  initializeServices();

  configService?.registerIpcHandlers();
  registerAppIpcHandlers();
  configService?.syncOpenAtLoginFromSystem();
});

app.on("before-quit", () => {
  setAppIsQuitting(true);
});

app.on("will-quit", () => {
  setAppIsQuitting(true);
  disposeServices();
});
