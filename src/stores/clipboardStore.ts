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
    ): Promise<StoreActionResult> {
      this.isLoadingMore = true;
      this.currentPage = page;

      const effectiveType = type ?? this.activeFilter;
      const effectiveKeyword = keyword ?? this.searchKeyword;

      try {
        const result = await window.clipboard.getHistory(
          page,
          this.pageSize,
          effectiveType,
          effectiveKeyword,
        );
        if (result?.total !== undefined) {
          this.totalItems = result.total;
        }

        const history = result?.items || [];
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
        return { ok: true };
      } catch (error) {
        console.error("加载剪贴板历史出错:", error);
        return { ok: false };
      } finally {
        this.isLoadingMore = false;
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
      await this.loadClipboardHistory(1, false);
      await this.refreshCounts();
      if (this.activeFilter === "all" && !this.searchKeyword) {
        this.totalItems = this.typeCounts.all;
      }
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

    loadMoreData() {
      if (this.isLoadingMore || this.clipboardData.length >= this.totalItems) return;
      void this.loadClipboardHistory(this.currentPage + 1, true);
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
