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
  UpdateService,
  setAppIsQuitting,
} from "./services";
import { isLaunchedHiddenAtLogin } from "./utils/login-item";
import {
  registerClipimgSchemePrivileged,
  registerClipimgProtocolHandler,
} from "./clipimg-protocol";

// 自定义图片协议须在 ready 前注册特权
registerClipimgSchemePrivileged();

/** 禁止多开：第二个进程拿不到锁则退出 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // 再开一次应回到主管理窗，而不是弹出/切换快捷面板
    if (windowService) {
      windowService.showAndFocus();
    }
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
let updateService: UpdateService | null = null;

function disposeServices() {
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

  if (updateService) {
    updateService.dispose();
    updateService = null;
  }

  if (windowService) {
    windowService.dispose();
    windowService = null;
  }

  configService = null;
}

// Windows/Linux：关光窗口即退出；macOS 常驻 dock，由 activate 重建
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!windowService || !windowService.getWindow()) {
    initializeServices();
  }
});

function initializeServices() {
  // 其它服务依赖配置，最先建
  configService = new ConfigService();

  const retentionDays = configService.get<number>("dataRetentionDays");
  const clearedCount = clearExpiredClipboardItems(retentionDays);
  console.log(`Cleared ${clearedCount} expired clipboard items on startup`);

  windowService = new WindowService(
    path.join(__dirname, "preload.mjs"),
    process.env.VITE_PUBLIC as string,
    RENDERER_DIST,
    configService,
    VITE_DEV_SERVER_URL,
  );

  // 面板默认隐藏；开机自启带 --hidden 时主窗也不显示
  const mainWindow = windowService.createWindow({
    startHidden: isLaunchedHiddenAtLogin(),
  });
  windowService.createPanelWindow();

  trayService = new TrayService(
    windowService,
    path.join(process.env.VITE_PUBLIC as string, "icon.png"),
  );
  trayService.createTray();

  clipboardService = new ClipboardService(mainWindow, windowService);

  shortcutService = new ShortcutService(windowService, configService);

  const savedShortcut = configService.get<string>("shortcut");
  if (savedShortcut) {
    shortcutService.registerGlobalShortcut(savedShortcut);
  }

  updateService = new UpdateService(mainWindow, configService);
}

/** 版本与外链 IPC；配置/开机自启在 ConfigService */
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
