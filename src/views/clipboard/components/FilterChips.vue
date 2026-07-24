<script setup lang="ts">
import { computed } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";
import { storeToRefs } from "pinia";

const clipboardStore = useClipboardStore();
const { activeFilter, typeCounts } = storeToRefs(clipboardStore);

interface FilterOption {
  key: "all" | "text" | "url" | "code" | "favorite";
  label: string;
}

const filters: FilterOption[] = [
  { key: "all", label: "全部" },
  { key: "text", label: "文本" },
  { key: "url", label: "链接" },
  { key: "code", label: "代码" },
  { key: "favorite", label: "收藏" },
];

const itemsWithCount = computed(() =>
  filters.map((f) => ({ ...f, count: typeCounts.value[f.key] ?? 0 })),
);

const selectFilter = (key: FilterOption["key"]) => {
  if (activeFilter.value === key) return;
  clipboardStore.activeFilter = key;
};
</script>

<template>
  <div class="filter-chips" role="tablist" aria-label="分类筛选">
    <button
      v-for="item in itemsWithCount"
      :key="item.key"
      type="button"
      role="tab"
      class="filter-chip"
      :class="{ active: activeFilter === item.key }"
      :aria-selected="activeFilter === item.key"
      @click="selectFilter(item.key)"
    >
      <span class="filter-label">{{ item.label }}</span>
      <span class="filter-count">{{ item.count }}</span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 12px 10px;
  background: var(--list-bg);
  border-bottom: 1px solid var(--border-light);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--bg-active);
    border-color: var(--border-medium);
    color: var(--accent-primary);
    font-weight: 500;
  }
}

.filter-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  font-weight: 500;
}

.filter-chip.active .filter-count {
  color: var(--accent-primary);
}
</style>
