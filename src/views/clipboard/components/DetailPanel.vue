<template>
  <div class="detail-panel">
    <div class="detail-header">
      <div class="detail-title">{{ item ? "详情" : "" }}</div>
      <div class="detail-header-actions">
        <template v-if="item">
          <el-tooltip content="放大查看" placement="bottom">
            <el-button class="header-action-btn" text @click="openZoomView">
              <i-ep-Full-Screen />
            </el-button>
          </el-tooltip>
          <el-tooltip
            :content="item.is_favorite ? '取消收藏' : '收藏'"
            placement="bottom"
          >
            <el-button
              class="header-action-btn"
              :class="{ 'is-favorite': item.is_favorite }"
              text
              @click="toggleFavorite(item)"
            >
              <i-ep-Star />
            </el-button>
          </el-tooltip>
          <el-tooltip content="删除" placement="bottom">
            <el-button class="header-action-btn" text @click="deleteItem(item)">
              <i-ep-Delete />
            </el-button>
          </el-tooltip>
        </template>
      </div>
    </div>

    <div v-if="item" class="detail-content">
      <div class="detail-text">
        <el-tooltip content="复制内容" placement="left">
          <el-button class="copy-overlay-btn" @click="copyItem(item)">
            <i-ep-Document-Copy />
          </el-button>
        </el-tooltip>
        <div class="detail-text-body">
          <HighlightedText :content="displayContent" :type="props.item?.type" />
          <div class="expend-button">
            <el-button
              v-if="item.content.length > MAX_CONTENT_LENGTH"
              link
              type="primary"
              @click="showAllContent = !showAllContent"
            >
              {{ showAllContent ? "收起" : "展开" }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="detail-meta">
        <div class="detail-meta-item">
          <span class="meta-label">类型</span>
          <div class="detail-type">
            <span class="detail-type-label" :class="`type-${item.type}`">{{ typeLabel }}</span>
          </div>
        </div>
        <div class="detail-meta-item">
          <span class="meta-label">创建时间</span>
          <span class="meta-value">{{ formattedTime }}</span>
        </div>
        <div class="detail-meta-item">
          <span class="meta-label">大小</span>
          <span class="meta-value">{{ item.size }}</span>
        </div>
        <div class="detail-meta-item">
          <span class="meta-label">ID</span>
          <span class="meta-value">{{ item.id }}</span>
        </div>
        <div
          v-if="item.is_favorite"
          class="detail-meta-item detail-meta-item--full"
        >
          <span class="meta-label">收藏</span>
          <span class="meta-value meta-value-favorite">
            <i-ep-Star />
            已收藏
          </span>
        </div>
      </div>
    </div>

    <div v-else class="detail-empty">
      <i-ep-Document-Copy class="empty-icon" />
      <div class="empty-title">暂无选中项</div>
      <div class="empty-desc">选择一个剪贴板项目查看详情</div>
    </div>

    <!-- 放大查看对话框 -->
    <el-dialog
      v-model="zoomVisible"
      title="详情内容"
      width="85%"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      class="zoom-dialog"
      destroy-on-close
    >
      <div class="zoom-content">
        <div class="zoom-meta">
          <div class="zoom-meta-item">
            <span class="zoom-meta-label">类型</span>
            <span class="zoom-meta-value">{{ typeLabel }}</span>
          </div>
          <div class="zoom-meta-item">
            <span class="zoom-meta-label">创建时间</span>
            <span class="zoom-meta-value">{{ formattedTime }}</span>
          </div>
          <div class="zoom-meta-item">
            <span class="zoom-meta-label">字符数</span>
            <span class="zoom-meta-value">{{
              item?.content?.length || 0
            }}</span>
          </div>
        </div>
        <div class="zoom-text">
          <HighlightedText
            :content="item?.content || ''"
            :type="props.item?.type"
          />
        </div>
      </div>
      <template #footer>
        <div class="zoom-footer">
          <el-button type="primary" @click="copyItem(item!)">
            <i-ep-Document-Copy class="btn-icon" />
            <span>复制内容</span>
          </el-button>
          <el-button @click="closeZoomView">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import HighlightedText from "./HighlightedText.vue";
import { ClipboardItem } from "@/utils/type";
import { formatTime, getTypeLabel } from "@/utils/utils";

interface Item extends ClipboardItem {}

const props = defineProps<{
  item: Item | null;
}>();

const emit = defineEmits<{
  close: [];
  copy: [item: Item];
  delete: [item: Item];
  favorite: [item: Item];
}>();

const showAllContent = defineModel<boolean>("showAllContent");

// 优化：使用计算属性缓存格式化结果，避免重复计算
const formattedTime = computed(() => {
  return props.item ? formatTime(props.item.timestamp) : "";
});

const typeLabel = computed(() => {
  return props.item ? getTypeLabel(props.item.type) : "";
});

// 优化：截断长文本内容，避免渲染大量文本导致的性能问题
const MAX_CONTENT_LENGTH = 3000;
const displayContent = computed(() => {
  if (!props.item?.content) return "";
  const content = props.item.content;
  // 如果内容过长且未选择显示全部，则截断内容
  if (!showAllContent.value && content.length > MAX_CONTENT_LENGTH) {
    return content.slice(0, MAX_CONTENT_LENGTH) + "...";
  }
  return content;
});

const copyItem = (item: Item) => {
  emit("copy", item);
};

const deleteItem = (item: Item) => {
  emit("delete", item);
};

const toggleFavorite = (item: Item) => {
  emit("favorite", item);
};

// 放大查看
const zoomVisible = ref(false);
const openZoomView = () => {
  zoomVisible.value = true;
};
const closeZoomView = () => {
  zoomVisible.value = false;
};
</script>

<style lang="scss" scoped>
.detail-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--detail-bg);
  border-left: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.detail-header {
  height: 60px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-title {
  font-size: 16px;
  margin: 0;
  color: var(--text-secondary);
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-action-btn {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  font-size: 16px;
  color: var(--text-secondary);

  &:hover {
    color: var(--text-primary);
  }

  &.is-favorite {
    color: var(--accent-quaternary);
  }
}

.detail-content {
  flex: 1;
  padding: 10px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-type {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-type-label.type-text {
  color: var(--accent-primary);
}

.detail-type-label.type-url {
  color: var(--accent-secondary);
}

.detail-type-label.type-code {
  color: var(--accent-tertiary);
}

.detail-type-label.type-image {
  color: var(--accent-danger);
}

.detail-type-label {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.detail-text {
  position: relative;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

.detail-text-body {
  padding-top: 15px;
  max-height: 40vh;
  overflow: auto;
}

.copy-overlay-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.detail-text:hover .copy-overlay-btn {
  opacity: 1;
  pointer-events: auto;
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  min-width: 0;
}

.detail-meta-item--full {
  grid-column: 1 / -1;
}

.meta-label {
  font-size: 12px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.meta-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-all;
}

.meta-value-favorite {
  color: var(--accent-quaternary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  text-align: center;
  padding: 60px 24px;
}

.detail-empty .empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.detail-empty .empty-title {
  font-size: 16px;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.detail-empty .empty-desc {
  font-size: 14px;
  color: var(--text-tertiary);
}

.expend-button {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
}

/* 放大查看对话框样式 */
:deep(.zoom-dialog .el-dialog__body) {
  padding: 0;
  max-height: 70vh;
  overflow: hidden;
}

.zoom-content {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  border: 1px solid var(--border-light);
}

.zoom-meta {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.zoom-meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.zoom-meta-label {
  color: var(--text-secondary);
}

.zoom-meta-value {
  color: var(--text-primary);
  font-weight: 500;
}

.zoom-text {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: var(--bg-tertiary);
  font-size: 14px;
  line-height: 1.7;
  word-break: break-all;
  white-space: pre-wrap;
  color: var(--text-primary);
  min-height: 200px;
  max-height: calc(70vh - 60px);
}

.zoom-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
