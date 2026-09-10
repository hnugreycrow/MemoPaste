<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import { themeService, type ThemeType } from "@/utils/theme";
import { APP_ICON_URL } from "@/constants/assets";

const route = useRoute();
const router = useRouter();
const clipboardStore = useClipboardStore();
const { activeFilter, typeCounts } = storeToRefs(clipboardStore);
const isCollapsed = ref(false);
let hasToggled = false;
const collapseLabel = computed(() => (isCollapsed.value ? "展开侧边栏" : "收起侧边栏"));

const toggleSidebar = () => {
  hasToggled = true;
  isCollapsed.value = !isCollapsed.value;
  window.config.set("sidebarCollapsed", isCollapsed.value).catch((error: unknown) => {
    console.error("保存侧边栏状态失败:", error);
  });
};

onMounted(() => {
  clipboardStore.refreshCounts();
  window.config
    .get<boolean>("sidebarCollapsed")
    .then((collapsed) => {
      if (!hasToggled) isCollapsed.value = collapsed === true;
    })
    .catch((error: unknown) => {
      console.error("读取侧边栏状态失败:", error);
    });
});

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
  <aside class="nav-sidebar" :class="{ 'is-collapsed': isCollapsed }">
    <div class="brand">
      <img :src="APP_ICON_URL" class="brand-logo" alt="MemoPaste" />
      <div class="brand-text">
        <div class="brand-name">MemoPaste</div>
        <div class="brand-tagline">剪贴板工具</div>
      </div>
    </div>

    <nav class="nav-list" aria-label="主导航">
      <button
        type="button"
        class="nav-item"
        :class="{ active: activeModule === 'clipboard' }"
        aria-label="剪贴板"
        :title="isCollapsed ? `剪贴板（${typeCounts.all}）` : undefined"
        @click="goClipboard('all')"
      >
        <i-ep-DocumentCopy class="nav-icon" />
        <span class="nav-label">剪贴板</span>
        <span class="nav-count">{{ typeCounts.all }}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: activeModule === 'favorite' }"
        aria-label="收藏"
        :title="isCollapsed ? `收藏（${typeCounts.favorite}）` : undefined"
        @click="goClipboard('favorite')"
      >
        <i-ep-Star class="nav-icon" />
        <span class="nav-label">收藏</span>
        <span class="nav-count">{{ typeCounts.favorite }}</span>
      </button>
    </nav>

    <div class="sidebar-tools">
      <button
        type="button"
        class="util-item"
        :title="isCollapsed ? `${themeLabel}，点击切换` : undefined"
        :aria-label="
          themeService.currentTheme.value === 'dark' ? '切换到浅色主题' : '切换到深色主题'
        "
        @click="toggleTheme"
      >
        <span class="util-icon-wrap" aria-hidden="true">
          <i-ep-Moon v-if="themeService.currentTheme.value === 'dark'" />
          <i-ep-Sunny v-else />
        </span>
        <span class="util-label">{{ themeLabel }}</span>
        <span class="util-meta">切换</span>
      </button>

      <button
        type="button"
        class="util-item"
        :class="{ active: activeModule === 'settings' }"
        aria-label="设置"
        :title="isCollapsed ? '设置' : undefined"
        @click="goSettings"
      >
        <span class="util-icon-wrap" aria-hidden="true">
          <i-ep-Setting />
        </span>
        <span class="util-label">设置</span>
      </button>
      <button
        type="button"
        class="util-item"
        :aria-label="collapseLabel"
        :aria-expanded="!isCollapsed"
        :title="collapseLabel"
        @click="toggleSidebar"
      >
        <span class="util-icon-wrap" aria-hidden="true">
          <i-ep-Expand v-if="isCollapsed" />
          <i-ep-Fold v-else />
        </span>
        <span class="util-label">{{ collapseLabel }}</span>
      </button>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.nav-sidebar {
  width: var(--nav-width, 220px);
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-light);
  padding: 16px 12px 12px;
  box-sizing: border-box;
  overflow: hidden;
  -webkit-app-region: drag;
  transition:
    width 0.2s ease,
    padding 0.2s ease;

  &.is-collapsed {
    width: 64px;
    padding-inline: 8px;

    .brand {
      padding-inline: 3.5px;
    }

    .brand-logo {
      transform: scale(0.8);
      margin-right: -10px;
    }

    .brand-text {
      opacity: 0;
      visibility: hidden;
    }

    .nav-label,
    .nav-count,
    .util-label,
    .util-meta {
      display: none;
    }

    .nav-item,
    .util-item {
      justify-content: center;
      gap: 0;
      padding-inline: 0;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-sidebar,
  .nav-sidebar .brand,
  .nav-sidebar .brand-logo,
  .nav-sidebar .brand-text {
    transition: none;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 70px;
  flex-shrink: 0;
  padding: 4px 6px 16px;
  transition: padding 0.2s ease;
  -webkit-app-region: no-drag;
}

.brand-logo {
  width: 50px;
  height: 50px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  transform-origin: left center;
  transition:
    transform 0.2s ease,
    margin-right 0.2s ease;
}

.brand-text {
  min-width: 0;
  flex-shrink: 0;
  white-space: nowrap;
  transition:
    opacity 0.2s ease,
    visibility 0.2s ease;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.brand-tagline {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.nav-item,
.util-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  text-align: left;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--bg-active);
    color: var(--accent-primary);
  }
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav-label,
.util-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.nav-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.nav-item.active .nav-count {
  color: var(--accent-primary);
}

.sidebar-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  -webkit-app-region: no-drag;
}

.util-icon-wrap {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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

.util-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  line-height: 1;
}

.util-item:hover .util-meta {
  color: var(--text-secondary);
}

.util-item.active .util-meta {
  color: var(--accent-primary);
}
</style>
