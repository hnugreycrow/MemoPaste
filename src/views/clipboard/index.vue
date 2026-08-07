<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, onActivated } from "vue";
import DetailPanel from "./components/DetailPanel.vue";
import FilterChips from "./components/FilterChips.vue";
import { ClipboardItem } from "@/utils/type";
import { truncateText, formatRelativeTime, getTypeLabel, clipimgUrl } from "@/utils/utils";
import { useSearch } from "./composables/useSearch";
import { useVirtualScroll } from "./composables/useVirtualScroll";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

// keep-alive 需要 name，与 router 缓存路由名对应
defineOptions({
  name: "Clipboard",
});

const clipboardStore = useClipboardStore();
const { clipboardData, isLoadingMore, activeFilter, totalItems, currentPage } =
  storeToRefs(clipboardStore);

/** 侧栏「收藏」：长期抽屉视图，与流水历史区分文案与布局 */
const isFavoritesView = computed(() => activeFilter.value === "favorite");

const searchPlaceholder = computed(() =>
  isFavoritesView.value ? "搜索收藏..." : "搜索剪贴板内容...",
);

const emptyTitle = computed(() => (isFavoritesView.value ? "还没有收藏" : "暂无记录"));

const emptyDesc = computed(() =>
  isFavoritesView.value ? "在历史里点星标，重要内容会留在这里" : "复制文本或截图，它们会出现在这里",
);

// 搜索下推到 store，由主进程 SQL LIKE 处理（非前端过滤）
const { searchQuery } = useSearch();

const { contentListRef, virtualScroll, visibleItems, handleScroll } = useVirtualScroll(
  () => clipboardData.value,
);

const selectedItem = ref<ClipboardItem | null>(null);
/** 避免快速切换或列表刷新时，过期的 getItem 覆盖当前选中 */
let selectionRequestId = 0;

/** 列表变化时：对齐到最新对象；选中项已不存在则默认首条 */
const ensureSelection = async () => {
  const items = clipboardData.value;
  if (items.length === 0) {
    selectedItem.value = null;
    return;
  }

  if (selectedItem.value) {
    // 去重置顶会换新对象（timestamp 等已变），不能只判断 id 还在就跳过
    const latest = items.find((item) => item.id === selectedItem.value?.id);
    if (latest) {
      const current = selectedItem.value;
      // 列表追加翻页时数组会换新引用；已有全文且未置顶则跳过，避免详情闪烁
      if (
        current &&
        String(current.timestamp) === String(latest.timestamp) &&
        current.content.length > latest.content.length
      ) {
        return;
      }
      // 列表只有预览，须重新拉全文，避免详情被截断覆盖
      await loadFullSelection(latest.id, latest);
      return;
    }
  }

  await selectItem(items[0]);
};

watch(activeFilter, (newType) => {
  currentPage.value = 1;
  clipboardStore.loadClipboardHistory(1, false, newType);
});

watch(
  () => clipboardData.value,
  () => {
    void ensureSelection();
  },
);

const showAllContent = ref(false);

const loadFullSelection = async (id: number, preview?: ClipboardItem) => {
  const requestId = ++selectionRequestId;
  if (preview) {
    showAllContent.value = false;
    selectedItem.value = preview;
  }
  const full = await clipboardStore.fetchItemById(id);
  if (requestId !== selectionRequestId) return;
  if (full) {
    selectedItem.value = full;
  }
};

const selectItem = async (item: ClipboardItem) => {
  showAllContent.value = false;
  await loadFullSelection(item.id, item);
};

const toggleFavorite = async (item: ClipboardItem, event?: Event) => {
  const result = await clipboardStore.toggleFavorite(item, event);
  if (!result.ok) {
    ElMessage({ message: "操作失败", type: "error" });
    return;
  }
  ElMessage({
    message: result.favorited ? "已添加到收藏" : "已取消收藏",
    type: result.favorited ? "success" : "info",
  });
};

const copyItem = async (item: ClipboardItem, event?: Event) => {
  const result = await clipboardStore.copyItem(item, event);
  if (result.ok) {
    ElMessage({ message: "复制成功", type: "primary" });
  } else {
    ElMessage({ message: "复制失败", type: "error" });
  }
};

const deleteItem = async (item: ClipboardItem, event?: Event) => {
  const result = await clipboardStore.deleteItem(item, event);
  if (result.ok) {
    ElMessage({ message: "删除成功", type: "success" });
  } else {
    ElMessage({ message: "删除失败，请重试", type: "error" });
  }
};

const clearExceptFavorites = async () => {
  try {
    await clipboardStore.refreshCounts();
    const favCount = clipboardStore.typeCounts.favorite;
    await ElMessageBox.confirm(
      `确定要清空非收藏记录吗？已收藏的 ${favCount} 条记录将被保留。`,
      "清空非收藏记录",
      {
        confirmButtonText: "确认清空",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    const result = await clipboardStore.clearExceptFavorites();
    if (result.ok) {
      ElMessage({
        message: `已清空 ${result.deletedCount ?? 0} 条记录，收藏记录已保留`,
        type: "success",
      });
    } else {
      ElMessage({ message: "清空失败", type: "error" });
    }
  } catch (error) {
    if (error !== "cancel") {
      ElMessage({ message: "清空失败", type: "error" });
    }
  }
};

const clearAll = async () => {
  try {
    const favCount = clipboardStore.typeCounts.favorite;
    const confirmMsg =
      favCount > 0
        ? `确定要清空所有记录吗？包括已收藏的 ${favCount} 条记录也会被删除。`
        : "确定要清空所有记录吗？";
    await ElMessageBox.confirm(confirmMsg, "清空全部记录", {
      confirmButtonText: "确认清空",
      cancelButtonText: "取消",
      type: "warning",
    });
    const result = await clipboardStore.clearAll();
    if (result.ok) {
      ElMessage({ message: "已清空所有记录", type: "success" });
    } else {
      ElMessage({ message: "清空失败", type: "error" });
    }
  } catch (error) {
    if (error !== "cancel") {
      ElMessage({ message: "清空失败", type: "error" });
    }
  }
};

onMounted(async () => {
  const loaded = await clipboardStore.loadClipboardHistory(1, false, activeFilter.value);
  if (!loaded.ok) {
    ElMessage({ message: "加载历史记录失败", type: "error", plain: true });
  }
  clipboardStore.refreshCounts();

  setTimeout(() => {
    handleScroll();
  }, 100);

  window.addEventListener("resize", handleScroll);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleScroll);
});

onActivated(() => {
  // keep-alive 再次插入时重算可视区与计数（监听在 layout）
  handleScroll();
  clipboardStore.refreshCounts();
});
</script>

<template>
  <div class="main-content">
    <div class="two-column-body">
      <div class="content-container">
        <div class="search-container">
          <div class="search-box">
            <i-ep-search class="search-icon" />
            <el-input
              v-model="searchQuery"
              class="search-input"
              :placeholder="searchPlaceholder"
              clearable
            />
          </div>
          <el-dropdown trigger="click" placement="bottom-end">
            <el-button class="search-action-btn" title="更多操作">
              <i-ep-MoreFilled />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="clearExceptFavorites">
                  <i-ep-Delete class="el-icon--left" />清空非收藏记录
                </el-dropdown-item>
                <el-dropdown-item @click="clearAll" divided>
                  <i-ep-Warning class="el-icon--left" />清空全部（含收藏）
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <FilterChips v-if="!isFavoritesView" />
        <div v-else class="favorites-banner" role="status">
          <i-ep-Star class="favorites-banner-icon" />
          <div class="favorites-banner-text">
            <span class="favorites-banner-desc">已收藏的内容不会随保留天数自动清理</span>
          </div>
        </div>

        <div class="content-list" ref="contentListRef" @scroll="handleScroll">
          <template v-if="clipboardData.length === 0">
            <div class="empty-state">
              <img src="/mascot.png" class="mascot" alt="MemoPaste" />
              <div class="empty-title">{{ emptyTitle }}</div>
              <div class="empty-desc">{{ emptyDesc }}</div>
            </div>
          </template>
          <template v-else>
            <!-- 撑开真实滚动高度；可见行绝对定位叠在上面 -->
            <div
              class="virtual-scroll-placeholder"
              :style="{ height: `${virtualScroll.totalHeight}px` }"
            ></div>

            <div
              class="virtual-scroll-content"
              :style="{
                transform: `translateY(${virtualScroll.startIndex * virtualScroll.itemHeight}px)`,
              }"
            >
              <div
                v-for="item in visibleItems"
                :key="item.id"
                class="content-item"
                :class="{
                  active: selectedItem?.id === item.id,
                  favorite: item.is_favorite,
                }"
                @click="selectItem(item)"
              >
                <div class="item-type-badge" :class="`type-${item.type}`">
                  {{ getTypeLabel(item.type) }}
                </div>
                <div class="item-content">
                  <div class="item-title">
                    {{ truncateText(item.content, 50) }}
                  </div>
                  <div class="item-time">
                    {{ formatRelativeTime(item.timestamp) }}
                    <i-ep-Star v-if="item.is_favorite" class="favorite-star" />
                  </div>
                </div>
                <div v-if="item.type === 'image' && item.thumb_path" class="item-thumb-wrap">
                  <img
                    class="item-thumb"
                    :src="clipimgUrl(item.thumb_path)"
                    alt=""
                    draggable="false"
                  />
                </div>
              </div>

              <div
                v-if="
                  !isLoadingMore && clipboardData.length >= totalItems && clipboardData.length > 0
                "
                class="load-complete"
              >
                <span>已加载全部内容</span>
              </div>
            </div>
          </template>
        </div>

        <div v-if="isLoadingMore && currentPage > 1" class="loading-more">
          <el-icon class="is-loading"><i-ep-Loading /></el-icon>
          <span>加载更多...</span>
        </div>
      </div>

      <DetailPanel
        :item="selectedItem"
        v-model:showAllContent="showAllContent"
        @copy="copyItem"
        @delete="deleteItem"
        @favorite="toggleFavorite"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.mascot {
  width: 168px;
  max-width: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: var(--bg-primary);
  height: 100%;
  overflow: hidden;
}

.two-column-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 搜索区域 */
.search-container {
  padding: 14px 14px 10px;
  background: var(--list-bg);
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-action-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  z-index: 1;
}

.search-input {
  width: 100%;
}

:deep(.el-input__wrapper) {
  padding-left: 36px;
}

/* 收藏抽屉说明条（替换类型 Chips） */
.favorites-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 10px;
  background: var(--list-bg);
  border-bottom: 1px solid var(--border-light);
}

.favorites-banner-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--favorite-border);
}

.favorites-banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.favorites-banner-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.35;
}

.content-container {
  display: flex;
  flex-direction: column;
  flex: 0 1 44%;
  min-width: 320px;
  max-width: var(--list-max-width, 640px);
  overflow: hidden;
  height: 100%;
  border-right: 1px solid var(--border-light);
}

/* 内容列表 */
.content-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  background: var(--list-bg);
  scroll-behavior: smooth;
  position: relative;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  text-align: center;
  padding: 60px 0;
}

.empty-title {
  font-size: 16px;
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 14px;
}

/* 内容项目 */
.content-item {
  background: transparent;
  border-radius: 10px;
  padding: 7px;
  margin: 7px;
  cursor: pointer;
  transition: all 0.25s ease;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: var(--bg-hover);
    background-origin: border-box;
    background-clip: padding-box, border-box;
    transform: translateY(-2px);
  }

  &.active {
    background: var(--bg-active);
    background-origin: border-box;
    background-clip: padding-box, border-box;
  }
}

.item-type-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.02em;
}

.item-thumb-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
}

.item-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  // 标准属性（未来兼容，目前主流浏览器尚未完全支持）
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: 0.01em;
}

.item-time {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  align-self: center;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.favorite-star {
  font-size: 13px;
  color: var(--accent-quaternary);
  flex-shrink: 0;
}

/* 加载指示器样式 */
.loading-more,
.load-complete {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--text-secondary);
  font-size: 14px;
  gap: 8px;
}

.loading-more {
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  margin-top: 8px;
  margin-bottom: 8px;
}

.load-complete {
  padding: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  border-top: 1px dashed var(--border-light);
  margin-top: 4px;
}

/* 虚拟滚动占位元素 */
.virtual-scroll-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

/* 可见项目容器 */
.virtual-scroll-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform; /* 优化性能 */
}
</style>
