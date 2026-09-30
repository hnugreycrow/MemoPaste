<template>
  <section class="detail-panel" aria-label="内容预览">
    <div class="detail-header">
      <div v-if="item" class="detail-header-meta">
        <span class="type-chip" :class="`type-${item.type}`">{{ typeLabel }}</span>
        <span class="detail-time" :title="formattedTime">{{ formattedTime }}</span>
      </div>
      <div v-else class="detail-header-meta"><span class="preview-label">内容预览</span></div>
      <div v-if="item" class="detail-header-actions">
        <el-button
          class="favorite-btn"
          :class="{ 'is-favorite': item.is_favorite }"
          :aria-label="item.is_favorite ? '取消收藏' : '收藏'"
          :aria-pressed="!!item.is_favorite"
          :title="item.is_favorite ? '取消收藏' : '收藏'"
          text
          @click="toggleFavorite(item)"
        >
          <i-ep-StarFilled v-if="item.is_favorite" aria-hidden="true" />
          <i-ep-Star v-else aria-hidden="true" />
          <span>{{ item.is_favorite ? "已收藏" : "收藏" }}</span>
        </el-button>
        <el-dropdown trigger="click" placement="bottom-end">
          <el-button class="header-action-btn" text aria-label="更多记录操作" title="更多操作">
            <i-ep-MoreFilled />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="deleteItem(item)">
                <i-ep-Delete class="el-icon--left" />删除记录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <template v-if="item">
      <div class="detail-content">
        <div class="detail-reading" :class="{ 'is-image': isImage }">
          <template v-if="isImage">
            <div class="detail-image-wrap">
              <el-image
                v-if="imageSrc"
                class="detail-image"
                :src="imageSrc"
                :preview-src-list="[imageSrc]"
                preview-teleported
                :scale="0.7"
                fit="contain"
                alt="剪贴板图片"
              >
                <template #error><div class="detail-image-fallback">图片文件不可用</div></template>
              </el-image>
              <div v-else class="detail-image-fallback">图片文件不可用</div>
            </div>
          </template>
          <template v-else>
            <HighlightedText :content="displayContent" :type="item.type" />
            <div v-if="item.content.length > MAX_CONTENT_LENGTH" class="expand-button">
              <el-button link type="primary" @click="showAllContent = !showAllContent">
                {{ showAllContent ? "收起" : "展开全部内容" }}
              </el-button>
            </div>
          </template>
        </div>
      </div>
      <div class="detail-actions">
        <div class="detail-meta-strip">
          <span>大小 {{ item.size }}</span>
          <template v-if="!isImage"
            ><span class="meta-sep" aria-hidden="true">·</span
            ><span>{{ charCount }} 字符</span></template
          >
        </div>
        <span class="keyboard-hint"><kbd>↑ ↓</kbd><span>切换</span></span>
        <el-button type="primary" class="action-copy" @click="copyItem(item)">
          <i-ep-Document-Copy class="btn-icon" aria-hidden="true" />
          <span>{{ isImage ? "复制图片" : "复制内容" }}</span>
          <kbd class="copy-shortcut">Enter</kbd>
        </el-button>
      </div>
    </template>

    <div v-else class="detail-empty">
      <img :src="`${baseUrl}mascot.png`" class="mascot" alt="MemoPaste" />
      <div class="empty-title">选择一条记录</div>
      <div class="empty-desc">在这里预览并复制内容</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import HighlightedText from "./HighlightedText.vue";
import { ClipboardItem } from "@/utils/type";
import { formatTime, getTypeLabel, clipimgUrl } from "@/utils/utils";

type Item = ClipboardItem;
const baseUrl = import.meta.env.BASE_URL;

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
.detail-panel {
  container: clipboard-detail / inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 52px;
  padding: 0 18px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
}

.detail-header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.type-chip {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  line-height: 1.6;
}

.detail-time {
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.preview-label {
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.favorite-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  min-height: 30px;
  padding: 0 7px;
  color: var(--text-secondary);
  font-size: 11px;

  &.is-favorite {
    color: var(--accent-quaternary);
  }

  :deep(svg) {
    width: 14px;
    height: 14px;
  }

  :deep(> span) {
    gap: 5px;
  }
}

.header-action-btn {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.detail-content {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.detail-reading {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.75;

  &.is-image {
    display: flex;
    overflow: hidden;
  }

  :deep(.code-block) {
    padding: 14px 16px;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--list-bg);
    font-size: 13px;
    line-height: 1.75;
  }
}

.detail-image-wrap {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.detail-image {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border-radius: 7px;

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
  color: var(--text-secondary);
  font-size: 13px;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  min-height: 62px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-light);
}

.detail-meta-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  flex: 1;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.meta-sep {
  color: var(--text-tertiary);
}

.keyboard-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 10px;
  white-space: nowrap;
}

kbd {
  padding: 1px 4px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  line-height: 1.4;
}

.action-copy {
  flex-shrink: 0;
  height: 34px;
  min-width: 138px;
  margin-left: 0;
  padding: 0 12px;
  font-size: 12px;

  :deep(> span) {
    gap: 6px;
  }
}

.copy-shortcut {
  margin-left: 4px;
  border-color: color-mix(in srgb, var(--accent-on-primary) 35%, transparent);
  color: var(--accent-on-primary);
  font-size: 9px;
}

.mascot {
  width: 128px;
  max-width: 100%;
  margin-bottom: 16px;
  object-fit: contain;
  image-rendering: pixelated;
}

.detail-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-title {
  margin-bottom: 6px;
  font-size: 14px;
}

.empty-desc {
  font-size: 12px;
}

.expand-button {
  margin-top: 16px;
}

@container clipboard-detail (max-width: 440px) {
  .keyboard-hint {
    display: none;
  }

  .detail-actions {
    gap: 10px;
    padding-right: 16px;
    padding-left: 16px;
  }

  .detail-meta-strip {
    font-size: 10px;
  }

  .action-copy {
    min-width: 130px;
    padding: 0 10px;
  }
}
</style>
