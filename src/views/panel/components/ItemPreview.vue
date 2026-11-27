<script setup lang="ts">
import { computed } from "vue";
import type { ClipboardItem } from "@/utils/type";
import { clipimgUrl, formatTime, getTypeLabel } from "@/utils/utils";

const props = defineProps<{
  item: ClipboardItem;
  loading?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  paste: [item: ClipboardItem];
  copy: [item: ClipboardItem];
  favorite: [item: ClipboardItem, event: Event];
  delete: [item: ClipboardItem, event: Event];
}>();

const isImage = computed(() => props.item.type === "image");
const imageSrc = computed(() =>
  isImage.value ? clipimgUrl(props.item.file_path || props.item.thumb_path) : "",
);
const metaLabel = computed(() => {
  if (isImage.value) return props.item.size || props.item.content;
  const len = props.item.content?.length ?? 0;
  return `${len} 字符`;
});
</script>

<template>
  <section class="preview-view" aria-label="记录预览">
    <header class="sub-header">
      <button type="button" class="back-btn" title="返回列表 (Esc)" @click="emit('back')">
        <i-ep-ArrowLeft />
        <span>返回</span>
      </button>

      <div class="sub-meta">
        <span class="type-pill" :class="`type-${item.type}`">{{ getTypeLabel(item.type) }}</span>
        <span class="time-text">{{ formatTime(item.timestamp) }}</span>
      </div>

      <div class="sub-actions">
        <button
          type="button"
          class="icon-btn fav"
          :class="{ active: item.is_favorite }"
          :title="item.is_favorite ? '取消常用收藏' : '加入常用收藏'"
          :aria-label="item.is_favorite ? '取消常用收藏' : '加入常用收藏'"
          @click="emit('favorite', item, $event)"
        >
          <i-ep-StarFilled v-if="item.is_favorite" />
          <i-ep-Star v-else />
        </button>
        <button
          type="button"
          class="icon-btn danger"
          title="删除记录"
          aria-label="删除记录"
          @click="emit('delete', item, $event)"
        >
          <i-ep-Delete />
        </button>
      </div>
    </header>

    <div v-if="item.alias" class="preview-alias">
      <i-ep-StarFilled class="alias-star" />
      <span class="alias-text">{{ item.alias }}</span>
    </div>

    <div class="preview-body" :class="{ 'is-image': isImage }">
      <div v-if="loading" class="preview-status">加载全文中…</div>
      <div v-else-if="isImage" class="preview-image-wrap">
        <img v-if="imageSrc" :src="imageSrc" class="preview-img" alt="剪贴板图片预览" />
        <div v-else class="preview-status">图片文件不可用</div>
      </div>
      <div v-else class="preview-card">
        <pre class="preview-text" :class="{ 'is-code': item.type === 'code' }">{{
          item.content
        }}</pre>
      </div>
    </div>

    <footer class="preview-footer">
      <span class="footer-meta">{{ metaLabel }}</span>
      <div class="footer-btns">
        <button type="button" class="btn secondary" @click="emit('copy', item)">仅复制</button>
        <button type="button" class="btn primary" @click="emit('paste', item)">粘贴 (Enter)</button>
      </div>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.preview-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.sub-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-light);
  -webkit-app-region: drag;
}

.back-btn,
.icon-btn {
  -webkit-app-region: no-drag;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px 0 6px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background: var(--bg-hover);
  }
}

.sub-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-pill {
  padding: 1.5px 6px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  flex-shrink: 0;
}

.time-text {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.fav.active,
  &.fav:hover {
    color: var(--favorite-border);
  }

  &.danger:hover {
    background: color-mix(in srgb, var(--accent-danger) 12%, transparent);
    color: var(--accent-danger);
  }
}

.preview-alias {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 12px 0;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--favorite-bg);
  color: var(--favorite-text);
  font-size: 12px;
  font-weight: 600;
}

.alias-star {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--favorite-border);
}

.alias-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 12px;

  &.is-image {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.preview-card {
  min-height: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-tertiary);
}

.preview-status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.preview-image-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 10px;
  border: 1px solid var(--thumb-ring, var(--border-light));
  object-fit: contain;
  display: block;
}

.preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-primary);
  user-select: text;

  &.is-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.footer-meta {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.footer-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;

  &.secondary {
    background: var(--bg-tertiary);
    border-color: var(--border-light);
    color: var(--text-primary);

    &:hover {
      background: var(--bg-hover);
      border-color: var(--border-medium);
    }
  }

  &.primary {
    background: var(--accent-primary);
    color: var(--accent-on-primary, #fff);

    &:hover {
      background: var(--accent-primary-hover);
    }
  }
}
</style>
