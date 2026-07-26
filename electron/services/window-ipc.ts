import { BrowserWindow, ipcMain } from "electron";

export type WindowIpcDeps = {
  getMainWindow: () => BrowserWindow | null;
  getPanelWindow: () => BrowserWindow | null;
  hidePanel: () => void;
  showAndFocus: () => void;
};

/** 主窗口 / 面板相关 IPC（最小化、最大化、角色、主题广播等） */
export function registerWindowIpcHandlers(deps: WindowIpcDeps): void {
  ipcMain.on("window-minimize", () => {
    deps.getMainWindow()?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    const win = deps.getMainWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle("window-is-maximized", () => {
    return deps.getMainWindow()?.isMaximized() || false;
  });

  ipcMain.on("window-close", (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin === deps.getPanelWindow()) {
      deps.hidePanel();
      return;
    }
    // 主窗一律 close；是否藏托盘由 win.on("close") 统一决定
    deps.getMainWindow()?.close();
  });

  // 渲染进程据此区分主窗口 / 面板（主题背景、更新弹窗等）
  ipcMain.handle("window-get-role", (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin === deps.getPanelWindow()) return "panel";
    return "main";
  });

  ipcMain.on("panel-hide", () => {
    deps.hidePanel();
  });

  ipcMain.on("panel-open-main", () => {
    deps.hidePanel();
    deps.showAndFocus();
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
