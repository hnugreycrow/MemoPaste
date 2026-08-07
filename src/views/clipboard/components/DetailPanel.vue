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
          <el-tooltip :content="item.is_favorite ? '取消收藏' : '收藏'" placement="bottom">
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

    <template v-if="item">
      <div class="detail-content">
        <div class="detail-text" :class="{ 'is-image': isImage }">
          <el-tooltip :content="isImage ? '复制图片' : '复制内容'" placement="left">
            <el-button class="copy-overlay-btn" @click="copyItem(item)">
              <i-ep-Document-Copy />
            </el-button>
          </el-tooltip>
          <div class="detail-text-body">
            <template v-if="isImage">
              <div class="detail-image-wrap">
                <el-image
                  v-if="imageSrc"
                  class="detail-image"
                  :src="imageSrc"
                  :preview-src-list="[imageSrc]"
                  fit="contain"
                  alt="剪贴板图片"
                >
                  <template #error>
                    <div class="detail-image-fallback">图片文件不可用</div>
                  </template>
                </el-image>
                <div v-else class="detail-image-fallback">图片文件不可用</div>
              </div>
            </template>
            <template v-else>
              <HighlightedText :content="displayContent" :type="props.item?.type" />
              <div v-if="item.content.length > MAX_CONTENT_LENGTH" class="expand-button">
                <el-button link type="primary" @click="showAllContent = !showAllContent">
                  {{ showAllContent ? "收起" : "展开" }}
                </el-button>
              </div>
            </template>
          </div>
        </div>

        <div class="detail-meta-strip">
          <span>大小 {{ item.size }}</span>
          <template v-if="!isImage">
            <span class="meta-sep">·</span>
            <span>字符 {{ charCount }}</span>
          </template>
          <span class="meta-sep">·</span>
          <span>ID {{ item.id }}</span>
        </div>
      </div>

      <div class="detail-actions">
        <el-button type="primary" class="action-copy" @click="copyItem(item)">
          <i-ep-Document-Copy class="btn-icon" />
          <span>{{ isImage ? "复制图片" : "复制内容" }}</span>
        </el-button>
        <el-button class="action-delete" @click="deleteItem(item)">
          <i-ep-Delete class="btn-icon" />
          <span>删除</span>
        </el-button>
      </div>
    </template>

    <div v-else class="detail-empty">
      <img src="/mascot.png" class="mascot" alt="MemoPaste" />
      <div class="empty-title">暂无选中项</div>
      <div class="empty-desc">选择一个剪贴板项目查看详情</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import HighlightedText from "./HighlightedText.vue";
import { ClipboardItem } from "@/utils/type";
import { formatTime, getTypeLabel, clipimgUrl } from "@/utils/utils";

type Item = ClipboardItem;

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

const isImage = computed(() => props.item?.type === "image");

const imageSrc = computed(() => {
  if (!props.item || props.item.type !== "image") return "";
  return clipimgUrl(props.item.file_path || props.item.thumb_path);
});

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
</script>

<style lang="scss" scoped>
.mascot {
  width: 168px;
  max-width: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.detail-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--detail-bg);
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

  &.is-image {
    white-space: normal;
    word-break: normal;
  }
}

.detail-text-body {
  flex: 1;
  min-height: 0;
  padding-top: 28px;
  overflow: auto;
}

.detail-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  height: 100%;
}

.detail-image {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border-radius: 6px;

  :deep(.el-image__inner) {
    cursor: zoom-in;
  }
}

.detail-image-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
  color: var(--text-tertiary);
  font-size: 13px;
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
  gap: 5px;
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
</style>
