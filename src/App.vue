<script setup lang="ts">
import { onMounted, ref } from "vue";
import UpdateDialog from "./components/UpdateDialog.vue";
import router from "./router";

const windowRole = ref<"main" | "panel">(
  document.documentElement.classList.contains("is-panel") ? "panel" : "main",
);

onMounted(async () => {
  // 版本更新日志仅在主窗口提示
  if (windowRole.value !== "main") return;

  const currentVersion = await window.app.getVersion();
  const savedVersion = await window.config.get("version");

  if (savedVersion !== currentVersion) {
    await window.config.set("version", currentVersion);
    router.push("/changelog");
  }
});
</script>

<template>
  <RouterView></RouterView>
  <UpdateDialog v-if="windowRole === 'main'" />
</template>

<style>
@import "./styles/themes.css";
@import "./styles/type-badges.css";

html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}

#app {
  display: flex;
  flex-direction: column;
}

html.is-panel,
html.is-panel body,
html.is-panel #app {
  /* 透明底：配合面板窗口圆角，避免露出矩形窗体底色 */
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

* {
  box-sizing: border-box;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: var(--border-light);
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-medium);
}

/* 覆盖Element Plus的一些默认样式 */
.el-button {
  --el-button-bg-color: var(--bg-tertiary);
  --el-button-text-color: var(--text-primary);
  --el-button-border-color: var(--border-light);
  --el-button-active-border-color: var(--el-button-border-color);
  --el-button-hover-bg-color: var(--bg-hover);
  --el-button-hover-text-color: var(--text-primary);
  --el-button-hover-border-color: var(--border-medium);
  --el-button-disabled-bg-color: var(--bg-secondary);
  --el-button-disabled-text-color: var(--text-tertiary);
  --el-button-disabled-border-color: var(--border-light);
}

.el-button--primary {
  --el-button-bg-color: var(--accent-primary);
  --el-button-text-color: var(--accent-on-primary, var(--text-inverse));
  --el-button-border-color: var(--accent-primary);
  --el-button-hover-bg-color: var(--accent-primary-hover, var(--bg-active));
  --el-button-hover-border-color: var(--accent-primary-hover, var(--bg-active));
  --el-button-hover-text-color: var(--accent-on-primary, var(--text-inverse));
}

.el-input__wrapper {
  background-color: var(--bg-tertiary);
  box-shadow: 0 0 0 1px var(--border-light) inset;
}

.el-input__inner {
  color: var(--text-primary);
}

.el-dropdown-menu__item {
  --el-dropdown-menuItem-hover-fill: var(--bg-hover);
}

button:focus {
  outline: none;
}
button:focus-visible:not(.nav-item):not(.util-item):not(.clipboard-item-select) {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
.nav-item:focus-visible,
.util-item:focus-visible {
  outline: none;
}
mark {
  background: var(--search-mark-bg);
  color: inherit;
  border-radius: 2px;
}
</style>
