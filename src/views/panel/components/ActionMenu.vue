<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { ClipboardItem } from "@/utils/type";

export type CardActionName =
  | "singleLine"
  | "openUrl"
  | "saveImage"
  | "copy"
  | "preview"
  | "editAlias"
  | "favorite"
  | "delete";

type MenuEntry =
  | {
      kind: "item";
      action: CardActionName;
      label: string;
      shortcut?: string;
      accent?: boolean;
      danger?: boolean;
    }
  | { kind: "divider" };

const props = defineProps<{
  item: ClipboardItem;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  close: [];
  select: [action: CardActionName];
}>();

const entries = computed<MenuEntry[]>(() => {
  const list: MenuEntry[] = [];
  if (props.item.type === "url") {
    list.push({
      kind: "item",
      action: "openUrl",
      label: "在浏览器打开",
      shortcut: "Shift+↵",
      accent: true,
    });
  } else if (props.item.type === "image") {
    list.push({
      kind: "item",
      action: "saveImage",
      label: "另存为 PNG…",
      shortcut: "Shift+↵",
      accent: true,
    });
  } else {
    list.push({
      kind: "item",
      action: "singleLine",
      label: "去换行粘贴",
      shortcut: "Shift+↵",
      accent: true,
    });
  }

  list.push(
    { kind: "item", action: "copy", label: "仅复制" },
    {
      kind: "item",
      action: "preview",
      label: props.item.type === "image" ? "预览大图" : "预览全文",
      shortcut: "Space",
    },
    { kind: "item", action: "editAlias", label: "编辑备注", shortcut: "F2" },
    {
      kind: "item",
      action: "favorite",
      label: props.item.is_favorite ? "取消常用收藏" : "加入常用收藏",
    },
    { kind: "divider" },
    {
      kind: "item",
      action: "delete",
      label: "删除记录",
      shortcut: "Shift+Del",
      danger: true,
    },
  );
  return list;
});

const selectableItems = computed(() =>
  entries.value.filter((e): e is Extract<MenuEntry, { kind: "item" }> => e.kind === "item"),
);

const activeIndex = ref(0);

const menuStyle = computed(() => {
  const menuW = 196;
  const menuH = 224;
  const maxX = Math.max(8, 380 - menuW - 8);
  const maxY = Math.max(8, 520 - menuH - 8);
  return {
    left: `${Math.max(8, Math.min(props.x, maxX))}px`,
    top: `${Math.max(8, Math.min(props.y, maxY))}px`,
  };
});

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("close");
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    activeIndex.value = (activeIndex.value + 1) % selectableItems.value.length;
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    activeIndex.value =
      (activeIndex.value - 1 + selectableItems.value.length) % selectableItems.value.length;
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    const target = selectableItems.value[activeIndex.value];
    if (target) emit("select", target.action);
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown, true);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown, true);
});
</script>

<template>
  <div class="menu-backdrop" @click="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      class="action-menu"
      :style="menuStyle"
      role="menu"
      aria-label="条目更多操作"
      @click.stop
    >
      <template v-for="(entry, idx) in entries" :key="idx">
        <div v-if="entry.kind === 'divider'" class="menu-divider" role="separator" />
        <button
          v-else
          type="button"
          class="menu-item"
          :class="{
            active: selectableItems[activeIndex]?.action === entry.action,
            accent: entry.accent,
            danger: entry.danger,
          }"
          role="menuitem"
          @mouseenter="activeIndex = selectableItems.findIndex((i) => i.action === entry.action)"
          @click="emit('select', entry.action)"
        >
          <span class="menu-label">{{ entry.label }}</span>
          <span v-if="entry.shortcut" class="menu-shortcut">{{ entry.shortcut }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
}

.action-menu {
  position: absolute;
  width: 196px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--border-medium);
  background: var(--bg-tertiary);
  box-shadow:
    var(--top-highlight),
    0 10px 24px rgba(0, 0, 0, 0.18);
  animation: menu-pop 0.14s var(--ease-out);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;

  &.active,
  &:hover {
    background: var(--bg-hover);
  }

  &.accent {
    color: var(--accent-primary);
    font-weight: 500;

    &.active,
    &:hover {
      background: var(--accent-soft);
    }
  }

  &.danger {
    color: var(--accent-danger);

    &.active,
    &:hover {
      background: color-mix(in srgb, var(--accent-danger) 12%, transparent);
    }
  }
}

.menu-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-shortcut {
  flex-shrink: 0;
  font-family: "Cascadia Mono", Consolas, ui-monospace, monospace;
  font-size: 11px;
  color: var(--text-tertiary);
}

.menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-light);
}

@keyframes menu-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-3px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .action-menu {
    animation: none;
  }
}
</style>
