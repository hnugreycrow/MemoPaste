/**
 * 服务模块索引文件
 * 集中导出所有服务，方便在主进程中使用
 */

export { ClipboardService } from "./clipboard-service";
export { WindowService, setAppIsQuitting } from "./window-service";
export { TrayService } from "./tray-service";
export { ShortcutService } from "./shortcut-service";
export { ConfigService } from "./config-service";
export { UpdateService } from "./update-service";
