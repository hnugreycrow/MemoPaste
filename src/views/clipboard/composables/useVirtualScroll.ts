import { ref, computed, watch } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

const clipboardStore = useClipboardStore(); // 获取仓库实例
const { isLoadingMore } = storeToRefs(clipboardStore); // 从仓库获取方法

export function useVirtualScroll(items: () => any[]) {
  const contentListRef = ref<HTMLElement | null>(null);

  // 虚拟滚动相关状态
  const virtualScroll = ref({
    startIndex: 0, // 可见区域的起始索引
    endIndex: 0, // 可见区域的结束索引
    visibleCount: 0, // 可见项目数量
    itemHeight: 60, // 每个项目的大概高度（根据你的CSS调整）
    containerHeight: 0, // 容器高度
    totalHeight: 0, // 所有项目的总高度
  });

  // 计算可见项目
  const visibleItems = computed(() => {
    return items().slice(virtualScroll.value.startIndex, virtualScroll.value.endIndex + 1);
  });

  // 处理滚动
  const handleScroll = () => {
    if (!contentListRef.value) return;

    const { scrollTop, clientHeight } = contentListRef.value;
    virtualScroll.value.containerHeight = clientHeight;

    // 计算可见数量
    const visibleCount = Math.ceil(clientHeight / virtualScroll.value.itemHeight) + 4;
    virtualScroll.value.visibleCount = visibleCount;

    // 计算索引范围
    const startIndex = Math.floor(scrollTop / virtualScroll.value.itemHeight);
    virtualScroll.value.startIndex = Math.max(0, startIndex - 1);

    const endIndex = Math.min(items().length - 1, virtualScroll.value.startIndex + visibleCount);
    virtualScroll.value.endIndex = endIndex;

    // 更新总高度
    virtualScroll.value.totalHeight = items().length * virtualScroll.value.itemHeight;

    // 3. 关键修改：基于索引判断是否需要加载更多
    const buffer = 3;
    const hasMoreData = items().length < clipboardStore.totalItems; // 假设你有总数据量的变量
    const isNearBottom = endIndex >= items().length - 1 - buffer;

    if (isNearBottom && hasMoreData && !isLoadingMore.value) {
      clipboardStore.loadMoreData(); // 触发加载更多
    }
  };

  // 监听数据变化
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
