// stores/clipboardStore.ts
import { defineStore } from 'pinia';
import { ClipboardItem, TypeCounts } from '@/utils/type';
import { formatSize, getContentType } from '@/utils/utils';
import { ElMessage, ElMessageBox } from 'element-plus';

export const useClipboardStore = defineStore('clipboard', {
  state: () => ({
    clipboardData: [] as ClipboardItem[],
    activeFilter: 'all' as string,
    pageSize: 10,
    currentPage: 1,
    totalItems: 0,
    isLoadingMore: false,
    typeCounts: { all: 0, text: 0, url: 0, code: 0, favorite: 0 } as TypeCounts,
    searchKeyword: '' as string,
  }),

  actions: {
    // 刷新各类型计数（IPC 失败时保留旧值）
    async refreshCounts() {
      try {
        this.typeCounts = await window.clipboard.getCounts();
      } catch (error) {
        console.error('刷新计数失败:', error);
      }
    },

    // 加载剪贴板历史（原 useClipboard 中的核心方法）
    async loadClipboardHistory(page = 1, append = false, type?: string, keyword?: string) {
      this.isLoadingMore = true;
      this.currentPage = page;

      const effectiveType = type ?? this.activeFilter;
      const effectiveKeyword = keyword ?? this.searchKeyword;

      try {
        const result = await window.clipboard.getHistory(page, this.pageSize, effectiveType, effectiveKeyword);
        if (result?.total !== undefined) {
          this.totalItems = result.total;
        }

        const history = result?.items || [];
        if (history && Array.isArray(history) && history.length > 0) {
          const processedHistory = history.map((item) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          }));

          this.clipboardData = append && page > 1
            ? [...this.clipboardData, ...processedHistory]
            : processedHistory;
        } else if (!append) {
          this.clipboardData = [];
        }
      } catch (error) {
        console.error('加载剪贴板历史出错:', error);
        ElMessage({ message: '加载历史记录失败', type: 'error', plain: true });
      } finally {
        this.isLoadingMore = false;
      }
    },

    // 设置搜索关键词，重置分页并重新加载
    setSearchKeyword(keyword: string) {
      const next = (keyword || '').trim();
      if (next === this.searchKeyword) return;
      this.searchKeyword = next;
      this.currentPage = 1;
      this.loadClipboardHistory(1, false);
    },

    // 保存单个剪贴板项
    async saveClipboardItem(item: ClipboardItem): Promise<number | null> {
      try {
        return await window.clipboard.saveItem(item);
      } catch (error) {
        console.error('保存剪贴板项目出错:', error);
        return null;
      }
    },

    // 添加新剪贴板项
    async addClipboardItem(content: string) {
      const type = getContentType(content);
      const shouldAddToCurrentView = this.activeFilter === 'all' || this.activeFilter === type;
      const size = formatSize(new Blob([content]).size);

      let newItem: ClipboardItem = {
        id: Date.now(),
        type,
        content,
        timestamp: new Date(),
        size,
      };

      try {
        const savedItemId = await this.saveClipboardItem(newItem);
        if (savedItemId && typeof savedItemId === 'number') {
          newItem.id = savedItemId;
          if (shouldAddToCurrentView) {
            this.clipboardData.unshift(newItem); // 新增项放前面
            this.totalItems += 1;
          }
          this.refreshCounts();
        } else {
          await this.loadClipboardHistory(); // 保存失败时刷新
        }
      } catch (error) {
        console.error('添加剪贴板项目失败:', error);
        await this.loadClipboardHistory();
      }
    },

    // 删除项目
    async deleteItem(itemOrId: ClipboardItem | number, event?: Event) {
      event?.stopPropagation();
      const id = typeof itemOrId === 'number' ? itemOrId : itemOrId.id;

      try {
        const success = await window.clipboard.deleteItem(id);
        if (!success) {
          ElMessage({ message: '删除失败，请重试', type: 'error' });
          return;
        }

        const index = this.clipboardData.findIndex(item => item.id === id);
        if (index !== -1) {
          this.clipboardData.splice(index, 1);
          this.totalItems -= 1;
        }
        ElMessage({ message: '删除成功', type: 'success' });
        this.refreshCounts();
      } catch (error) {
        console.error('删除出错:', error);
        ElMessage({ message: '删除失败，请重试', type: 'error' });
      }
    },

    // 清空所有记录（包括收藏）
    async clearAll() {
      try {
        const favCount = this.typeCounts.favorite;
        const confirmMsg = favCount > 0
          ? `确定要清空所有记录吗？包括已收藏的 ${favCount} 条记录也会被删除。`
          : '确定要清空所有记录吗？';

        await ElMessageBox.confirm(
          confirmMsg,
          '清空全部记录',
          { confirmButtonText: '确认清空', cancelButtonText: '取消', type: 'warning' }
        );

        const success = await window.clipboard.clearAll();
        if (success) {
          this.clipboardData = [];
          this.totalItems = 0;
          this.typeCounts = { all: 0, text: 0, url: 0, code: 0, favorite: 0 };
          ElMessage({ message: '已清空所有记录', type: 'success' });
        } else {
          ElMessage({ message: '清空失败', type: 'error' });
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage({ message: '清空失败', type: 'error' });
        }
      }
    },

    // 清空非收藏记录（保留收藏）
    async clearExceptFavorites() {
      try {
        await this.refreshCounts();
        const favCount = this.typeCounts.favorite;
        await ElMessageBox.confirm(
          `确定要清空非收藏记录吗？已收藏的 ${favCount} 条记录将被保留。`,
          '清空非收藏记录',
          { confirmButtonText: '确认清空', cancelButtonText: '取消', type: 'warning' }
        );

        const deletedCount = await window.clipboard.clearExceptFavorites();
        if (deletedCount >= 0) {
          await this.loadClipboardHistory(1, false);
          await this.refreshCounts();
          ElMessage({ message: `已清空 ${deletedCount} 条记录，收藏记录已保留`, type: 'success' });
        } else {
          ElMessage({ message: '清空失败', type: 'error' });
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage({ message: '清空失败', type: 'error' });
        }
      }
    },

    // 加载更多
    loadMoreData() {
      if (this.isLoadingMore || this.clipboardData.length >= this.totalItems) return;
      this.loadClipboardHistory(this.currentPage + 1, true);
    },

    /**
     * 切换收藏状态
     * @param silent 为 true 时不弹 toast（快捷面板等场景）
     */
    async toggleFavorite(
      item: ClipboardItem,
      event?: Event,
      options?: { silent?: boolean },
    ): Promise<boolean> {
      event?.stopPropagation();
      const newStatus = !item.is_favorite;
      const silent = !!options?.silent;

      try {
        const success = await window.clipboard.setFavorite(item.id, newStatus);
        if (!success) {
          if (!silent) {
            ElMessage({ message: '操作失败', type: 'error' });
          }
          return false;
        }

        item.is_favorite = newStatus;
        const listed = this.clipboardData.find((row) => row.id === item.id);
        if (listed && listed !== item) {
          listed.is_favorite = newStatus;
        }
        this.refreshCounts();

        if (!silent) {
          ElMessage({
            message: newStatus ? '已添加到收藏' : '已取消收藏',
            type: newStatus ? 'success' : 'info',
          });
        }
        return true;
      } catch (error) {
        console.error('设置收藏状态出错:', error);
        if (!silent) {
          ElMessage({ message: '操作失败', type: 'error' });
        }
        return false;
      }
    },

    /**
     * 复制项目内容到系统剪贴板
     * @param silent 为 true 时不弹 toast
     */
    async copyItem(
      item: ClipboardItem,
      event?: Event,
      options?: { silent?: boolean },
    ): Promise<boolean> {
      event?.stopPropagation();
      const silent = !!options?.silent;

      try {
        await window.clipboard.write(item.content);
        if (!silent) {
          ElMessage({ message: '复制成功', type: 'primary' });
        }
        return true;
      } catch (error) {
        console.error('复制失败:', error);
        if (!silent) {
          ElMessage({ message: '复制失败', type: 'error' });
        }
        return false;
      }
    },
  },
});
