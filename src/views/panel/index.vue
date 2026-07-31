<script setup lang="ts">
/**
 * 快捷面板（不抢焦点浮层）
 * - 点击条目：写入剪贴板并模拟粘贴到当前输入焦点
 * - 面板不抢焦点；Esc 由主进程全局快捷键关闭
 */
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import type { ClipboardItem, PanelNavAction } from "@/utils/type";
import { truncateText, formatRelativeTime, getTypeLabel, clipimgUrl } from "@/utils/utils";
import { APP_ICON_URL } from "@/constants/assets";

defineOptions({
  name: "Panel",
});

const clipboardStore = useClipboardStore();
const { clipboardData, isLoadingMore, activeFilter, totalItems } = storeToRefs(clipboardStore);

const focusedIndex = ref(0);
const listRef = ref<HTMLElement | null>(null);
let removeShownListener: (() => void) | null = null;
let removeClipboardListener: (() => void) | null = null;
let removeNavListener: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const hasItems = computed(() => clipboardData.value.length > 0);

/** 打开/刷新后滚回顶部，避免沿用上次滚动位置 */
const resetScrollToTop = async () => {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = 0;
  }
};

const scrollFocusedIntoView = async () => {
  await nextTick();
  const el = listRef.value?.querySelector(
    `.clip-card[data-index="${focusedIndex.value}"]`,
  ) as HTMLElement | null;
  el?.scrollIntoView({ block: "nearest" });
};

const refreshList = async () => {
  await clipboardStore.loadClipboardHistory(1, false, activeFilter.value);
  focusedIndex.value = 0;
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
    await window.clipboard.pasteAndHide(item.id);
  } catch (error) {
    console.error("粘贴失败:", error);
  }
};

const handlePanelNav = (action: PanelNavAction) => {
  const len = clipboardData.value.length;
  if (action === "enter") {
    if (len === 0) return;
    const item = clipboardData.value[focusedIndex.value];
    if (item) void pasteItem(item);
    return;
  }

  if (len === 0) return;
  if (action === "up") {
    focusedIndex.value = Math.max(0, focusedIndex.value - 1);
  } else if (action === "down") {
    focusedIndex.value = Math.min(len - 1, focusedIndex.value + 1);
  }
  void scrollFocusedIntoView();
};

const toggleFavorite = async (item: ClipboardItem, event: Event) => {
  await clipboardStore.toggleFavorite(item, event);
};

const clearHistory = async () => {
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
    if (!result.ok) {
      ElMessage({ message: "清空失败", type: "error" });
      return;
    }
    await refreshList();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage({ message: "清空失败", type: "error" });
    }
  }
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

  removeNavListener = window.panel.onNav(handlePanelNav);

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
  removeNavListener?.();
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>

<template>
  <div class="panel-shell">
    <header class="panel-header">
      <div class="header-left">
        <img :src="APP_ICON_URL" class="panel-logo" alt="" draggable="false" />
        <span class="panel-title">MemoPaste</span>
      </div>
      <div class="header-actions">
        <button type="button" class="icon-btn" title="打开主窗口" @click="openMain">
          <el-icon><i-ep-Monitor /></el-icon>
        </button>
        <button type="button" class="icon-btn" title="关闭" @click="hidePanel">
          <el-icon><i-ep-Close /></el-icon>
        </button>
      </div>
    </header>

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
        <span class="empty-hint">复制文本或截图后会出现在这里</span>
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
        <div class="card-body" :class="{ 'is-image': item.type === 'image' }">
          <template v-if="item.type === 'image'">
            <span class="card-image-label">{{ item.content }}</span>
            <div class="card-thumb-wrap">
              <img
                v-if="item.thumb_path"
                class="card-thumb"
                :src="clipimgUrl(item.thumb_path)"
                alt=""
                draggable="false"
              />
              <div v-else class="card-thumb-fallback">图片</div>
            </div>
          </template>
          <template v-else>
            {{ truncateText(item.content, 120) }}
          </template>
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
      <span class="footer-hint">↑↓ 选择</span>
      <span class="footer-sep">·</span>
      <span class="footer-hint">Enter 粘贴</span>
      <span class="footer-sep">·</span>
      <span class="footer-hint">Esc 关闭</span>
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

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 10px;
}

.toolbar-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.toolbar-icon {
  font-size: 14px;
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
  height: 3.9em;
  overflow: hidden;
  padding-right: 28px;

  &.is-image {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: normal;
    height: auto;
    min-height: 3.9em;
  }
}

.card-thumb-wrap {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
}

.card-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-tertiary);
}

.card-image-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
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
