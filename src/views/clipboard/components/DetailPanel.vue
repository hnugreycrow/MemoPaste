<template>
  <div class="detail-panel">
    <div class="detail-header">
      <div v-if="item" class="detail-header-meta">
        <span class="type-chip" :class="`type-${item.type}`">{{ typeLabel }}</span>
        <span class="detail-time">{{ formattedTime }}</span>
      </div>
      <div v-else class="detail-header-meta" />
      <div class="detail-header-actions">
        <template v-if="item">
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
          <el-tooltip content="放大查看" placement="bottom">
            <el-button class="header-action-btn" text @click="openZoomView">
              <i-ep-Full-Screen />
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

    <template v-if="item">
      <div class="detail-content">
        <div class="detail-text">
          <el-tooltip content="复制内容" placement="left">
            <el-button class="copy-overlay-btn" @click="copyItem(item)">
              <i-ep-Document-Copy />
            </el-button>
          </el-tooltip>
          <div class="detail-text-body">
            <HighlightedText
              :content="displayContent"
              :type="props.item?.type"
            />
            <div
              v-if="item.content.length > MAX_CONTENT_LENGTH"
              class="expand-button"
            >
              <el-button
                link
                type="primary"
                @click="showAllContent = !showAllContent"
              >
                {{ showAllContent ? "收起" : "展开" }}
              </el-button>
            </div>
          </div>
        </div>

        <div class="detail-meta-strip">
          <span>大小 {{ item.size }}</span>
          <span class="meta-sep">·</span>
          <span>字符 {{ charCount }}</span>
          <span class="meta-sep">·</span>
          <span>ID {{ item.id }}</span>
        </div>
      </div>

      <div class="detail-actions">
        <el-button type="primary" class="action-copy" @click="copyItem(item)">
          <i-ep-Document-Copy class="btn-icon" />
          <span>复制内容</span>
        </el-button>
        <el-button class="action-delete" @click="deleteItem(item)">
          <i-ep-Delete class="btn-icon" />
          <span>删除</span>
        </el-button>
      </div>
    </template>

    <div v-else class="detail-empty">
      <i-ep-Document-Copy class="empty-icon" />
      <div class="empty-title">暂无选中项</div>
      <div class="empty-desc">选择一个剪贴板项目查看详情</div>
    </div>

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
            <span class="zoom-meta-value">{{ charCount }}</span>
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

const formattedTime = computed(() => {
  return props.item ? formatTime(props.item.timestamp) : "";
});

const typeLabel = computed(() => {
  return props.item ? getTypeLabel(props.item.type) : "";
});

const charCount = computed(() => props.item?.content?.length || 0);

const MAX_CONTENT_LENGTH = 3000;
const displayContent = computed(() => {
  if (!props.item?.content) return "";
  const content = props.item.content;
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
  height: 52px;
  flex-shrink: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-light);
}

.detail-header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.type-chip {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  letter-spacing: 0.02em;

  &.type-text {
    background: var(--type-text-bg);
    color: var(--accent-primary);
  }
  &.type-url {
    background: var(--type-url-bg);
    color: var(--accent-secondary);
  }
  &.type-code {
    background: var(--type-code-bg);
    color: var(--accent-tertiary);
  }
  &.type-image {
    background: var(--type-image-bg);
    color: var(--accent-danger);
  }
}

.detail-time {
  font-size: 13px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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
  min-height: 0;
  padding: 12px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.detail-text {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-tertiary);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

.detail-text-body {
  flex: 1;
  min-height: 0;
  padding-top: 28px;
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
  opacity: 1;
  pointer-events: auto;
}

.detail-meta-strip {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 2px 2px 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.meta-sep {
  opacity: 0.7;
}

.detail-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border-light);
  background: var(--detail-bg);
}

.action-copy {
  flex: 1;
}

.action-delete {
  flex-shrink: 0;
}

.btn-icon {
  margin-right: 6px;
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

.expand-button {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
}

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
