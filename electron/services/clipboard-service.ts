import { clipboard, ipcMain, BrowserWindow } from "electron";
import { createRequire } from "node:module";
import {
  saveClipboardItem,
  deleteClipboardItem,
  clearClipboardHistory,
  clearClipboardExceptFavorites,
  getClipboardHistory,
  setFavoriteStatus,
  getClipboardCounts,
} from "../database/clipboard";
import { simulatePaste } from "../utils/simulate-paste";
import type { WindowService } from "./window-service";

// 在ES模块中模拟CommonJS的require功能
const require = createRequire(import.meta.url);
const clipboardEvent = require("clipboard-event");

/**
 * 剪贴板服务类
 * 负责处理所有与剪贴板相关的操作，包括：
 * - 读写剪贴板内容
 * - 监听剪贴板变化
 * - 管理剪贴板历史记录
 * - 快捷面板选中后自动粘贴
 */
export class ClipboardService {
  private mainWindow: BrowserWindow | null = null;
  private windowService: WindowService | null = null;
  private lastClipboardContent: string = "";
  private isWatching: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 100;
  /** 自动粘贴进行中：忽略剪贴板监听，避免把自身写入再记一条 */
  private isAutoPasting = false;

  constructor(mainWindow: BrowserWindow, windowService?: WindowService) {
    this.mainWindow = mainWindow;
    this.windowService = windowService ?? null;
    this.lastClipboardContent = clipboard.readText();
    this.registerIpcHandlers();
  }

  private registerIpcHandlers(): void {
    ipcMain.handle("clipboard-write", (_, text) => {
      clipboard.writeText(text);
      // 同步 lastContent，防止应用自身写入再次触发「新记录」
      this.lastClipboardContent = text;
      return true;
    });

    /**
     * 快捷面板选中项：写入剪贴板 → 隐藏面板 → 模拟 Ctrl+V
     * 依赖面板不抢焦点，原输入框仍可接收按键
     */
    ipcMain.handle("clipboard-paste-and-hide", async (_, text: string) => {
      if (this.isAutoPasting) return false;
      this.isAutoPasting = true;
      try {
        clipboard.writeText(text);
        this.lastClipboardContent = text;
        this.windowService?.hidePanel();
        try {
          await simulatePaste();
        } catch (error) {
          // 内容已在剪贴板；按键失败时用户仍可手动粘贴
          console.error("自动粘贴按键失败:", error);
        }
        return true;
      } catch (error) {
        console.error("写入剪贴板失败:", error);
        return false;
      } finally {
        this.isAutoPasting = false;
      }
    });

    ipcMain.handle("clipboard-watch-start", () => {
      return this.startWatching();
    });

    ipcMain.handle("clipboard-watch-stop", () => {
      return this.stopWatching();
    });

    ipcMain.handle("clipboard-save-item", (_, item) => {
      return saveClipboardItem(item);
    });

    ipcMain.handle("clipboard-delete-item", (_, id) => {
      return deleteClipboardItem(id);
    });

    ipcMain.handle("clipboard-clear-all", () => {
      return clearClipboardHistory();
    });

    ipcMain.handle("clipboard-clear-except-favorites", () => {
      return clearClipboardExceptFavorites();
    });

    ipcMain.handle(
      "clipboard-get-history",
      (_, page = 1, pageSize = 50, type = "all", keyword = "") => {
        return getClipboardHistory(page, pageSize, type, keyword);
      },
    );

    ipcMain.handle("clipboard-set-favorite", (_, id, isFavorite) => {
      return setFavoriteStatus(id, isFavorite);
    });

    ipcMain.handle("clipboard-get-counts", () => {
      return getClipboardCounts();
    });
  }

  public startWatching(): boolean {
    if (this.isWatching) {
      return true;
    }

    try {
      clipboardEvent.startListening();

      clipboardEvent.on("change", () => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
          // 自动粘贴过程中忽略，避免抖动
          if (this.isAutoPasting) return;

          const currentContent = clipboard.readText();
          console.log("Available formats:", clipboard.availableFormats());

          if (
            currentContent !== this.lastClipboardContent &&
            currentContent.trim() !== ""
          ) {
            this.lastClipboardContent = currentContent;
            console.log("Clipboard content changed, notifying renderer");
            // 主窗口负责入库，面板窗口仅刷新列表
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) {
                win.webContents.send("clipboard-changed", currentContent);
              }
            }
          }
        }, this.DEBOUNCE_DELAY);
      });

      this.isWatching = true;
      return true;
    } catch (error) {
      console.error("启动剪贴板监听失败:", error);
      return false;
    }
  }

  public stopWatching(): boolean {
    if (!this.isWatching) {
      return true;
    }

    try {
      clipboardEvent.stopListening();
      this.isWatching = false;
      return true;
    } catch (error) {
      console.error("停止剪贴板监听失败:", error);
      return false;
    }
  }

  public dispose(): void {
    this.stopWatching();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.mainWindow = null;
    this.windowService = null;
  }
}
