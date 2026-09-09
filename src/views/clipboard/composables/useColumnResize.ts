import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from "vue";

export function useColumnResize() {
  const columnsRef = ref<HTMLElement | null>(null);
  const ratio = ref(0.44);
  const availableWidth = ref(0);
  const isResizing = ref(false);
  const minWidth = computed(() => Math.min(320, availableWidth.value / 2));
  const maxWidth = computed(() => availableWidth.value - minWidth.value);
  const listWidth = computed(() =>
    Math.max(minWidth.value, Math.min(maxWidth.value, availableWidth.value * ratio.value)),
  );
  let observer: ResizeObserver | undefined;
  let pointerId: number | undefined;
  let handle: HTMLElement | undefined;
  let startX = 0;
  let startWidth = 0;
  let edited = false;

  const measure = () => {
    if (columnsRef.value?.clientWidth) {
      availableWidth.value = Math.max(0, columnsRef.value.clientWidth - 6);
    }
  };
  const save = async () => {
    try {
      if (!(await window.config.set("clipboardListRatio", ratio.value))) {
        throw new Error("Config rejected");
      }
    } catch (error) {
      console.error("Failed to save column ratio", error);
      ElMessage({ message: "栏宽保存失败，请重新调整后重试", type: "error" });
    }
  };
  const setWidth = (width: number) => {
    if (!availableWidth.value) return;
    edited = true;
    ratio.value = Math.max(minWidth.value, Math.min(maxWidth.value, width)) / availableWidth.value;
  };
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0 || isResizing.value) return;
    measure();
    event.preventDefault();
    handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = listWidth.value;
    isResizing.value = true;
  };
  const moveResize = (event: PointerEvent) => {
    if (isResizing.value && event.pointerId === pointerId) {
      setWidth(startWidth + event.clientX - startX);
    }
  };
  const finishResize = () => {
    if (!isResizing.value) return;
    isResizing.value = false;
    if (pointerId !== undefined && handle?.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
    pointerId = undefined;
    handle = undefined;
    void save();
  };

  onMounted(async () => {
    measure();
    observer = new ResizeObserver(measure);
    if (columnsRef.value) observer.observe(columnsRef.value);
    window.addEventListener("blur", finishResize);
    try {
      const saved = await window.config.get<number>("clipboardListRatio");
      if (
        !edited &&
        typeof saved === "number" &&
        Number.isFinite(saved) &&
        saved > 0 &&
        saved < 1
      ) {
        ratio.value = saved;
      }
    } catch (error) {
      console.error("Failed to load column ratio", error);
    }
  });
  onActivated(measure);
  onDeactivated(finishResize);
  onUnmounted(() => {
    finishResize();
    observer?.disconnect();
    window.removeEventListener("blur", finishResize);
  });

  return {
    columnsRef,
    listWidth,
    minWidth,
    maxWidth,
    isResizing,
    startResize,
    moveResize,
    finishResize,
  };
}
