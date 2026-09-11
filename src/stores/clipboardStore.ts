import { defineStore } from "pinia";
import { ClipboardItem, SaveClipboardResult, TypeCounts } from "@/utils/type";

export type StoreActionResult = {
  ok: boolean;
  favorited?: boolean;
  deletedCount?: number;
};

const emptyCounts = (): TypeCounts => ({
  all: 0,
  text: 0,
  url: 0,
  code: 0,
  image: 0,
  favorite: 0,
});

export const useClipboardStore = defineStore("clipboard", {
  state: () => ({
    clipboardData: [] as ClipboardItem[],
    activeFilter: "all" as string,
    pageSize: 10,
    currentPage: 1,
    totalItems: 0,
    isLoadingMore: false,
    typeCounts: emptyCounts(),
    searchKeyword: "" as string,
    historyRequestId: 0,
  }),

  actions: {
    // IPC 失败时保留旧计数，避免 UI 闪成 0
    async refreshCounts() {
      try {
        this.typeCounts = await window.clipboard.getCounts();
      } catch (error) {
        console.error("刷新计数失败:", error);
      }
    },

    async loadClipboardHistory(
      page = 1,
      append = false,
      type?: string,
      keyword?: string,
      preserveRange = false,
    ): Promise<StoreActionResult> {
      const requestId = ++this.historyRequestId;
      this.isLoadingMore = true;

      const effectiveType = type ?? this.activeFilter;
      const effectiveKeyword = keyword ?? this.searchKeyword;

      try {
        // 后台刷新覆盖已加载范围，并预留一页，避免新记录把末尾记录挤出列表。
        const loadedPages = Math.max(
          this.currentPage,
          Math.ceil(this.clipboardData.length / this.pageSize),
        );
        const requestSize = preserveRange ? (loadedPages + 1) * this.pageSize : this.pageSize;
        let result = await window.clipboard.getHistory(
          preserveRange ? 1 : page,
          requestSize,
          effectiveType,
          effectiveKeyword,
        );
        if (requestId !== this.historyRequestId) return { ok: false };
        if (preserveRange && result.total - this.totalItems > this.pageSize) {
          result = await window.clipboard.getHistory(
            1,
            Math.ceil(
              (this.clipboardData.length + result.total - this.totalItems) / this.pageSize,
            ) * this.pageSize,
            effectiveType,
            effectiveKeyword,
          );
        }
        if (
          requestId !== this.historyRequestId ||
          effectiveType !== this.activeFilter ||
          effectiveKeyword !== this.searchKeyword
        ) {
          return { ok: false };
        }
        if (result?.total !== undefined) {
          this.totalItems = result.total;
        }

        let history = result?.items || [];
        if (preserveRange) {
          const previousIds = new Set(this.clipboardData.map((item) => item.id));
          const retainedEnd = history.reduce(
            (end, item, index) => (previousIds.has(item.id) ? index + 1 : end),
            this.clipboardData.length,
          );
          // 只在旧记录被挤到下一页时扩容，避免每次复制都多加载一页。
          history = history.slice(
            0,
            Math.max(this.pageSize, Math.ceil(retainedEnd / this.pageSize) * this.pageSize),
          );
        }
        if (history && Array.isArray(history) && history.length > 0) {
          const processedHistory = history.map((item) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          }));

          this.clipboardData =
            append && page > 1 ? [...this.clipboardData, ...processedHistory] : processedHistory;
        } else if (!append) {
          this.clipboardData = [];
        }
        this.currentPage = preserveRange
          ? Math.max(1, Math.ceil(this.clipboardData.length / this.pageSize))
          : page;
        return { ok: true };
      } catch (error) {
        console.error("加载剪贴板历史出错:", error);
        return { ok: false };
      } finally {
        if (requestId === this.historyRequestId) this.isLoadingMore = false;
      }
    },

    setSearchKeyword(keyword: string) {
      const next = (keyword || "").trim();
      if (next === this.searchKeyword) return;
      this.searchKeyword = next;
      this.currentPage = 1;
      void this.loadClipboardHistory(1, false);
    },

    /** 主进程入库后：刷新列表与计数 */
    async refreshAfterClipboardChange() {
      await this.loadClipboardHistory(1, false, undefined, undefined, true);
      await this.refreshCounts();
    },

    async saveClipboardItem(item: ClipboardItem): Promise<SaveClipboardResult | null> {
      try {
        return await window.clipboard.saveItem(item);
      } catch (error) {
        console.error("保存剪贴板项目出错:", error);
        return null;
      }
    },

    async deleteItem(itemOrId: ClipboardItem | number, event?: Event): Promise<StoreActionResult> {
      event?.stopPropagation();
      const id = typeof itemOrId === "number" ? itemOrId : itemOrId.id;

      try {
        const success = await window.clipboard.deleteItem(id);
        if (!success) {
          return { ok: false };
        }

        const index = this.clipboardData.findIndex((item) => item.id === id);
        if (index !== -1) {
          this.clipboardData.splice(index, 1);
          this.totalItems -= 1;
        }
        this.refreshCounts();
        return { ok: true };
      } catch (error) {
        console.error("删除出错:", error);
        return { ok: false };
      }
    },

    async clearAll(): Promise<StoreActionResult> {
      try {
        const success = await window.clipboard.clearAll();
        if (!success) {
          return { ok: false };
        }
        this.clipboardData = [];
        this.totalItems = 0;
        this.typeCounts = emptyCounts();
        return { ok: true };
      } catch (error) {
        console.error("清空全部失败:", error);
        return { ok: false };
      }
    },

    async clearExceptFavorites(): Promise<StoreActionResult> {
      try {
        await this.refreshCounts();
        const deletedCount = await window.clipboard.clearExceptFavorites();
        if (deletedCount < 0) {
          return { ok: false };
        }
        await this.loadClipboardHistory(1, false);
        await this.refreshCounts();
        return { ok: true, deletedCount };
      } catch (error) {
        console.error("清空非收藏失败:", error);
        return { ok: false };
      }
    },

    async loadMoreData() {
      if (this.isLoadingMore || this.clipboardData.length >= this.totalItems) return;
      void this.loadClipboardHistory(this.currentPage + 1, true);
    },

    /** 详情用全文；列表项 content 可能只是预览 */
    async fetchItemById(id: number): Promise<ClipboardItem | null> {
      try {
        const item = await window.clipboard.getItem(id);
        if (!item) return null;
        return {
          ...item,
          timestamp: new Date(item.timestamp),
          is_favorite: !!item.is_favorite,
        };
      } catch (error) {
        console.error("按 id 加载剪贴板项失败:", error);
        return null;
      }
    },

    async toggleFavorite(item: ClipboardItem, event?: Event): Promise<StoreActionResult> {
      event?.stopPropagation();
      const newStatus = !item.is_favorite;

      try {
        const success = await window.clipboard.setFavorite(item.id, newStatus);
        if (!success) {
          return { ok: false };
        }

        item.is_favorite = newStatus;
        const listed = this.clipboardData.find((row) => row.id === item.id);
        if (listed && listed !== item) {
          listed.is_favorite = newStatus;
        }
        this.refreshCounts();
        return { ok: true, favorited: newStatus };
      } catch (error) {
        console.error("设置收藏状态出错:", error);
        return { ok: false };
      }
    },

    async copyItem(item: ClipboardItem, event?: Event): Promise<StoreActionResult> {
      event?.stopPropagation();

      try {
        const ok = await window.clipboard.write(item.id);
        return { ok };
      } catch (error) {
        console.error("复制失败:", error);
        return { ok: false };
      }
    },
  },
});
