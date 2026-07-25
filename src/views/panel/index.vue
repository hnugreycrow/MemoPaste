<script setup lang="ts">
/**
 * 快捷面板（不抢焦点浮层）
 * - 点击条目：写入剪贴板并模拟粘贴到当前输入焦点
 * - 面板不抢焦点；Esc 由主进程全局快捷键关闭
 */
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import type { ClipboardItem } from "@/utils/type";
import { truncateText, formatRelativeTime, getTypeLabel } from "@/utils/utils";

defineOptions({
  name: "Panel",
});

const clipboardStore = useClipboardStore();
const { clipboardData, isLoadingMore, activeFilter, totalItems } =
  storeToRefs(clipboardStore);

const focusedIndex = ref(0);
const listRef = ref<HTMLElement | null>(null);
let removeShownListener: (() => void) | null = null;
let removeClipboardListener: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const hasItems = computed(() => clipboardData.value.length > 0);

/** 打开/刷新后滚回顶部，避免沿用上次滚动位置 */
const resetScrollToTop = async () => {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = 0;
  }
};

const refreshList = async () => {
  clipboardStore.pageSize = 30;
  await clipboardStore.loadClipboardHistory(1, false, activeFilter.value);
  focusedIndex.value = 0;
  await resetScrollToTop();
};

const setFilter = async (key: string) => {
  if (activeFilter.value === key) return;
  activeFilter.value = key;
  focusedIndex.value = 0;
  await clipboardStore.loadClipboardHistory(1, false, key);
  await resetScrollToTop();
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

const onScroll = () => {
  const el = listRef.value;
  if (!el || isLoadingMore.value) return;
  if (clipboardData.value.length >= totalItems.value) return;

  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    clipboardStore.loadMoreData();
  }
};

onMounted(async () => {
  await refreshList();

  removeShownListener = window.panel.onShown(() => {
    refreshList();
  });

  removeClipboardListener = window.clipboard.onChanged(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshList();
    }, 180);
  });
});

onUnmounted(() => {
  removeShownListener?.();
  removeClipboardListener?.();
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>

<template>
  <div class="panel-shell">
    <header class="panel-header">
      <div class="header-left">
        <img src="/icon.png" class="panel-logo" alt="" draggable="false" />
        <span class="panel-title">MemoPaste</span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="icon-btn"
          title="打开主窗口"
          @click="openMain"
        >
          <el-icon><i-ep-Monitor /></el-icon>
        </button>
        <button type="button" class="icon-btn" title="关闭" @click="hidePanel">
          <el-icon><i-ep-Close /></el-icon>
        </button>
      </div>
    </header>

    <nav class="filter-tabs" aria-label="筛选">
      <button
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === 'all' }"
        @click="setFilter('all')"
      >
        <el-icon class="tab-icon"><i-ep-Menu /></el-icon>
        <span>全部</span>
      </button>
      <button
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === 'text' }"
        @click="setFilter('text')"
      >
        <el-icon class="tab-icon"><i-ep-Document /></el-icon>
        <span>文本</span>
      </button>
      <button
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === 'url' }"
        @click="setFilter('url')"
      >
        <el-icon class="tab-icon"><i-ep-Link /></el-icon>
        <span>链接</span>
      </button>
      <button
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === 'code' }"
        @click="setFilter('code')"
      >
        <el-icon class="tab-icon"><i-ep-Cpu /></el-icon>
        <span>代码</span>
      </button>
      <button
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === 'favorite' }"
        @click="setFilter('favorite')"
      >
        <el-icon class="tab-icon"><i-ep-Star /></el-icon>
        <span>收藏</span>
      </button>
    </nav>

    <div class="panel-toolbar">
      <span class="toolbar-title">
        <el-icon class="toolbar-icon"><i-ep-DocumentCopy /></el-icon>
        剪贴板
      </span>
      <button type="button" class="text-btn" @click="clearHistory">
        <el-icon class="text-btn-icon"><i-ep-Delete /></el-icon>
        全部清除
      </button>
    </div>

    <div ref="listRef" class="panel-list" @scroll="onScroll">
      <div v-if="!hasItems" class="empty">
        <el-icon class="empty-icon"><i-ep-DocumentCopy /></el-icon>
        <p>暂无记录</p>
        <span class="empty-hint">复制内容后会出现在这里</span>
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
            <el-icon class="type-icon">
              <i-ep-Document v-if="item.type === 'text'" />
              <i-ep-Link v-else-if="item.type === 'url'" />
              <i-ep-Cpu v-else-if="item.type === 'code'" />
              <i-ep-Picture v-else-if="item.type === 'image'" />
              <i-ep-Document v-else />
            </el-icon>
            {{ getTypeLabel(item.type) }}
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
      <span class="footer-hint">点击粘贴</span>
      <span class="footer-sep">·</span>
      <span class="footer-hint">Esc / 快捷键关闭</span>
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(28px) saturate(1.35);
  -webkit-backdrop-filter: blur(28px) saturate(1.35);
  -webkit-app-region: no-drag;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  -webkit-app-region: drag;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.panel-title {
  font-size: 14px;
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
  gap: 4px;
  padding: 0 10px 10px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  &.active {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--accent-primary) 28%, transparent);
  }
}

.tab-icon {
  font-size: 13px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 10px;
}

.toolbar-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.toolbar-icon {
  font-size: 13px;
  color: var(--text-tertiary);
}

.text-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--accent-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }
}

.text-btn-icon {
  font-size: 13px;
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
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 32px 0;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.55;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.8;
}

.clip-card {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    transform 0.15s ease;

  &:hover,
  &.focused {
    border-color: color-mix(in srgb, var(--accent-primary) 55%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-tertiary));
  }

  &.favorite {
    background: var(--favorite-bg);

    &:hover,
    &.focused {
      border-color: color-mix(in srgb, var(--accent-quaternary) 50%, transparent);
      background: color-mix(
        in srgb,
        var(--accent-quaternary) 10%,
        var(--favorite-bg)
      );
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
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px 2px 5px;
  border-radius: 5px;
}

.type-icon {
  font-size: 11px;
}

.card-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
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
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 12px;
  font-size: 11px;
  color: var(--text-tertiary);
  border-top: 1px solid color-mix(in srgb, var(--border-light) 70%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 35%, transparent);
}

.footer-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.footer-sep {
  opacity: 0.6;
}
</style>
