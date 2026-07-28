/// <reference types="vite/client" />

import type {
  WindowControls,
  ClipboardAPI,
  ConfigAPI,
  UpdateControls,
  PanelControls,
  AppAPI,
  ShortcutAPI,
  ShellAPI,
  ThemeAPI,
} from "./utils/type";

declare global {
  interface Window {
    windowControls: WindowControls;
    clipboard: ClipboardAPI;
    config: ConfigAPI;
    theme: ThemeAPI;
    updater: UpdateControls;
    panel: PanelControls;
    app: AppAPI;
    shortcut: ShortcutAPI;
    shell: ShellAPI;
  }
}

export {};
