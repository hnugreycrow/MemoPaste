import { app } from "electron";

/** 登录启动时附带的参数，用于隐藏主窗口；set/get 必须用同一套 args */
export const LOGIN_HIDDEN_ARG = "--hidden";
const loginItemArgs = [LOGIN_HIDDEN_ARG];

/**
 * 将开机自启状态同步到系统登录项（仅打包后生效，避免开发态注册 electron.exe）
 */
export function applyOpenAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? loginItemArgs : [],
  });
}

/** set 写了 args 后，get 必须传相同 args，否则会误报未注册 */
export function getLoginItemSettingsMatched() {
  return app.getLoginItemSettings({ args: loginItemArgs });
}

/** 是否由登录项以隐藏方式启动（Windows 看 argv；macOS 补充 wasOpenedAtLogin） */
export function isLaunchedHiddenAtLogin(): boolean {
  if (process.argv.includes(LOGIN_HIDDEN_ARG)) return true;
  if (process.platform === "darwin") {
    return !!getLoginItemSettingsMatched().wasOpenedAtLogin;
  }
  return false;
}

/**
 * 启动时以系统登录项为准回写配置（跟随任务管理器禁用：用 executableWillLaunchAtLogin）
 */
export function syncOpenAtLoginFromSystem(
  getStored: () => boolean,
  setStored: (enabled: boolean) => void,
): void {
  if (!app.isPackaged) return;
  const settings = getLoginItemSettingsMatched();
  // 已注册但被任务管理器禁用时，此字段为 false（openAtLogin 仍可能为 true）
  const systemEnabled = !!settings.executableWillLaunchAtLogin;
  const stored = getStored();
  if (stored !== systemEnabled) {
    setStored(systemEnabled);
  }
}
