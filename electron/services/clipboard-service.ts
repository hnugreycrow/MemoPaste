import { clipboard, ipcMain, BrowserWindow, nativeImage } from "electron";
import { createRequire } from "node:module";
import {
  saveClipboardItem,
  deleteClipboardItem,
  clearClipboardHistory,
  clearClipboardExceptFavorites,
  getClipboardHistory,
  getClipboardItemById,
  setFavoriteStatus,
  getClipboardCounts,
} from "../database/clipboard";
import { simulatePaste } from "../utils/simulate-paste";
import { storeClipboardImage, resolveImageAbsolutePath } from "./image-storage";
import { getContentType, formatSize } from "@shared/content-type";
import type { WindowService } from "./window-service";

// clipboard-event 为 CJS；主进程是 ESM，用 createRequire 加载
const require = createRequire(import.meta.url);
const clipboardEvent = require("clipboard-event");

/** 系统剪贴板监听、历史 IPC，以及面板选中后的自动粘贴 */
export class ClipboardService {
  private windowService: WindowService | null = null;
  /** 上次已处理内容指纹：文本为原文，图片为 `img:${hash}` */
  private lastFingerprint: string = "";
  private isWatching: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  /** clipboard-event 一次粘贴常连发多次；合并后再处理 */
  private readonly DEBOUNCE_DELAY = 100;
  /** 自动粘贴进行中：忽略剪贴板监听，避免把自身写入再记一条 */
  private isAutoPasting = false;

  constructor(_mainWindow: BrowserWindow, windowService?: WindowService) {
    this.windowService = windowService ?? null;
    this.lastFingerprint = this.readCurrentFingerprint();
    this.registerIpcHandlers();
    // 不依赖渲染进程挂载；托盘静默启动也能持续入库
    this.startWatching();
  }

  private readCurrentFingerprint(): string {
    const text = clipboard.readText();
    if (text && text.trim() !== "") {
      return `text:${text}`;
    }
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      // 仅用于启动指纹，不落盘；用长度+头字节近似即可，正式入库仍走 storeClipboardImage
      return `img:boot:${png.length}:${png.subarray(0, 32).toString("hex")}`;
    }
    return "";
  }

  private notifyChanged(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("clipboard-changed");
      }
    }
  }

  /** 将系统剪贴板当前内容写入历史（文本优先，否则图片） */
  private captureClipboardChange(): void {
    if (this.isAutoPasting) return;

    const text = clipboard.readText();
    if (text && text.trim() !== "") {
      const fingerprint = `text:${text}`;
      if (fingerprint === this.lastFingerprint) return;
      this.lastFingerprint = fingerprint;

      const type = getContentType(text);
      const size = formatSize(Buffer.byteLength(text, "utf8"));
      const saved = saveClipboardItem({
        content: text,
        type,
        timestamp: new Date(),
        size,
      });
      if (saved) {
        this.notifyChanged();
      }
      return;
    }

    const image = clipboard.readImage();
    if (image.isEmpty()) return;

    const stored = storeClipboardImage(image);
    if (!stored) return;

    const fingerprint = `img:${stored.hash}`;
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;

    const saved = saveClipboardItem({
      content: `图片 ${stored.width}×${stored.height}`,
      type: "image",
      timestamp: new Date(),
      size: formatSize(stored.sizeBytes),
      content_hash: stored.hash,
      file_path: stored.filePath,
      thumb_path: stored.thumbPath,
    });
    if (saved) {
      this.notifyChanged();
    }
  }

  /** 按历史 id 写回系统剪贴板，并更新指纹避免回环 */
  private writeItemToClipboard(id: number): boolean {
    const row = getClipboardItemById(id);
    if (!row) return false;

    if (row.type === "image" && row.file_path) {
      const abs = resolveImageAbsolutePath(row.file_path);
      if (!abs) {
        console.error("图片路径非法:", row.file_path);
        return false;
      }
      const img = nativeImage.createFromPath(abs);
      if (img.isEmpty()) {
        console.error("无法加载图片:", abs);
        return false;
      }
      clipboard.writeImage(img);
      this.lastFingerprint = row.content_hash
        ? `img:${row.content_hash}`
        : this.readCurrentFingerprint();
      return true;
    }

    clipboard.writeText(row.content);
    this.lastFingerprint = `text:${row.content}`;
    return true;
  }

  private registerIpcHandlers(): void {
    ipcMain.handle("clipboard-write", (_, id: number) => {
      return this.writeItemToClipboard(id);
    });

    /**
     * 快捷面板选中项：按 id 写入剪贴板 → 隐藏面板 → 模拟 Ctrl+V
     * 依赖面板不抢焦点，原输入框仍可接收按键
     */
    ipcMain.handle("clipboard-paste-and-hide", async (_, id: number) => {
      if (this.isAutoPasting) return false;
      this.isAutoPasting = true;
      try {
        if (!this.writeItemToClipboard(id)) {
          return false;
        }
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

    /** 详情用全文；列表 get-history 只带预览 */
    ipcMain.handle("clipboard-get-item", (_, id: number) => {
      const row = getClipboardItemById(id);
      if (!row) return null;
      return {
        ...row,
        is_favorite: !!row.is_favorite,
      };
    });

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
          try {
            this.captureClipboardChange();
          } catch (error) {
            console.error("处理剪贴板变更失败:", error);
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
    this.windowService = null;
  }
}
