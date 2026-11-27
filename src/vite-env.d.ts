/// <reference types="vite/client" />

import type { ClipboardAPI, ConfigAPI, PanelControls, AppAPI, ShortcutAPI } from "./utils/type";

declare global {
  interface Window {
    clipboard: ClipboardAPI;
    config: ConfigAPI;
    panel: PanelControls;
    app: AppAPI;
    shortcut: ShortcutAPI;
  }
}

export {};
