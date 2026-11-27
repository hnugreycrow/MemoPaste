<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { storeToRefs } from "pinia";
import { useClipboardStore, type PanelTabFilter } from "@/stores/clipboardStore";
import type { ClipboardItem, PanelShownPayload } from "@/utils/type";
import ClipCard from "./components/ClipCard.vue";
import ItemPreview from "./components/ItemPreview.vue";
import InlineSettings from "./components/InlineSettings.vue";

defineOptions({
  name: "PanelView",
});

type ViewMode = "list" | "preview" | "settings";

const clipboardStore = useClipboardStore();
const { clipboardData, activeFilter, totalItems, typeCounts, isLoadingMore, historyError, isPaused } =
  storeToRefs(clipboardStore);

const view = ref<ViewMode>("list");
const searchText = ref("");
const focusedIndex = ref(0);
const editingAliasId = ref<number | null>(null);
const previewItem = ref<ClipboardItem | null>(null);
const previewLoading = ref(false);
const recordingShortcut = ref(false);
const confirmingClear = ref(false);
const notice = ref<{ type: "success" | "error"; text: string } | null>(null);
const now = ref(new Date());

const searchInputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const tabSliderStyle = ref<{ transform: string; width: string; opacity: string }>({
  transform: "translateX(0px)",
  width: "0px",
  opacity: "0",
});

const setTabRef = (key: PanelTabFilter, el: unknown) => {
  tabRefs.value[key] = el instanceof HTMLElement ? el : null;
};

const updateTabSlider = async () => {
  await nextTick();
  const activeEl = tabRefs.value[activeFilter.value];
  if (!activeEl) return;
  tabSliderStyle.value = {
    transform: `translateX(${activeEl.offsetLeft}px)`,
    width: `${activeEl.offsetWidth}px`,
    opacity: "1",
  };
};

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let clearConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let removeShownListener: (() => void) | null = null;
let removeChangedListener: (() => void) | null = null;
let removePausedListener: (() => void) | null = null;

const tabs: { key: PanelTabFilter; label: string }[] = [
  { key: "all", label: "最近" },
  { key: "favorite", label: "常用" },
  { key: "image", label: "图片" },
];

const hasItems = computed(() => clipboardData.value.length > 0);
const nonFavoriteCount = computed(() => Math.max(0, typeCounts.value.all - typeCounts.value.favorite));

const emptyMessage = computed(() => {
  if (searchText.value.trim()) return "没有匹配的剪贴板记录";
  if (activeFilter.value === "favorite") return "暂无常用片段，点击星标或按 F2 加备注";
  if (activeFilter.value === "image") return "暂无图片历史记录";
  return "复制文本或图片后将自动记录";
});

const tabCount = (key: PanelTabFilter): number => {
  if (key === "all") return typeCounts.value.all;
  if (key === "favorite") return typeCounts.value.favorite;
  return typeCounts.value.image;
};

const showNotice = (type: "success" | "error", text: string) => {
  notice.value = { type, text };
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
  }, 2200);
};

const resetClearConfirm = () => {
  confirmingClear.value = false;
  if (clearConfirmTimer) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
};

const focusSearchInput = async () => {
  await nextTick();
  searchInputRef.value?.focus();
};

const scrollFocusedIntoView = () => {
  const list = listRef.value;
  if (!list) return;
  const el = list.querySelector<HTMLElement>(`[data-index="${focusedIndex.value}"]`);
  el?.scrollIntoView({ block: "nearest" });
};

watch(
  [activeFilter, typeCounts, view],
  () => {
    if (view.value === "list") {
      void updateTabSlider();
    }
  },
  { deep: true },
);

watch(
  () => clipboardData.value.map((item) => item.id),
  (ids, prevIds) => {
    if (ids.length === 0) {
      focusedIndex.value = 0;
      return;
    }
    const prevId = prevIds?.[focusedIndex.value];
    const nextIdx = prevId !== undefined ? ids.indexOf(prevId) : -1;
    if (nextIdx >= 0) {
      focusedIndex.value = nextIdx;
    } else if (focusedIndex.value >= ids.length) {
      focusedIndex.value = Math.max(0, ids.length - 1);
    }
  },
);

const applySearchNow = (raw: string) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  focusedIndex.value = 0;
  clipboardStore.setSearchKeyword(raw);
  if (listRef.value) listRef.value.scrollTop = 0;
};

const handleSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    applySearchNow(searchText.value);
  }, 140);
};

const clearSearch = () => {
  searchText.value = "";
  applySearchNow("");
  void focusSearchInput();
};

const selectTab = (tab: PanelTabFilter) => {
  if (activeFilter.value === tab) return;
  resetClearConfirm();
  editingAliasId.value = null;
  focusedIndex.value = 0;
  clipboardStore.setFilter(tab);
  if (listRef.value) listRef.value.scrollTop = 0;
  void focusSearchInput();
};

const cycleTab = (direction: 1 | -1) => {
  const currentIdx = tabs.findIndex((t) => t.key === activeFilter.value);
  const nextIdx = (currentIdx + direction + tabs.length) % tabs.length;
  selectTab(tabs[nextIdx].key);
};

const handleTogglePaused = async () => {
  const result = await clipboardStore.togglePaused();
  if (!result.ok) {
    showNotice("error", "切换监听状态失败");
    return;
  }
  showNotice("success", result.paused ? "已暂停记录剪贴板" : "已恢复记录剪贴板");
};

const handleClearClick = async () => {
  if (nonFavoriteCount.value === 0) return;
  if (!confirmingClear.value) {
    confirmingClear.value = true;
    clearConfirmTimer = setTimeout(() => {
      confirmingClear.value = false;
      clearConfirmTimer = null;
    }, 3000);
    return;
  }

  resetClearConfirm();
  const result = await clipboardStore.clearExceptFavorites();
  if (result.ok) {
    showNotice("success", `已清空 ${result.deletedCount ?? 0} 条非收藏记录`);
    focusedIndex.value = 0;
  } else {
    showNotice("error", "清空失败，请重试");
  }
};

const handlePaste = async (item: ClipboardItem) => {
  try {
    const result = await window.clipboard.pasteAndHide(item.id);
    if (result.status === "copied") {
      showNotice("success", "已复制，请按 Ctrl+V 粘贴");
    } else if (result.status === "failed") {
      showNotice("error", "粘贴失败，记录不可用");
    }
  } catch (error) {
    console.error("自动粘贴失败:", error);
    showNotice("error", "粘贴失败");
  }
};

const handleCopyOnly = async (item: ClipboardItem) => {
  const result = await clipboardStore.copyItem(item);
  showNotice(result.ok ? "success" : "error", result.ok ? "已复制到剪贴板" : "复制失败");
};

const handleFavorite = async (item: ClipboardItem, event?: Event) => {
  const result = await clipboardStore.toggleFavorite(item, event);
  if (!result.ok) {
    showNotice("error", "收藏状态更新失败");
    return;
  }
  if (previewItem.value && previewItem.value.id === item.id) {
    previewItem.value = { ...previewItem.value, is_favorite: !!result.favorited };
  }
};

const handleDelete = async (item: ClipboardItem, event?: Event) => {
  const result = await clipboardStore.deleteItem(item, event);
  if (!result.ok) {
    showNotice("error", "删除失败");
    return;
  }
  if (editingAliasId.value === item.id) {
    editingAliasId.value = null;
  }
  if (previewItem.value && previewItem.value.id === item.id) {
    previewItem.value = null;
    view.value = "list";
    void focusSearchInput();
  }
};

const openPreview = async (item: ClipboardItem, event?: Event) => {
  event?.stopPropagation();
  editingAliasId.value = null;
  previewItem.value = item;
  view.value = "preview";
  previewLoading.value = true;
  const full = await clipboardStore.fetchItemById(item.id);
  previewLoading.value = false;
  if (full && previewItem.value?.id === item.id) {
    previewItem.value = full;
  }
};

const startEditAlias = (item: ClipboardItem, event?: Event) => {
  event?.stopPropagation();
  editingAliasId.value = item.id;
};

const commitAlias = async (item: ClipboardItem, rawAlias: string) => {
  editingAliasId.value = null;
  const trimmed = rawAlias.trim();
  const current = item.alias ?? "";
  if (trimmed === current) {
    void focusSearchInput();
    return;
  }

  const result = await clipboardStore.setItemAlias(item, trimmed);
  if (!result.ok) {
    showNotice("error", "备注保存失败");
  } else if (trimmed) {
    showNotice("success", "备注已保存并加入常用");
  } else {
    showNotice("success", "备注已清除");
  }
  void focusSearchInput();
};

const cancelAlias = () => {
  editingAliasId.value = null;
  void focusSearchInput();
};

const openSettings = () => {
  resetClearConfirm();
  editingAliasId.value = null;
  view.value = "settings";
};

const backToList = () => {
  recordingShortcut.value = false;
  window.panel.setBlurHideSuppressed(false);
  previewItem.value = null;
  view.value = "list";
};

const handleViewEnter = () => {
  if (view.value === "list") {
    void updateTabSlider();
    void focusSearchInput();
  }
};

const handleRecordingChange = (recording: boolean) => {
  recordingShortcut.value = recording;
  window.panel.setBlurHideSuppressed(recording);
};

const handleListScroll = () => {
  const el = listRef.value;
  if (!el || isLoadingMore.value) return;
  if (clipboardData.value.length >= totalItems.value) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
    void clipboardStore.loadMoreData();
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (recordingShortcut.value) return;
  if (editingAliasId.value !== null) return;

  if (view.value === "settings") {
    if (e.key === "Escape") {
      e.preventDefault();
      backToList();
    }
    return;
  }

  if (view.value === "preview") {
    if (e.key === "Escape") {
      e.preventDefault();
      backToList();
    } else if (e.key === "Enter" && !e.isComposing && previewItem.value) {
      e.preventDefault();
      void handlePaste(previewItem.value);
    }
    return;
  }

  // 主列表态键盘流
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    const match = /^Digit([1-9])$/.exec(e.code);
    if (match) {
      const idx = Number(match[1]) - 1;
      const target = clipboardData.value[idx];
      if (target) {
        e.preventDefault();
        void handlePaste(target);
      }
      return;
    }
  }

  if (e.key === "ArrowDown") {
    if (!hasItems.value) return;
    e.preventDefault();
    focusedIndex.value = Math.min(clipboardData.value.length - 1, focusedIndex.value + 1);
    scrollFocusedIntoView();
    return;
  }

  if (e.key === "ArrowUp") {
    if (!hasItems.value) return;
    e.preventDefault();
    focusedIndex.value = Math.max(0, focusedIndex.value - 1);
    scrollFocusedIntoView();
    return;
  }

  if (e.key === "Enter" && !e.isComposing) {
    const item = clipboardData.value[focusedIndex.value];
    if (item) {
      e.preventDefault();
      void handlePaste(item);
    }
    return;
  }

  if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    cycleTab(e.shiftKey ? -1 : 1);
    return;
  }

  if (e.key === "F2") {
    const item = clipboardData.value[focusedIndex.value];
    if (item) {
      e.preventDefault();
      startEditAlias(item);
    }
    return;
  }

  if (e.key === "Delete" && e.shiftKey) {
    const item = clipboardData.value[focusedIndex.value];
    if (item) {
      e.preventDefault();
      void handleDelete(item);
    }
    return;
  }

  if (e.key === " " && !searchText.value.trim()) {
    const item = clipboardData.value[focusedIndex.value];
    if (item) {
      e.preventDefault();
      void openPreview(item);
    }
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    if (searchText.value) {
      clearSearch();
    } else {
      window.panel.hide();
    }
    return;
  }

  // 非功能键输入时，自动把焦点带回搜索框（例如刚点击完 Tab 按钮后直接打字）
  if (
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    e.key.length === 1 &&
    document.activeElement !== searchInputRef.value
  ) {
    searchInputRef.value?.focus();
  }
};

const handlePanelShown = async (payload: PanelShownPayload) => {
  now.value = new Date();
  resetClearConfirm();
  editingAliasId.value = null;
  previewItem.value = null;
  recordingShortcut.value = false;

  if (payload?.view === "settings") {
    view.value = "settings";
    return;
  }

  view.value = "list";
  searchText.value = "";
  if (clipboardStore.searchKeyword) {
    clipboardStore.searchKeyword = "";
  }
  focusedIndex.value = 0;

  await Promise.all([
    clipboardStore.loadClipboardHistory(1, false),
    clipboardStore.refreshCounts(),
    clipboardStore.syncPaused(),
  ]);

  if (listRef.value) listRef.value.scrollTop = 0;
  await focusSearchInput();
};

const scheduleRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    now.value = new Date();
    void clipboardStore.refreshAfterClipboardChange();
  }, 150);
};

onMounted(async () => {
  window.addEventListener("keydown", handleKeyDown);

  await Promise.all([
    clipboardStore.loadClipboardHistory(1, false),
    clipboardStore.refreshCounts(),
    clipboardStore.syncPaused(),
  ]);
  await updateTabSlider();
  await focusSearchInput();

  removeShownListener = window.panel.onShown((payload) => {
    void handlePanelShown(payload);
  });

  removeChangedListener = window.clipboard.onChanged(() => {
    scheduleRefresh();
  });

  removePausedListener = window.clipboard.onPausedChanged((paused) => {
    clipboardStore.isPaused = paused;
  });

  clockTimer = setInterval(() => {
    now.value = new Date();
  }, 30_000);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  removeShownListener?.();
  removeChangedListener?.();
  removePausedListener?.();
  if (searchTimer) clearTimeout(searchTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (noticeTimer) clearTimeout(noticeTimer);
  if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
  if (clockTimer) clearInterval(clockTimer);
  window.panel.setBlurHideSuppressed(false);
});
</script>

<template>
  <div class="panel-shell">
    <Transition name="view-fade" mode="out-in" @enter="handleViewEnter">
      <InlineSettings
        v-if="view === 'settings'"
        key="settings"
        @back="backToList"
        @feedback="showNotice($event.type, $event.text)"
        @recording-change="handleRecordingChange"
      />

      <ItemPreview
        v-else-if="view === 'preview' && previewItem"
        key="preview"
        :item="previewItem"
        :loading="previewLoading"
        @back="backToList"
        @paste="handlePaste"
        @copy="handleCopyOnly"
        @favorite="handleFavorite"
        @delete="handleDelete"
      />

      <div v-else key="list" class="list-view">
        <header class="panel-header">
          <div class="search-box">
            <i-ep-Search class="search-icon" aria-hidden="true" />
            <input
              ref="searchInputRef"
              v-model="searchText"
              class="search-input"
              type="text"
              placeholder="搜索内容或备注…"
              aria-label="搜索剪贴板内容或备注"
              @input="handleSearchInput"
            />
            <button
              v-if="searchText"
              type="button"
              class="search-clear"
              title="清空搜索 (Esc)"
              aria-label="清空搜索"
              @click="clearSearch"
            >
              <i-ep-Close />
            </button>
          </div>

          <button
            type="button"
            class="header-btn"
            :class="{ paused: isPaused }"
            :title="isPaused ? '已暂停记录，点击恢复' : '暂停记录剪贴板'"
            :aria-label="isPaused ? '恢复记录' : '暂停记录'"
            :aria-pressed="isPaused"
            @click="handleTogglePaused"
          >
            <i-ep-VideoPlay v-if="isPaused" />
            <i-ep-VideoPause v-else />
          </button>

          <button
            type="button"
            class="header-btn"
            title="设置"
            aria-label="打开设置"
            @click="openSettings"
          >
            <i-ep-Setting />
          </button>
        </header>

        <div class="filter-bar">
          <div class="tab-group" role="tablist" aria-label="记录分类">
            <span class="tab-slider" :style="tabSliderStyle" aria-hidden="true" />
            <button
              v-for="tab in tabs"
              :key="tab.key"
              :ref="(el) => setTabRef(tab.key, el)"
              type="button"
              role="tab"
              class="tab-btn"
              :class="{ active: activeFilter === tab.key }"
              :aria-selected="activeFilter === tab.key"
              @click="selectTab(tab.key)"
            >
              <span>{{ tab.label }}</span>
              <span class="tab-count">{{ tabCount(tab.key) }}</span>
            </button>
          </div>

          <button
            v-if="activeFilter !== 'favorite'"
            type="button"
            class="clear-btn"
            :class="{ confirming: confirmingClear }"
            :disabled="nonFavoriteCount === 0"
            :title="confirmingClear ? '再次点击确认清空非收藏历史' : '清空非收藏历史'"
            @click="handleClearClick"
          >
            {{ confirmingClear ? "确认清空？" : "清空" }}
          </button>
        </div>

        <button v-if="isPaused" type="button" class="paused-strip" @click="handleTogglePaused">
          <span>剪贴板监听已暂停，新复制不会记录</span>
          <span class="resume-link">恢复</span>
        </button>

        <div v-if="historyError" class="error-strip">
          <span>{{ historyError }}</span>
          <button
            type="button"
            class="retry-btn"
            @click="clipboardStore.loadClipboardHistory(1, false)"
          >
            重试
          </button>
        </div>

        <div
          ref="listRef"
          class="panel-list"
          role="listbox"
          aria-label="剪贴板历史列表"
          @scroll="handleListScroll"
        >
          <div v-if="!hasItems && !isLoadingMore" class="empty-state">
            <svg class="empty-glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect
                x="6"
                y="5"
                width="20"
                height="22"
                rx="4"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M11 12h10M11 17h7M11 22h5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <p class="empty-text">{{ emptyMessage }}</p>
          </div>

          <template v-else>
            <ClipCard
              v-for="(item, index) in clipboardData"
              :key="item.id"
              :item="item"
              :index="index"
              :focused="index === focusedIndex"
              :keyword="clipboardStore.searchKeyword"
              :editing-alias="editingAliasId === item.id"
              :now="now"
              @paste="handlePaste"
              @focus="focusedIndex = $event"
              @favorite="handleFavorite"
              @delete="handleDelete"
              @preview="openPreview"
              @start-edit-alias="startEditAlias"
              @commit-alias="commitAlias"
              @cancel-alias="cancelAlias"
            />

            <div v-if="isLoadingMore" class="list-footer">加载中…</div>
          </template>
        </div>

        <footer class="panel-footer" aria-hidden="true">
          <span class="hint-item"><kbd>↵</kbd> 粘贴</span>
          <span class="hint-item"><kbd>Space</kbd> 预览</span>
          <span class="hint-item"><kbd>F2</kbd> 备注</span>
          <span class="hint-item"><kbd>Alt</kbd>+<kbd>1-9</kbd> 秒贴</span>
        </footer>
      </div>
    </Transition>

    <Transition name="toast">
      <div
        v-if="notice"
        class="panel-toast"
        :class="[notice.type, { 'above-footer': view !== 'list' }]"
        role="status"
      >
        {{ notice.text }}
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.panel-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  box-shadow: var(--top-highlight);
}

.list-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.panel-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 46px;
  padding: 0 10px 0 14px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-light);
  -webkit-app-region: drag;

  /* 聚焦搜索时底部浮现极细腻的陶土暖光线 */
  &::after {
    content: "";
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: -1px;
    height: 1.5px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--accent-primary) 28%,
      var(--accent-primary) 72%,
      transparent 100%
    );
    opacity: 0;
    transform: scaleX(0.3);
    transition:
      opacity 0.2s var(--ease-out),
      transform 0.26s var(--ease-out);
    pointer-events: none;
  }

  &:focus-within::after {
    opacity: 0.7;
    transform: scaleX(1);
  }
}

.search-box,
.header-btn {
  -webkit-app-region: no-drag;
}

.search-box {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.search-icon {
  flex-shrink: 0;
  font-size: 15px;
  color: var(--text-tertiary);
  transition: color 0.14s ease;

  .search-box:focus-within & {
    color: var(--accent-primary);
  }
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
  }
}

.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    transform 0.14s var(--ease-spring);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:active {
    transform: scale(0.9);
  }

  &.paused {
    background: var(--favorite-bg);
    color: var(--favorite-border);
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.tab-group {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-secondary);
}

/* 弹性滑动胶囊指示器 */
.tab-slider {
  position: absolute;
  top: 2px;
  left: 0;
  height: 24px;
  border-radius: 6px;
  background: var(--bg-seg-active);
  box-shadow: var(--shadow-seg);
  pointer-events: none;
  transition:
    transform 0.24s var(--ease-spring),
    width 0.22s var(--ease-out),
    opacity 0.15s ease;
}

.tab-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: color 0.16s ease;

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    color: var(--accent-primary);
    font-weight: 500;
  }
}

.tab-count {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;

  .tab-btn.active & {
    color: var(--accent-primary);
    opacity: 0.85;
  }
}

.clear-btn {
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.confirming {
    background: color-mix(in srgb, var(--accent-danger) 14%, transparent);
    color: var(--accent-danger);
    font-weight: 500;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.paused-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: var(--favorite-bg);
  color: var(--favorite-text);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.resume-link {
  font-weight: 500;
  text-decoration: underline;
}

.error-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light);
  background: color-mix(in srgb, var(--accent-danger) 12%, transparent);
  color: var(--accent-danger);
  font-size: 12px;
}

.retry-btn {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-weight: 500;
  text-decoration: underline;
  cursor: pointer;
}

.panel-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 7px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
}

.empty-glyph {
  width: 30px;
  height: 30px;
  color: var(--accent-primary);
  opacity: 0.45;
}

.empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.list-footer {
  padding: 6px 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-tertiary);
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 30px;
  padding: 0 12px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
  color: var(--text-tertiary);
  font-size: 11px;
  user-select: none;
}

.hint-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 4px;
    border: 1px solid var(--border-light);
    background: var(--bg-tertiary);
    font-family: "Cascadia Mono", Consolas, ui-monospace, monospace;
    font-size: 10px;
    color: var(--text-secondary);
    line-height: 1;
  }
}

.panel-toast {
  position: absolute;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  max-width: calc(100% - 28px);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  pointer-events: none;
  z-index: 20;

  &.above-footer {
    bottom: 58px;
  }

  &.success {
    background: var(--text-primary);
    color: var(--text-inverse);
  }

  &.error {
    background: var(--accent-danger);
    color: #ffffff;
  }
}

.view-fade-enter-active,
.view-fade-leave-active {
  transition:
    opacity 0.14s var(--ease-out),
    transform 0.16s var(--ease-out);
}

.view-fade-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.view-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.18s var(--ease-spring);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}

@media (prefers-reduced-motion: reduce) {
  .tab-slider,
  .panel-header::after,
  .header-btn,
  .view-fade-enter-active,
  .view-fade-leave-active {
    transition: none;
  }
}
</style>
