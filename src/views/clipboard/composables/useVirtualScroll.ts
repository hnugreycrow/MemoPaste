import { ref, computed, watch } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";
import type { ClipboardRow } from "@/utils/dateGroups";

export function useVirtualScroll(rows: () => ClipboardRow[]) {
  const store = useClipboardStore();
  const contentListRef = ref<HTMLElement | null>(null);
  const startIndex = ref(0);
  const endIndex = ref(0);
  const offsets = computed(() => {
    const result = [0];
    for (const row of rows()) result.push(result[result.length - 1] + row.height);
    return result;
  });
  const headers = computed(() =>
    rows().flatMap((row, index) =>
      row.kind === "header" ? [{ key: row.key, label: row.label, top: offsets.value[index] }] : [],
    ),
  );
  // Keep each date section mounted independently of virtualized content rows.
  // Native sticky positioning uses section bounds without waiting for scroll events.
  const dateSections = computed(() =>
    headers.value.map((header, index) => ({
      ...header,
      height: (headers.value[index + 1]?.top ?? contentHeight.value) - header.top,
    })),
  );
  const contentHeight = computed(() => offsets.value[offsets.value.length - 1]);
  const complete = computed(
    () =>
      !store.isLoadingMore &&
      store.clipboardData.length > 0 &&
      store.clipboardData.length >= store.totalItems,
  );
  const virtualScroll = computed(() => ({
    totalHeight: contentHeight.value + (complete.value ? 48 : 0),
    offset: offsets.value[startIndex.value] ?? 0,
    contentHeight: contentHeight.value,
    complete: complete.value,
  }));
  const visibleItems = computed(() => rows().slice(startIndex.value, endIndex.value));
  let lastPrefetchKey = "";
  const handleScroll = (event?: Event) => {
    if (event?.type === "scroll") lastPrefetchKey = "";
    const el = contentListRef.value;
    if (!el) return;
    const maxScroll = Math.max(0, virtualScroll.value.totalHeight - el.clientHeight);
    if (el.scrollTop > maxScroll) el.scrollTop = maxScroll;
    const top = Math.max(0, el.scrollTop - 144);
    const bottom = el.scrollTop + el.clientHeight + 144;
    const findRow = (position: number) => {
      let low = 0;
      let high = rows().length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (offsets.value[mid + 1] <= position) low = mid + 1;
        else high = mid;
      }
      return low;
    };
    startIndex.value = findRow(top);
    endIndex.value = Math.min(rows().length, findRow(bottom) + 1);
    const prefetchKey = `${store.clipboardData.length}:${store.totalItems}:${rows()[rows().length - 1]?.key}`;
    if (
      prefetchKey !== lastPrefetchKey &&
      el.scrollTop + el.clientHeight >= contentHeight.value - 216 &&
      store.clipboardData.length < store.totalItems &&
      !store.isLoadingMore
    ) {
      // A failed/empty page must not trigger an automatic retry loop.
      lastPrefetchKey = prefetchKey;
      void store.loadMoreData();
    }
  };
  watch([rows, () => store.isLoadingMore, () => store.totalItems], () => handleScroll(), {
    deep: true,
    flush: "post",
  });
  return { contentListRef, virtualScroll, visibleItems, dateSections, handleScroll };
}
