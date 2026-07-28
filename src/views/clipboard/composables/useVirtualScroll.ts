import { ref, computed, watch } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

const clipboardStore = useClipboardStore();
const { isLoadingMore } = storeToRefs(clipboardStore);

export function useVirtualScroll(items: () => any[]) {
  const contentListRef = ref<HTMLElement | null>(null);

  const virtualScroll = ref({
    startIndex: 0,
    endIndex: 0,
    visibleCount: 0,
    // 必须与列表行 CSS 高度一致；估错会导致跳动或提前/延后触底加载
    itemHeight: 60,
    containerHeight: 0,
    totalHeight: 0,
  });

  const visibleItems = computed(() => {
    return items().slice(virtualScroll.value.startIndex, virtualScroll.value.endIndex + 1);
  });

  const handleScroll = () => {
    if (!contentListRef.value) return;

    const { scrollTop, clientHeight } = contentListRef.value;
    virtualScroll.value.containerHeight = clientHeight;

    // +4：上下多渲几行，快速滑时少露白
    const visibleCount = Math.ceil(clientHeight / virtualScroll.value.itemHeight) + 4;
    virtualScroll.value.visibleCount = visibleCount;

    const startIndex = Math.floor(scrollTop / virtualScroll.value.itemHeight);
    virtualScroll.value.startIndex = Math.max(0, startIndex - 1);

    const endIndex = Math.min(items().length - 1, virtualScroll.value.startIndex + visibleCount);
    virtualScroll.value.endIndex = endIndex;

    virtualScroll.value.totalHeight = items().length * virtualScroll.value.itemHeight;

    // 距末尾 3 行就预取下一页，避免滚到底才等 IPC
    const buffer = 3;
    const hasMoreData = items().length < clipboardStore.totalItems;
    const isNearBottom = endIndex >= items().length - 1 - buffer;

    if (isNearBottom && hasMoreData && !isLoadingMore.value) {
      clipboardStore.loadMoreData();
    }
  };

  watch(
    items,
    () => {
      handleScroll();
    },
    { deep: true },
  );

  return {
    contentListRef,
    virtualScroll,
    visibleItems,
    handleScroll,
  };
}
