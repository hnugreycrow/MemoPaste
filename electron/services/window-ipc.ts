import { ipcMain } from "electron";

export type WindowIpcDeps = {
  hidePanel: () => void;
  setBlurHideSuppressed: (suppressed: boolean) => void;
};

/** 单浮窗控制 IPC（隐藏、临时抑制失焦隐藏） */
export function registerWindowIpcHandlers(deps: WindowIpcDeps): void {
  ipcMain.on("panel-hide", () => {
    deps.hidePanel();
  });

  ipcMain.on("panel-set-blur-suppressed", (_event, suppressed: unknown) => {
    deps.setBlurHideSuppressed(!!suppressed);
  });
}
