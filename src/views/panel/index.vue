<script setup lang="ts">
/**
 * 快捷面板（不抢焦点浮层）
 * - 点击条目：写入剪贴板并模拟粘贴到当前输入焦点
 * - 键盘导航在 focusable:false 下基本不可用，以鼠标为主；Esc 由主进程全局快捷键处理
 */
import { ref, onMounted, onUnmounted, computed } from "vue";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import type { ClipboardItem } from "@/utils/type";
import { truncateText, formatRelativeTime } from "@/utils/utils";
import { themeService } from "@/utils/theme";

defineOptions({
  name: "Panel",
});

const clipboardStore = useClipboardStore();
const { clipboardData, isLoadingMore, activeFilter, totalItems } =
  storeToRefs(clipboardStore);

const filters = [
  { key: "all", label: "全部" },
  { key: "text", label: "文本" },
  { key: "url", label: "链接" },
  { key: "code", label: "代码" },
  { key: "favorite", label: "收藏" },
] as const;

const typeLabel: Record<string, string> = {
  text: "文本",
  url: "链接",
  code: "代码",
  image: "图片",
};

const focusedIndex = ref(0);
const listRef = ref<HTMLElement | null>(null);
let removeShownListener: (() => void) | null = null;
let removeClipboardListener: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const hasItems = computed(() => clipboardData.value.length > 0);

const refreshList = async () => {
  clipboardStore.pageSize = 30;
  await clipboardStore.loadClipboardHistory(1, false, activeFilter.value);
  focusedIndex.value = 0;
};

const setFilter = async (key: string) => {
  if (activeFilter.value === key) return;
  activeFilter.value = key;
  focusedIndex.value = 0;
  await clipboardStore.loadClipboardHistory(1, false, key);
};

const hidePanel = () => {
  window.panel.hide();
};

const openMain = () => {
  window.panel.openMain();
};

/** 选中项：隐藏面板并粘贴到原输入框 */
const pasteItem = async (item: ClipboardItem) => {
  try {
    await window.clipboard.pasteAndHide(item.content);
  } catch (error) {
    console.error("粘贴失败:", error);
  }
};

const toggleFavorite = async (item: ClipboardItem, event: Event) => {
  event.stopPropagation();
  const next = !item.is_favorite;
  try {
    const ok = await window.clipboard.setFavorite(item.id, next);
    if (ok) {
      item.is_favorite = next;
    }
  } catch (error) {
    console.error("收藏失败:", error);
  }
};

const clearHistory = async () => {
  await clipboardStore.clearExceptFavorites();
  await refreshList();
};

const onKeyDown = (e: KeyboardEvent) => {
  // 面板通常无键盘焦点；保留逻辑以备日后改为可聚焦
  if (e.key === "Escape") {
    e.preventDefault();
    hidePanel();
    return;
  }

  if (!hasItems.value) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusedIndex.value = Math.min(
      focusedIndex.value + 1,
      clipboardData.value.length - 1,
    );
    scrollFocusedIntoView();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
    scrollFocusedIntoView();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const item = clipboardData.value[focusedIndex.value];
    if (item) pasteItem(item);
  }
};

const scrollFocusedIntoView = () => {
  const el = listRef.value?.querySelector<HTMLElement>(
    `[data-index="${focusedIndex.value}"]`,
  );
  el?.scrollIntoView({ block: "nearest" });
};

const onScroll = () => {
  const el = listRef.value;
  if (!el || isLoadingMore.value) return;
  if (clipboardData.value.length >= totalItems.value) return;

  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    clipboardStore.loadMoreData();
  }
};

onMounted(async () => {
  await themeService.initTheme();
  await refreshList();

  window.addEventListener("keydown", onKeyDown);

  // 每次唤起面板时刷新列表，并重新拉取主题（防止漏同步）
  removeShownListener = window.panel.onShown(() => {
    themeService.initTheme();
    refreshList();
  });

  // 仅刷新列表，不入库（入库由主窗口 Layout 的剪贴板监听负责）
  removeClipboardListener = window.clipboard.onChanged(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshList();
    }, 180);
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  removeShownListener?.();
  removeClipboardListener?.();
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>

<template>
  <div class="panel-shell">
    <header class="panel-header">
      <div class="header-left">
        <span class="panel-title">MemoPaste</span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="icon-btn"
          title="打开主窗口"
          @click="openMain"
        >
          <el-icon><i-ep-Setting /></el-icon>
        </button>
        <button type="button" class="icon-btn" title="关闭" @click="hidePanel">
          <el-icon><i-ep-Close /></el-icon>
        </button>
      </div>
    </header>

    <nav class="filter-tabs" aria-label="筛选">
      <button
        v-for="filter in filters"
        :key="filter.key"
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === filter.key }"
        @click="setFilter(filter.key)"
      >
        {{ filter.label }}
      </button>
    </nav>

    <div class="panel-toolbar">
      <span class="toolbar-title">剪贴板</span>
      <button type="button" class="text-btn" @click="clearHistory">
        全部清除
      </button>
    </div>

    <div ref="listRef" class="panel-list" @scroll="onScroll">
      <div v-if="!hasItems" class="empty">
        <el-icon class="empty-icon"><i-ep-DocumentCopy /></el-icon>
        <p>暂无记录</p>
      </div>

      <div
        v-for="(item, index) in clipboardData"
        :key="item.id"
        class="clip-card"
        :class="{ focused: index === focusedIndex, favorite: item.is_favorite }"
        :data-index="index"
        role="button"
        tabindex="0"
        @click="pasteItem(item)"
        @mouseenter="focusedIndex = index"
      >
        <div class="card-top">
          <span class="type-badge" :class="`type-${item.type}`">
            {{ typeLabel[item.type] ?? "文本" }}
          </span>
          <span class="card-time">{{ formatRelativeTime(item.timestamp) }}</span>
        </div>
        <div class="card-body">
          {{ truncateText(item.content, 120) }}
        </div>
        <div class="card-actions">
          <button
            type="button"
            class="pin-btn"
            :class="{ active: item.is_favorite }"
            title="收藏"
            @click="toggleFavorite(item, $event)"
          >
            <el-icon><i-ep-Star /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <footer class="panel-footer">
      <span>点击粘贴 · Esc / 快捷键关闭</span>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.panel-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  /* 半透明底 + 毛玻璃；不在 CSS 里做外阴影，避免圆角外出现灰块 */
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-light) 80%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(28px) saturate(1.35);
  -webkit-backdrop-filter: blur(28px) saturate(1.35);
  -webkit-app-region: no-drag;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  -webkit-app-region: drag;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.header-actions {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.filter-tabs {
  display: flex;
  gap: 2px;
  padding: 0 10px 8px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-tab {
  flex-shrink: 0;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;

  &:hover {
    color: var(--text-secondary);
  }

  &.active {
    color: var(--accent-primary);

    &::after {
      content: "";
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 0;
      height: 2px;
      border-radius: 2px;
      background: var(--accent-primary);
    }
  }
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px 8px;
}

.toolbar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.text-btn {
  border: none;
  background: transparent;
  color: var(--accent-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;

  &:hover {
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }
}

.panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 32px 0;
}

.empty-icon {
  font-size: 28px;
  opacity: 0.7;
}

.clip-card {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  color: var(--text-primary);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;

  &:hover,
  &.focused {
    /* 淡强调色描边，避免黑/白粗框 */
    border-color: color-mix(in srgb, var(--accent-primary) 55%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-tertiary));
  }

  &.favorite {
    background: var(--favorite-bg);

    &:hover,
    &.focused {
      border-color: color-mix(in srgb, var(--accent-quaternary) 50%, transparent);
      background: color-mix(in srgb, var(--accent-quaternary) 10%, var(--favorite-bg));
    }
  }
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);

  &.type-text {
    background: var(--type-text-bg);
  }
  &.type-url {
    background: var(--type-url-bg);
  }
  &.type-code {
    background: var(--type-code-bg);
  }
  &.type-image {
    background: var(--type-image-bg);
  }
}

.card-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.card-body {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 3.9em;
  overflow: hidden;
  padding-right: 28px;
}

.card-actions {
  position: absolute;
  right: 8px;
  bottom: 8px;
}

.pin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--accent-quaternary);
  }

  &.active {
    color: var(--accent-quaternary);
  }
}

.panel-footer {
  padding: 8px 14px 12px;
  font-size: 11px;
  color: var(--text-tertiary);
  border-top: 1px solid color-mix(in srgb, var(--border-light) 70%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 35%, transparent);
}
</style>
