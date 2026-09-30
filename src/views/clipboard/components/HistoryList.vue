<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import { useDateGroups } from "@/composables/useDateGroups";
import { HISTORY_ROW_HEIGHT, DATE_HEADER_HEIGHT } from "@/utils/dateGroups";
import type { ClipboardItem } from "@/utils/type";
import { useVirtualScroll, LIST_FOOTER_HEIGHT } from "../composables/useVirtualScroll";
import ClipboardListItem from "./ClipboardListItem.vue";

defineProps<{ selectedId?: number }>();
const emit = defineEmits<{ select: [item: ClipboardItem] }>();
const store = useClipboardStore();
const { clipboardData, activeFilter, isLoadingMore, searchKeyword } = storeToRefs(store);
const { rows } = useDateGroups(() => clipboardData.value);
const { contentListRef, virtualScroll, visibleItems, dateSections, handleScroll, scrollToItem } =
  useVirtualScroll(() => rows.value);

let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(() => handleScroll());
  if (contentListRef.value) observer.observe(contentListRef.value);
  handleScroll();
});
onUnmounted(() => observer?.disconnect());
watch([activeFilter, searchKeyword], () => {
  if (contentListRef.value) contentListRef.value.scrollTop = 0;
  handleScroll();
});
defineExpose({ scrollToItem });
</script>

<template>
  <div
    ref="contentListRef"
    class="content-list"
    :style="{
      '--row-height': `${HISTORY_ROW_HEIGHT}px`,
      '--header-height': `${DATE_HEADER_HEIGHT}px`,
      '--footer-height': `${LIST_FOOTER_HEIGHT}px`,
    }"
    aria-label="历史记录"
    @scroll="handleScroll"
  >
    <div v-if="clipboardData.length === 0" class="empty-state">
      <i-ep-Search v-if="searchKeyword" class="empty-icon" aria-hidden="true" />
      <i-ep-DocumentCopy v-else class="empty-icon" aria-hidden="true" />
      <div class="empty-title">
        {{ isLoadingMore ? "正在加载记录" : searchKeyword ? "没有找到匹配内容" : "暂无记录" }}
      </div>
      <div class="empty-desc">
        {{ searchKeyword ? "试试其他关键词" : "复制文本或截图，它们会出现在这里" }}
      </div>
    </div>
    <template v-else>
      <div :style="{ height: `${virtualScroll.totalHeight}px` }" aria-hidden="true" />
      <div
        class="virtual-scroll-content"
        :style="{ transform: `translateY(${virtualScroll.offset}px)` }"
      >
        <template v-for="row in visibleItems" :key="row.key">
          <div v-if="row.kind === 'header'" class="date-placeholder" aria-hidden="true" />
          <div v-else class="item-row">
            <ClipboardListItem
              :item="row.item"
              :selected="selectedId === row.item.id"
              @select="emit('select', $event)"
            />
          </div>
        </template>
      </div>
      <div
        v-for="section in dateSections"
        :key="section.key"
        class="date-section"
        :style="{ top: `${section.top}px`, height: `${section.height}px` }"
      >
        <div class="date-title" role="heading" aria-level="3">{{ section.label }}</div>
      </div>
      <div
        v-if="virtualScroll.complete"
        class="load-complete"
        :style="{ top: `${virtualScroll.contentHeight}px` }"
      >
        {{ searchKeyword ? "已显示全部匹配记录" : "已显示全部记录" }}
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.content-list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-anchor: none;
  background: var(--list-bg);
}

.virtual-scroll-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.date-placeholder,
.date-title {
  height: var(--header-height);
}

.date-section {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  pointer-events: none;
}

.date-title {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  padding: 0 18px;
  background: var(--list-bg);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.item-row {
  height: var(--row-height);
  padding: 2px 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px 20px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-icon {
  margin-bottom: 14px;
  font-size: 32px;
  color: var(--text-tertiary);
}

.empty-title {
  margin-bottom: 6px;
  font-size: 14px;
}

.empty-desc {
  font-size: 12px;
}

.load-complete {
  position: absolute;
  width: 100%;
  height: var(--footer-height);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 11px;
}
</style>
