<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import { themeService, type ThemeType } from "@/utils/theme";

const route = useRoute();
const router = useRouter();
const clipboardStore = useClipboardStore();
const { activeFilter, typeCounts } = storeToRefs(clipboardStore);
const activeModule = computed(() => {
  if (route.path.includes("/settings")) return "settings";
  if (route.path.includes("/clipboard")) {
    return activeFilter.value === "favorite" ? "favorite" : "clipboard";
  }
  return "";
});

const themeLabel = computed(() =>
  themeService.currentTheme.value === "dark" ? "深色主题" : "浅色主题",
);

const goClipboard = (filter: "all" | "favorite") => {
  clipboardStore.activeFilter = filter;
  if (route.path.includes("/clipboard")) return;
  router.push("/clipboard");
};

const goSettings = () => {
  router.push("/settings");
};

const toggleTheme = () => {
  const nextTheme: ThemeType = themeService.currentTheme.value === "dark" ? "light" : "dark";
  themeService.setTheme(nextTheme);
};
</script>

<template>
  <aside class="nav-sidebar">
    <nav class="nav-list" aria-label="主导航">
      <button
        type="button"
        class="nav-item"
        :class="{ active: activeModule === 'clipboard' }"
        aria-label="剪贴板"
        :title="`剪贴板（${typeCounts.all}）`"
        @click="goClipboard('all')"
      >
        <i-ep-DocumentCopy class="nav-icon" />
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: activeModule === 'favorite' }"
        aria-label="收藏"
        :title="`收藏（${typeCounts.favorite}）`"
        @click="goClipboard('favorite')"
      >
        <i-ep-Star class="nav-icon" />
      </button>
    </nav>

    <div class="sidebar-tools">
      <button
        type="button"
        class="util-item"
        :title="`${themeLabel}，点击切换`"
        :aria-label="
          themeService.currentTheme.value === 'dark' ? '切换到浅色主题' : '切换到深色主题'
        "
        @click="toggleTheme"
      >
        <span class="util-icon-wrap" aria-hidden="true">
          <i-ep-Moon v-if="themeService.currentTheme.value === 'dark'" />
          <i-ep-Sunny v-else />
        </span>
      </button>

      <button
        type="button"
        class="util-item"
        :class="{ active: activeModule === 'settings' }"
        aria-label="设置"
        title="设置"
        @click="goSettings"
      >
        <span class="util-icon-wrap" aria-hidden="true">
          <i-ep-Setting />
        </span>
      </button>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.nav-sidebar {
  width: var(--nav-width, 64px);
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-light);
  padding: 12px 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.nav-list,
.sidebar-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-tools {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}

.nav-item,
.util-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--bg-active);
    color: var(--accent-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.util-icon-wrap {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;

  :deep(svg) {
    width: 16px;
    height: 16px;
    display: block;
  }
}
</style>
