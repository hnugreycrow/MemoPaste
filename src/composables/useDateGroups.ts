import { computed, onActivated, onMounted, onUnmounted, ref } from "vue";
import type { ClipboardItem } from "@/utils/type";
import { groupClipboardRows } from "@/utils/dateGroups";

export function useDateGroups(items: () => ClipboardItem[]) {
  const now = ref(new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refreshDate = () => {
    clearTimeout(timer);
    now.value = new Date();
    const next = new Date(now.value);
    next.setHours(24, 0, 0, 0);
    timer = setTimeout(refreshDate, next.getTime() - now.value.getTime());
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") refreshDate();
  };
  onMounted(() => {
    refreshDate();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshDate);
  });
  onActivated(refreshDate);
  onUnmounted(() => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", refreshDate);
  });
  return { rows: computed(() => groupClipboardRows(items(), now.value)), refreshDate };
}
