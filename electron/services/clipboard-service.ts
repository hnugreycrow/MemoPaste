import { clipboard, ipcMain, BrowserWindow, nativeImage, dialog, shell } from "electron";
import { createRequire } from "node:module";
import fs from "node:fs";
import {
  saveClipboardItem,
  deleteClipboardItem,
  clearClipboardHistory,
  clearClipboardExceptFavorites,
  getClipboardHistory,
  getClipboardItemById,
  setFavoriteStatus,
  setClipboardItemAlias,
  getClipboardCounts,
} from "../database/clipboard";
import { releasePressedModifiers, simulatePaste } from "../utils/simulate-paste";
import type { ForegroundWindowHandle } from "../utils/foreground-window";
import { isSensitiveClipboardContent } from "../utils/clipboard-privacy";
import { storeClipboardImage, resolveImageAbsolutePath } from "./image-storage";
import {
  getContentType,
  formatSize,
  collapseToSingleLine,
  normalizeSafeExternalUrl,
} from "@shared/content-type";
import type { PasteResult, SaveImageResult } from "../../src/utils/type";
import type { WindowService } from "./window-service";

// clipboard-event 为 CJS；主进程是 ESM，用 createRequire 加载
const require = createRequire(import.meta.url);
const clipboardEvent = require("clipboard-event");

type PanelWindowController = Pick<WindowService, "hidePanel" | "restorePanel"> & {
  hideAndRestoreFocus?: () => ForegroundWindowHandle | null | void;
  getPanelWindow?: () => BrowserWindow | null;
  setBlurHideSuppressed?: (suppressed: boolean) => void;
};

function sanitizeFileName(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
}

/** 系统剪贴板监听、隐私跳过、暂停控制、历史 IPC，以及浮窗选中后的自动粘贴与轻加工 */
export class ClipboardService {
  private windowService: PanelWindowController | null = null;
  /** 上次已处理内容指纹：文本为原文，图片为 `img:${hash}` */
  private lastFingerprint: string = "";
  private isWatching: boolean = false;
  /** 隐私暂停：暂停期间忽略所有剪贴板变更，恢复时跳过暂停期间残留内容 */
  private paused: boolean = false;
  private onPausedChanged: ((paused: boolean) => void) | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  /** clipboard-event 一次粘贴常连发多次；合并后再处理 */
  private readonly DEBOUNCE_DELAY = 100;
  /** 自动粘贴进行中：忽略剪贴板监听，避免把自身写入再记一条 */
  private isAutoPasting = false;

  constructor(windowService?: PanelWindowController) {
    this.windowService = windowService ?? null;
    // 启动时的剪贴板尚未入库，不能提前标记为已处理。
    this.registerIpcHandlers();
    // 不依赖渲染进程挂载；托盘静默启动也能持续入库
    this.startWatching();
  }

  public setOnPausedChanged(listener: ((paused: boolean) => void) | null): void {
    this.onPausedChanged = listener;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(nextPaused: boolean): boolean {
    const value = !!nextPaused;
    if (this.paused === value) return this.paused;
    this.paused = value;
    if (!this.paused) {
      // 恢复监听时记录当前剪贴板指纹，防止暂停期间复制的敏感内容在恢复后被补录
      this.lastFingerprint = this.readCurrentFingerprint();
    }
    this.notifyPausedChanged();
    this.onPausedChanged?.(this.paused);
    return this.paused;
  }

  private readCurrentFingerprint(): string {
    const text = clipboard.readText();
    if (text && text.trim() !== "") {
      return `text:${text}`;
    }
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      // 仅用于指纹近似，不落盘；正式入库仍走 storeClipboardImage
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

  private notifyPausedChanged(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("clipboard-paused-changed", this.paused);
      }
    }
  }

  /** 将系统剪贴板当前内容写入历史（文本优先，否则图片；自动跳过敏感/密码管理器内容） */
  private captureClipboardChange(): void {
    if (this.isAutoPasting || this.paused) return;

    if (isSensitiveClipboardContent()) {
      this.lastFingerprint = this.readCurrentFingerprint();
      return;
    }

    const text = clipboard.readText();
    if (text && text.trim() !== "") {
      const fingerprint = `text:${text}`;
      if (fingerprint === this.lastFingerprint) return;

      const type = getContentType(text);
      const size = formatSize(Buffer.byteLength(text, "utf8"));
      const saved = saveClipboardItem({
        content: text,
        type,
        timestamp: new Date(),
        size,
      });
      if (saved) {
        this.lastFingerprint = fingerprint;
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
      this.lastFingerprint = fingerprint;
      this.notifyChanged();
    }
  }

  /** 按历史 id 写回系统剪贴板，并更新指纹避免回环 */
  private writeItemToClipboard(id: number): boolean {
    const row = getClipboardItemById(id);
    if (!row) return false;

    if (row.type === "image") {
      if (!row.file_path) return false;
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

  private async hideAndSimulatePaste(): Promise<PasteResult> {
    // 在自身浮窗仍处于前台时按需松开按住的修饰键（如 Alt+1~9），避免松键落入目标浏览器窗口
    releasePressedModifiers();
    let targetHwnd: ForegroundWindowHandle | null = null;
    if (this.windowService?.hideAndRestoreFocus) {
      targetHwnd = this.windowService.hideAndRestoreFocus() ?? null;
    } else {
      this.windowService?.hidePanel();
    }
    try {
      await simulatePaste({ targetHwnd });
    } catch (error) {
      // 内容已在剪贴板；按键失败时用户仍可手动粘贴
      console.error("自动粘贴按键失败:", error);
      this.windowService?.restorePanel();
      return { status: "copied" };
    }
    return { status: "sent" };
  }

  private registerIpcHandlers(): void {
    ipcMain.handle("clipboard-write", (_, id: unknown) => {
      if (typeof id !== "number" || !Number.isInteger(id)) return false;
      return this.writeItemToClipboard(id);
    });

    /** 浮窗选中项：按 id 写入剪贴板 → 隐藏浮窗并恢复原前景窗口焦点 → 模拟 Ctrl+V */
    ipcMain.handle("clipboard-paste-and-hide", async (_, id: unknown): Promise<PasteResult> => {
      if (typeof id !== "number" || !Number.isInteger(id)) return { status: "failed" };
      if (this.isAutoPasting) return { status: "busy" };
      this.isAutoPasting = true;
      try {
        if (!this.writeItemToClipboard(id)) {
          return { status: "failed" };
        }
        return await this.hideAndSimulatePaste();
      } catch (error) {
        console.error("写入剪贴板失败:", error);
        return { status: "failed" };
      } finally {
        this.isAutoPasting = false;
      }
    });

    /** 去换行单行粘贴（合并换行与连续空白，仅适用于非图片记录） */
    ipcMain.handle("clipboard-paste-single-line", async (_, id: unknown): Promise<PasteResult> => {
      if (typeof id !== "number" || !Number.isInteger(id)) return { status: "failed" };
      if (this.isAutoPasting) return { status: "busy" };
      this.isAutoPasting = true;
      try {
        const row = getClipboardItemById(id);
        if (!row || row.type === "image") {
          return { status: "failed" };
        }
        const singleLine = collapseToSingleLine(row.content);
        clipboard.writeText(singleLine);
        this.lastFingerprint = `text:${singleLine}`;
        return await this.hideAndSimulatePaste();
      } catch (error) {
        console.error("去换行粘贴失败:", error);
        return { status: "failed" };
      } finally {
        this.isAutoPasting = false;
      }
    });

    /** 在系统默认浏览器中打开历史链接（主进程按 id 取原文并校验 http/https） */
    ipcMain.handle("clipboard-open-url", async (_, id: unknown): Promise<boolean> => {
      if (typeof id !== "number" || !Number.isInteger(id)) return false;
      const row = getClipboardItemById(id);
      if (!row || row.type === "image") return false;
      const safeUrl = normalizeSafeExternalUrl(row.content);
      if (!safeUrl) return false;
      try {
        this.windowService?.hidePanel();
        await shell.openExternal(safeUrl);
        return true;
      } catch (error) {
        console.error("打开外部链接失败:", error);
        return false;
      }
    });

    /** 将图片历史另存为本地 PNG 文件 */
    ipcMain.handle("clipboard-save-image", async (_, id: unknown): Promise<SaveImageResult> => {
      if (typeof id !== "number" || !Number.isInteger(id)) return { status: "failed" };
      const row = getClipboardItemById(id);
      if (!row || row.type !== "image" || !row.file_path) return { status: "failed" };

      const absPath = resolveImageAbsolutePath(row.file_path);
      if (!absPath || !fs.existsSync(absPath)) {
        return { status: "failed" };
      }

      const defaultBase =
        (row.alias ? sanitizeFileName(row.alias) : "") ||
        `MemoPaste-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

      this.windowService?.setBlurHideSuppressed?.(true);
      try {
        const parentWin = this.windowService?.getPanelWindow?.() ?? undefined;
        const options = {
          title: "另存为图片",
          defaultPath: `${defaultBase}.png`,
          filters: [{ name: "PNG 图片", extensions: ["png"] }],
        };
        const result = parentWin
          ? await dialog.showSaveDialog(parentWin, options)
          : await dialog.showSaveDialog(options);

        if (result.canceled || !result.filePath) {
          return { status: "canceled" };
        }

        await fs.promises.copyFile(absPath, result.filePath);
        return { status: "saved", filePath: result.filePath };
      } catch (error) {
        console.error("另存为图片失败:", error);
        return { status: "failed" };
      } finally {
        this.windowService?.setBlurHideSuppressed?.(false);
      }
    });

    ipcMain.handle("clipboard-get-paused", () => {
      return this.paused;
    });

    ipcMain.handle("clipboard-set-paused", (_, paused: unknown) => {
      return this.setPaused(!!paused);
    });

    ipcMain.handle("clipboard-delete-item", (_, id: unknown) => {
      if (typeof id !== "number" || !Number.isInteger(id)) return false;
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

    /** 预览用全文；列表 get-history 只带预览 */
    ipcMain.handle("clipboard-get-item", (_, id: number) => {
      const row = getClipboardItemById(id);
      if (!row) return null;
      return {
        ...row,
        is_favorite: !!row.is_favorite,
      };
    });

    ipcMain.handle("clipboard-set-favorite", (_, id: unknown, isFavorite: unknown) => {
      if (typeof id !== "number" || !Number.isInteger(id)) return false;
      return setFavoriteStatus(id, !!isFavorite);
    });

    ipcMain.handle("clipboard-set-alias", (_, id: unknown, alias: unknown) => {
      if (typeof id !== "number" || !Number.isInteger(id)) return false;
      if (alias !== null && typeof alias !== "string") return false;
      return setClipboardItemAlias(id, alias);
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
    this.onPausedChanged = null;
    this.windowService = null;
  }
}
