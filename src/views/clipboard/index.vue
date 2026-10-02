<script setup lang="ts">
import {
  ref,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  watch,
  onActivated,
  onDeactivated,
} from "vue";
import type { InputInstance } from "element-plus";
import DetailPanel from "./components/DetailPanel.vue";
import FilterChips from "./components/FilterChips.vue";
import HistoryList from "./components/HistoryList.vue";
import FavoritesList from "./components/FavoritesList.vue";
import type { ClipboardItem } from "@/utils/type";
import { useSearch } from "./composables/useSearch";
import { useColumnResize } from "./composables/useColumnResize";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

// keep-alive 需要 name，与 router 缓存路由名对应
defineOptions({
  name: "Clipboard",
});

const clipboardStore = useClipboardStore();
const { clipboardData, isLoadingMore, activeFilter, currentPage, totalItems } =
  storeToRefs(clipboardStore);

/** 侧栏「收藏」：长期抽屉视图，与流水历史区分文案与布局 */
const isFavoritesView = computed(() => activeFilter.value === "favorite");

const searchPlaceholder = computed(() =>
  isFavoritesView.value ? "搜索收藏..." : "搜索剪贴板内容...",
);

// 搜索下推到 store，由主进程 SQL LIKE 处理（非前端过滤）
const { searchQuery } = useSearch();

const selectedItem = ref<ClipboardItem | null>(null);
const mainContentRef = ref<HTMLDivElement | null>(null);
const historyListRef = ref<InstanceType<typeof HistoryList> | null>(null);
const favoritesListRef = ref<InstanceType<typeof FavoritesList> | null>(null);
const searchInputRef = ref<InputInstance | null>(null);
const displayItems = computed(() =>
  isFavoritesView.value
    ? clipboardData.value.filter((item) => item.is_favorite)
    : clipboardData.value,
);
const {
  ready,
  resetWidth,
  columnsRef,
  listWidth,
  minWidth,
  maxWidth,
  isResizing,
  startResize,
  moveResize,
  finishResize,
  resizeWithKeyboard,
} = useColumnResize();
/** 避免快速切换或列表刷新时，过期的 getItem 覆盖当前选中 */
let selectionRequestId = 0;
let isPageActive = false;
const keyboardActive = ref(false);
const updateKeyboardHint = () => {
  const target = document.activeElement;
  keyboardActive.value =
    !hasOpenDialog() &&
    (target === document.body ||
      target === mainContentRef.value ||
      !!target?.closest(".clipboard-item-select"));
};
let dialogObserver: MutationObserver | undefined;

const hasOpenDialog = () =>
  Array.from(
    document.querySelectorAll('.el-image-viewer__wrapper, .el-message-box, [role="dialog"]'),
  ).some((element) => element.getClientRects().length > 0);

/** 切换完成后仅从导航、筛选或空白处恢复列表焦点，保留用户正在操作的控件。 */
const canRestoreListFocus = () => {
  const focused = document.activeElement;
  if (hasOpenDialog()) return false;
  return (
    focused === document.body ||
    focused === mainContentRef.value ||
    (focused instanceof HTMLElement &&
      (focused.matches(".nav-list .nav-item") ||
        (!!mainContentRef.value?.contains(focused) &&
          focused.matches(".filter-segment-item, .clipboard-item-select"))))
  );
};

const focusListSelection = async (restore = false) => {
  await nextTick();
  if (!isPageActive || !mainContentRef.value?.isConnected) return;
  if (restore && !canRestoreListFocus()) return;
  if (selectedItem.value) {
    const list = isFavoritesView.value ? favoritesListRef.value : historyListRef.value;
    list?.scrollToItem(selectedItem.value.id);
    await nextTick();
  }
  if (!isPageActive || !mainContentRef.value?.isConnected) return;
  if (restore && !canRestoreListFocus()) return;
  const selectedButton = mainContentRef.value.querySelector<HTMLButtonElement>(
    "#clipboard-list .content-item.active .clipboard-item-select",
  );
  (selectedButton ?? mainContentRef.value).focus({ preventScroll: true });
};

/** 同一条记录保留全文对象和展开状态，后台更新只同步元数据。 */
const ensureSelection = async () => {
  const items = displayItems.value;
  if (items.length === 0) {
    ++selectionRequestId;
    selectedItem.value = null;
    return;
  }

  if (selectedItem.value) {
    const latest = items.find((item) => item.id === selectedItem.value?.id);
    if (latest) {
      const current = selectedItem.value;
      current.timestamp = latest.timestamp;
      current.is_favorite = latest.is_favorite;
      return;
    }
  }

  await selectItem(items[0]);
};

watch(activeFilter, async (newType) => {
  clipboardStore.clipboardData = [];
  clipboardStore.totalItems = 0;
  currentPage.value = 1;
  const loaded = await clipboardStore.loadClipboardHistory(1, false, newType);
  if (loaded.ok && newType === activeFilter.value) {
    await ensureSelection();
    await focusListSelection(true);
  }
});

watch(
  () => displayItems.value.map((item) => item.id),
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
  if (selectedItem.value?.id === item.id) return;
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

const handleKeyboard = async (event: KeyboardEvent) => {
  if (!isPageActive || event.defaultPrevented || hasOpenDialog()) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    searchInputRef.value?.focus();
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (
    target !== document.body &&
    target !== mainContentRef.value &&
    !target.closest(".clipboard-item-select")
  ) {
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.key === "Enter" && selectedItem.value) {
    event.preventDefault();
    await copyItem(selectedItem.value);
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key) || displayItems.value.length === 0) return;
  event.preventDefault();
  const index = displayItems.value.findIndex((item) => item.id === selectedItem.value?.id);
  const next = Math.max(
    0,
    Math.min(displayItems.value.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
  );
  const item = displayItems.value[next];
  void selectItem(item);
  await focusListSelection();
};

onMounted(async () => {
  document.addEventListener("focusin", updateKeyboardHint);
  document.addEventListener("focusout", updateKeyboardHint);
  dialogObserver = new MutationObserver(updateKeyboardHint);
  dialogObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  isPageActive = true;
  window.addEventListener("keydown", handleKeyboard);
  const loaded = await clipboardStore.loadClipboardHistory(1, false, activeFilter.value);
  if (!loaded.ok) {
    ElMessage({ message: "加载历史记录失败", type: "error", plain: true });
  }
  clipboardStore.refreshCounts();
  await ensureSelection();
  await focusListSelection(true);
});

onUnmounted(() => {
  document.removeEventListener("focusin", updateKeyboardHint);
  document.removeEventListener("focusout", updateKeyboardHint);
  dialogObserver?.disconnect();
  isPageActive = false;
  window.removeEventListener("keydown", handleKeyboard);
});

onActivated(() => {
  isPageActive = true;
  window.addEventListener("keydown", handleKeyboard);
  clipboardStore.refreshCounts();
  void focusListSelection(true);
});
onDeactivated(() => {
  isPageActive = false;
  window.removeEventListener("keydown", handleKeyboard);
});
</script>

<template>
  <div ref="mainContentRef" class="main-content" tabindex="-1">
    <div
      ref="columnsRef"
      class="two-column-body"
      :class="{ 'is-resizing': isResizing }"
      :style="{ visibility: ready ? 'visible' : 'hidden' }"
    >
      <div id="clipboard-list" class="content-container" :style="{ flexBasis: `${listWidth}px` }">
        <div class="list-toolbar">
          <div class="list-heading">
            <h1>{{ isFavoritesView ? "收藏" : "历史记录" }}</h1>
            <span class="list-count">{{
              clipboardStore.searchKeyword ? `找到 ${totalItems} 条` : `${totalItems} 条`
            }}</span>
            <el-dropdown v-if="!isFavoritesView" trigger="click" placement="bottom-end">
              <el-button class="search-action-btn" text aria-label="更多历史操作" title="更多操作">
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
          <el-input
            ref="searchInputRef"
            v-model="searchQuery"
            class="search-input"
            :placeholder="searchPlaceholder"
            :aria-label="isFavoritesView ? '搜索收藏' : '搜索剪贴板内容'"
            clearable
          >
            <template #prefix><i-ep-Search /></template>
            <template #suffix
              ><kbd v-if="!searchQuery" class="search-shortcut">Ctrl + F</kbd></template
            >
          </el-input>
        </div>
        <FilterChips v-if="!isFavoritesView" />
        <div v-if="clipboardStore.historyError" class="history-error" role="alert">
          {{ clipboardStore.historyError }}
          <el-button link type="primary" @click="clipboardStore.loadClipboardHistory()"
            >重试</el-button
          >
        </div>
        <template v-if="!clipboardStore.historyError || clipboardData.length > 0">
          <FavoritesList
            v-if="isFavoritesView"
            ref="favoritesListRef"
            :selected-id="selectedItem?.id"
            @select="selectItem"
            @favorite="toggleFavorite"
          />
          <HistoryList
            v-else
            ref="historyListRef"
            :selected-id="selectedItem?.id"
            @select="selectItem"
          />
        </template>
        <div v-if="isLoadingMore && currentPage > 1" class="loading-more" role="status">
          <el-icon class="is-loading"><i-ep-Loading /></el-icon>
          <span>加载更多...</span>
        </div>
      </div>
      <div
        class="column-resizer"
        role="separator"
        tabindex="0"
        aria-label="调整列表和预览宽度"
        aria-orientation="vertical"
        aria-controls="clipboard-list"
        :aria-valuemin="Math.round(minWidth)"
        :aria-valuemax="Math.round(maxWidth)"
        :aria-valuenow="Math.round(listWidth)"
        title="拖动或使用左右方向键调整栏宽，双击恢复默认"
        @dblclick="resetWidth"
        @keydown="resizeWithKeyboard"
        @pointerdown="startResize"
        @pointermove="moveResize"
        @pointerup="finishResize"
        @pointercancel="finishResize"
        @lostpointercapture="finishResize"
      />
      <DetailPanel
        :item="selectedItem"
        :search="clipboardStore.searchKeyword"
        :keyboard-active="keyboardActive"
        v-model:showAllContent="showAllContent"
        @copy="copyItem"
        @delete="deleteItem"
        @favorite="toggleFavorite"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.history-error {
  padding: 10px 16px;
  color: var(--text-primary);
  font-size: 12px;
}
.main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--bg-primary);
  overflow: hidden;

  // 图片预览关闭时可能将焦点还给此容器；焦点提示由具体控件提供。
  &:focus {
    outline: none;
  }
}

.two-column-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.content-container {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--list-bg);
}

.list-toolbar {
  padding: 12px 16px 10px;
  flex-shrink: 0;
}

.list-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  margin-bottom: 10px;

  h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
  }

  .el-dropdown {
    margin-left: auto;
  }
}

.list-count {
  color: var(--text-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.search-action-btn {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.search-input {
  width: 100%;

  :deep(.el-input__wrapper) {
    padding: 0 10px;
    min-height: 34px;
    border-radius: 7px;
  }

  :deep(.el-input__inner) {
    font-size: 12px;
  }
}

.search-shortcut {
  padding: 1px 4px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--shortcut-size);
  line-height: 1.4;
}

.column-resizer {
  position: relative;
  z-index: 3;
  flex: 0 0 6px;
  cursor: col-resize;
  touch-action: none;
  -webkit-app-region: no-drag;
  background: var(--list-bg);

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--border-light);
  }

  &::after {
    content: "";
    position: absolute;
    top: calc(50% - 12px);
    left: 1px;
    width: 3px;
    height: 24px;
    border-radius: 3px;
    background: var(--border-medium);
  }

  &:hover::after,
  &:focus-visible::after {
    background: var(--accent-primary);
  }

  &:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: -1px;
  }
}

.is-resizing {
  cursor: col-resize;
  user-select: none;

  > .column-resizer::after {
    background: var(--accent-primary);
  }

  > :not(.column-resizer) {
    pointer-events: none;
  }
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: 30px;
  color: var(--text-secondary);
  font-size: 11px;
}
</style>
