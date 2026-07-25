<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useClipboardStore } from "@/stores/clipboardStore";
import { themeService, type ThemeType } from "@/utils/theme";

const route = useRoute();
const router = useRouter();
const clipboardStore = useClipboardStore();
const { activeFilter, typeCounts } = storeToRefs(clipboardStore);

onMounted(() => {
  clipboardStore.refreshCounts();
});

const activeModule = computed(() => {
  if (route.path.includes("/settings")) return "settings";
  if (route.path.includes("/changelog")) return "changelog";
  if (route.path.includes("/clipboard")) {
    return activeFilter.value === "favorite" ? "favorite" : "clipboard";
  }
  return "";
});

const goClipboard = (filter: "all" | "favorite") => {
  clipboardStore.activeFilter = filter;
  if (route.path.includes("/clipboard")) return;
  router.push("/clipboard");
};

const goSettings = () => {
  router.push("/settings");
};

const goChangelog = () => {
  router.push("/changelog");
};

const toggleTheme = () => {
  const nextTheme: ThemeType =
    themeService.currentTheme.value === "dark" ? "light" : "dark";
  themeService.setTheme(nextTheme);
};
</script>

<template>
  <aside class="nav-sidebar">
    <div class="brand">
      <img src="/icon.png" class="brand-logo" alt="MemoPaste" />
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
        @click="goClipboard('favorite')"
      >
        <i-ep-Star class="nav-icon" />
        <span class="nav-label">收藏</span>
        <span class="nav-count">{{ typeCounts.favorite }}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: activeModule === 'settings' }"
        @click="goSettings"
      >
        <i-ep-Setting class="nav-icon" />
        <span class="nav-label">设置</span>
      </button>
    </nav>

    <div class="sidebar-tools">
      <button
        type="button"
        class="tool-btn"
        :aria-label="
          themeService.currentTheme.value === 'dark'
            ? '切换到浅色主题'
            : '切换到深色主题'
        "
        :title="
          themeService.currentTheme.value === 'dark' ? '浅色主题' : '深色主题'
        "
        @click="toggleTheme"
      >
        <i-ep-Moon v-if="themeService.currentTheme.value === 'dark'" />
        <i-ep-Sunny v-else />
      </button>
      <button
        type="button"
        class="tool-btn"
        :class="{ active: activeModule === 'changelog' }"
        title="更新日志"
        aria-label="更新日志"
        @click="goChangelog"
      >
        <i-ep-Notebook />
      </button>
      <button
        type="button"
        class="tool-btn"
        title="关于"
        aria-label="关于"
        @click="goSettings"
      >
        <i-ep-InfoFilled />
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
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 16px;
  -webkit-app-region: no-drag;
}

.brand-logo {
  width: 50px;
  height: 50px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.brand-text {
  min-width: 0;
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

.nav-item {
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
  transition: background 0.15s ease, color 0.15s ease;
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

.nav-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
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

.mascot-wrap {
  margin-top: auto;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 8px 4px 4px;
  min-height: 168px;
  -webkit-app-region: no-drag;
  pointer-events: none;
}

.mascot {
  width: 168px;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.sidebar-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  -webkit-app-region: no-drag;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    color: var(--accent-primary);
    background: var(--bg-active);
  }
}
</style>
