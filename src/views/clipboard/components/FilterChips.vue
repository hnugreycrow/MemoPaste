<script setup lang="ts">
import { computed } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

const clipboardStore = useClipboardStore();
const { activeFilter, typeCounts } = storeToRefs(clipboardStore);

interface FilterOption {
  key: "all" | "image";
  label: string;
}

/** 只区分「全部 / 图片」；链接、代码等仍以徽章展示，不单独做筛选 */
const filters: FilterOption[] = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
];

const itemsWithCount = computed(() =>
  filters.map((f) => ({ ...f, count: typeCounts.value[f.key] ?? 0 })),
);

const selectFilter = (key: FilterOption["key"]) => {
  if (activeFilter.value === key) return;
  clipboardStore.activeFilter = key;
};

// 若仍停在已移除的筛选（文本/链接/代码），回退到全部
if (["text", "url", "code"].includes(activeFilter.value)) {
  clipboardStore.activeFilter = "all";
}
</script>

<template>
  <div class="filter-bar">
    <div class="filter-segment" role="tablist" aria-label="分类筛选">
      <button
        v-for="item in itemsWithCount"
        :key="item.key"
        type="button"
        role="tab"
        class="filter-segment-item"
        :class="{ active: activeFilter === item.key }"
        :aria-selected="activeFilter === item.key"
        @click="selectFilter(item.key)"
      >
        <span class="filter-label">{{ item.label }}</span>
        <span class="filter-count">{{ item.count }}</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.filter-bar {
  display: flex;
  align-items: center;
  padding: 0 14px 12px;
  background: var(--list-bg);
  border-bottom: 1px solid var(--border-light);
}

.filter-segment {
  display: flex;
  width: 100%;
  align-items: stretch;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-secondary);
}

.filter-segment-item {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    font-weight: 600;
  }
}

.filter-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  font-weight: 500;
}

.filter-segment-item.active .filter-count {
  color: var(--accent-primary);
}
</style>
