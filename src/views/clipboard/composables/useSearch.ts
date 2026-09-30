import { onScopeDispose, ref, watch } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";

export function useSearch() {
  const clipboardStore = useClipboardStore();
  const searchQuery = ref("");
  let searchDebounceTimer: number | null = null;

  // 输入防抖 300ms 后下推到 store，由 store 调用后端 SQL LIKE
  watch(searchQuery, (newValue) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      clipboardStore.setSearchKeyword(newValue);
      searchDebounceTimer = null;
    }, 300);
  });
  onScopeDispose(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  return {
    searchQuery,
  };
}
