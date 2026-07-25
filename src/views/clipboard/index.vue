<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, onActivated } from "vue";
import DetailPanel from "./components/DetailPanel.vue";
import FilterChips from "./components/FilterChips.vue";
import { ClipboardItem } from "@/utils/type";
import { truncateText, formatRelativeTime, getTypeLabel } from "@/utils/utils";
import { useSearch } from "./composables/useSearch";
import { useVirtualScroll } from "./composables/useVirtualScroll";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

// 定义组件名称，用于keep-alive识别
defineOptions({
  name: "Clipboard",
});

const clipboardStore = useClipboardStore();
const { clipboardData, isLoadingMore, activeFilter, totalItems, currentPage } =
  storeToRefs(clipboardStore);

// 搜索功能（输入下推到 store，由后端 SQL LIKE 处理）
const { searchQuery } = useSearch();

// 虚拟滚动
const { contentListRef, virtualScroll, visibleItems, handleScroll } =
  useVirtualScroll(() => clipboardData.value);

const selectedItem = ref<ClipboardItem | null>(null);

/** 列表有数据且无有效选中时，默认选中首条 */
const ensureSelection = () => {
  const items = clipboardData.value;
  if (items.length === 0) {
    selectedItem.value = null;
    return;
  }

  if (selectedItem.value) {
    const stillExists = items.some((item) => item.id === selectedItem.value?.id);
    if (stillExists) return;
  }

  selectItem(items[0]);
};

// 监听类型过滤器变化，重新加载数据
watch(activeFilter, (newType) => {
  // 切换类型时，重置页码并重新加载数据
  currentPage.value = 1;
  clipboardStore.loadClipboardHistory(1, false, newType);
});

// 监听 store 的 items 变化
watch(
  () => clipboardData.value,
  () => {
    ensureSelection();
  },
  { deep: true },
);

const showAllContent = ref(false);

/**
 * 选择剪贴板项目
 * @param {ClipboardItem} item - 待选择的项目
 * @returns {void}
 */
const selectItem = (item: ClipboardItem) => {
  showAllContent.value = false;
  selectedItem.value = item;
};

/**
 * 切换收藏状态
 * @param {ClipboardItem} item - 待切换收藏状态的项目
 * @param {Event} [event] - 可选的事件对象，用于阻止事件冒泡
 * @returns {void}
 */
const toggleFavorite = (item: ClipboardItem, event?: Event) => {
  if (event) event.stopPropagation();
  const newStatus = !item.is_favorite;

  window.clipboard
    .setFavorite(item.id, newStatus)
    .then((success) => {
      if (success) {
        // 更新本地状态
        item.is_favorite = newStatus;
        clipboardStore.refreshCounts();
        ElMessage({
          message: newStatus ? "已添加到收藏" : "已取消收藏",
          type: newStatus ? "success" : "info",
        });
      } else {
        console.error("设置收藏状态失败");
        ElMessage({
          message: "操作失败",
          type: "error",
        });
      }
    })
    .catch((error) => {
      console.error("设置收藏状态出错:", error);
      ElMessage({
        message: "操作失败",
        type: "error",
      });
    });
};

/**
 * 复制项目内容到剪贴板
 * @param {ClipboardItem} item - 待复制的项目
 * @param {Event} [event] - 可选的事件对象，用于阻止事件冒泡
 * @returns {void}
 */
const copyItem = (item: ClipboardItem, event?: Event) => {
  if (event) event.stopPropagation();
  window.clipboard
    .write(item.content)
    .then(() => {
      ElMessage({
        message: "复制成功",
        type: "primary",
      });
    })
    .catch((error) => {
      console.error("复制失败:", error);
      ElMessage({
        message: "复制失败",
        type: "error",
      });
    });
};

// 组件挂载时启动监听，加载历史记录，卸载时停止监听
onMounted(() => {
  // 加载历史记录（只加载第一页）
  clipboardStore.loadClipboardHistory(1, false, activeFilter.value);
  // 拉取分类计数
  clipboardStore.refreshCounts();

  setTimeout(() => {
    // 初始化滚动参数
    handleScroll();
  }, 100);

  window.addEventListener("resize", handleScroll);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleScroll);
});

onActivated(() => {
  // 调用时机为首次挂载
  // 以及每次从缓存中被重新插入时
  handleScroll();
  clipboardStore.refreshCounts();
});
</script>

<template>
  <div class="main-content">
    <div class="two-column-body">
      <div class="content-container">
        <!-- 搜索区域 -->
        <div class="search-container">
          <div class="search-box">
            <i-ep-search class="search-icon" />
            <el-input
              v-model="searchQuery"
              class="search-input"
              placeholder="搜索剪贴板内容..."
              clearable
            />
          </div>
          <el-dropdown trigger="click" placement="bottom-end">
            <el-button class="search-action-btn" title="更多操作">
              <i-ep-MoreFilled />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="clipboardStore.clearExceptFavorites">
                  <i-ep-Delete class="el-icon--left" />清空非收藏记录
                </el-dropdown-item>
                <el-dropdown-item @click="clipboardStore.clearAll" divided>
                  <i-ep-Warning class="el-icon--left" />清空全部（含收藏）
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <FilterChips />

        <!-- 内容列表 -->
        <div class="content-list" ref="contentListRef" @scroll="handleScroll">
          <template v-if="clipboardData.length === 0">
            <div class="empty-state">
              <img src="/mascot.png" class="mascot" alt="MemoPaste" />
              <div class="empty-title">暂无记录</div>
              <div class="empty-desc">开始复制内容，它们会出现在这里</div>
            </div>
          </template>
          <template v-else>
            <!-- 虚拟滚动占位元素，撑开滚动区域 -->
            <div
              class="virtual-scroll-placeholder"
              :style="{ height: `${virtualScroll.totalHeight}px` }"
            ></div>

            <!-- 可见项目容器，使用绝对定位 -->
            <div
              class="virtual-scroll-content"
              :style="{
                transform: `translateY(${
                  virtualScroll.startIndex * virtualScroll.itemHeight
                }px)`,
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
              </div>

              <!-- 全部加载完毕提示 -->
              <div
                v-if="
                  !isLoadingMore &&
                  clipboardData.length >= totalItems &&
                  clipboardData.length > 0
                "
                class="load-complete"
              >
                <span>已加载全部内容</span>
              </div>
            </div>
          </template>
        </div>

        <!-- 加载更多指示器 -->
        <div v-if="isLoadingMore && currentPage > 1" class="loading-more">
          <el-icon class="is-loading"><i-ep-Loading /></el-icon>
          <span>加载更多...</span>
        </div>
      </div>

      <!-- 详情面板 -->
      <DetailPanel
        :item="selectedItem"
        v-model:showAllContent="showAllContent"
        @copy="copyItem"
        @delete="clipboardStore.deleteItem"
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
