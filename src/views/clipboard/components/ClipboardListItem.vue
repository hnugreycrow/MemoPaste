<script setup lang="ts">
import { computed } from "vue";
import type { ClipboardItem } from "@/utils/type";
import { clipimgUrl, formatTime, formatTimeOfDay, getTypeLabel } from "@/utils/utils";

const props = withDefaults(
  defineProps<{
    item: ClipboardItem;
    selected: boolean;
    favorites?: boolean;
  }>(),
  { favorites: false },
);
const itemTitle = computed(
  () => props.item.content.split(/\r?\n/).find((line) => line.trim()) || "空白内容",
);

const emit = defineEmits<{
  select: [item: ClipboardItem];
  favorite: [item: ClipboardItem];
}>();
</script>

<template>
  <article class="content-item" :class="{ active: selected, 'favorite-item': favorites }">
    <button
      type="button"
      class="clipboard-item-select"
      :aria-pressed="selected"
      :title="item.content"
      @click="emit('select', item)"
      @focus="emit('select', item)"
    >
      <span class="item-icon" :class="`type-${item.type}`" aria-hidden="true">
        <img
          v-if="item.type === 'image' && item.thumb_path"
          :src="clipimgUrl(item.thumb_path)"
          alt=""
          draggable="false"
        />
        <i-ep-Picture v-else-if="item.type === 'image'" />
        <i-ep-Link v-else-if="item.type === 'url'" />
        <svg v-else-if="item.type === 'code'" class="code-icon" viewBox="0 0 24 24" fill="none">
          <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
        </svg>
        <i-ep-Document v-else />
      </span>
      <span class="item-content">
        <span class="item-title">{{ itemTitle }}</span>
        <span class="item-meta" :title="formatTime(item.timestamp)">
          <span>{{ getTypeLabel(item.type) }}</span>
          <span class="meta-dot" aria-hidden="true">·</span>
          <span v-if="favorites" class="item-date">
            {{ formatTime(item.timestamp) }}
          </span>
          <span v-else>{{ formatTimeOfDay(item.timestamp) }}</span>
        </span>
      </span>
    </button>
    <button
      v-if="favorites"
      type="button"
      class="favorite-action"
      aria-label="取消收藏"
      title="取消收藏"
      @click="emit('favorite', item)"
    >
      <i-ep-StarFilled aria-hidden="true" />
    </button>
    <span v-else-if="item.is_favorite" class="favorite-indicator" title="已收藏">
      <i-ep-StarFilled aria-hidden="true" />
      <span class="sr-only">已收藏</span>
    </span>
  </article>
</template>

<style scoped lang="scss">
.content-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 60px;
  margin: 0 8px;
  border-radius: 8px;
  background: transparent;
  transition: background 0.15s ease;

  &:hover {
    background: var(--bg-hover);
  }

  &:has(> .clipboard-item-select:focus-visible) {
    outline: 1px solid var(--accent-primary);
    outline-offset: -1px;
  }

  &.active {
    background: var(--bg-active);

    &::before {
      content: "";
      position: absolute;
      top: 12px;
      bottom: 12px;
      left: 0;
      width: 3px;
      border-radius: 3px;
      background: var(--accent-primary);
      pointer-events: none;
    }
  }

  &.favorite-item {
    height: 68px;
    margin: 0 12px;
  }
}

.clipboard-item-select {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: inherit;
  color: var(--text-primary);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 7px;
  overflow: hidden;

  > svg {
    width: 18px;
    height: 18px;
  }

  > .code-icon path {
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.6;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.item-date {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.meta-dot {
  color: var(--text-tertiary);
}

.favorite-action,
.favorite-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  color: var(--accent-quaternary);
  font-size: 13px;
}

.favorite-action {
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: var(--favorite-bg);
  }

  &:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: 1px;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .content-item {
    transition: none;
  }
}
</style>
