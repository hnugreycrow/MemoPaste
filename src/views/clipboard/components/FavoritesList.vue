<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import type { ClipboardItem } from "@/utils/type";
import { HISTORY_ROW_HEIGHT, type ClipboardRow } from "@/utils/dateGroups";
import { useVirtualScroll, LIST_FOOTER_HEIGHT } from "../composables/useVirtualScroll";
import ClipboardListItem from "./ClipboardListItem.vue";

defineProps<{ selectedId?: number }>();
const emit = defineEmits<{
  select: [item: ClipboardItem];
  favorite: [item: ClipboardItem];
}>();
const store = useClipboardStore();
const { clipboardData, searchKeyword, isLoadingMore } = storeToRefs(store);
const favoriteItems = computed(() => clipboardData.value.filter((item) => item.is_favorite));
const rows = computed<ClipboardRow[]>(() =>
  favoriteItems.value.map((item, index) => ({
    kind: "item",
    key: `favorite-${item.id}`,
    item,
    index,
    label: "收藏",
    height: HISTORY_ROW_HEIGHT,
  })),
);
const { contentListRef, virtualScroll, visibleItems, handleScroll, scrollToItem } =
  useVirtualScroll(() => rows.value);
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(() => handleScroll());
  if (contentListRef.value) observer.observe(contentListRef.value);
  handleScroll();
});
onUnmounted(() => observer?.disconnect());
watch(searchKeyword, () => {
  if (contentListRef.value) contentListRef.value.scrollTop = 0;
  handleScroll();
});
defineExpose({ scrollToItem });
</script>

<template>
  <section class="favorites-list" aria-label="收藏列表">
    <div class="favorites-banner">
      <i-ep-StarFilled class="banner-icon" aria-hidden="true" />
      <span>已收藏的内容会长期保留</span>
    </div>
    <div
      ref="contentListRef"
      class="favorites-scroll"
      :style="{
        '--footer-height': `${LIST_FOOTER_HEIGHT}px`,
        '--row-height': `${HISTORY_ROW_HEIGHT}px`,
      }"
      @scroll="handleScroll"
    >
      <div v-if="favoriteItems.length === 0" class="empty-state">
        <i-ep-Star class="empty-icon" aria-hidden="true" />
        <div class="empty-title">
          {{ isLoadingMore ? "正在加载收藏" : searchKeyword ? "没有找到匹配收藏" : "还没有收藏" }}
        </div>
        <div class="empty-desc">
          {{ searchKeyword ? "试试其他关键词" : "在历史里点星标，常用内容就会留在这里" }}
        </div>
      </div>
      <template v-else>
        <div :style="{ height: `${virtualScroll.totalHeight}px` }" aria-hidden="true" />
        <div
          class="virtual-scroll-content"
          :style="{ transform: `translateY(${virtualScroll.offset}px)` }"
        >
          <template v-for="row in visibleItems" :key="row.key">
            <div v-if="row.kind === 'item'" class="favorite-row">
              <ClipboardListItem
                :item="row.item"
                :selected="selectedId === row.item.id"
                favorites
                @select="emit('select', $event)"
                @favorite="emit('favorite', $event)"
              />
            </div>
          </template>
        </div>
        <div
          v-if="virtualScroll.complete"
          class="load-complete"
          :style="{ top: `${virtualScroll.contentHeight}px` }"
        >
          已显示全部收藏
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.favorites-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  background: var(--list-bg);
}

.favorites-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin: 2px 16px 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--favorite-bg);
  color: var(--text-secondary);
  font-size: 11px;
}

.banner-icon {
  color: var(--accent-quaternary);
  flex-shrink: 0;
  font-size: 13px;
}

.favorites-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-anchor: none;
}

.virtual-scroll-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.favorite-row {
  height: var(--row-height);
  padding: 4px 0;
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
  color: var(--accent-quaternary);
  font-size: 32px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--footer-height);
  color: var(--text-tertiary);
  font-size: 11px;
}
</style>
