<script setup lang="ts">
import { onMounted, ref } from "vue";
import { themeService } from "./utils/theme";
import UpdateDialog from "./components/UpdateDialog.vue";
import router from "./router";

const windowRole = ref<"main" | "panel">("main");

onMounted(async () => {
  // 同一套渲染代码跑在主窗口与面板窗口，需先分辨角色
  try {
    const role = await window.ipcRenderer.invoke("window-get-role");
    windowRole.value = role === "panel" ? "panel" : "main";
  } catch {
    windowRole.value = "main";
  }

  // 面板窗口背景需透明，才能露出圆角/亚克力
  if (windowRole.value === "panel") {
    document.documentElement.classList.add("is-panel");
    document.body.classList.add("is-panel");
  }

  await themeService.initTheme();

  // 版本更新日志仅在主窗口提示
  if (windowRole.value !== "main") return;

  const currentVersion = await window.ipcRenderer.invoke("app-get-version");
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

html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei",
    sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
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
  width: 7px;
  height: 7px;
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
}

.el-button--primary {
  --el-button-bg-color: var(--accent-primary);
  --el-button-text-color: var(--text-inverse);
  --el-button-border-color: var(--accent-primary);
  --el-button-hover-bg-color: var(
    --accent-primary-hover,
    var(--bg-active)
  );
  --el-button-hover-border-color: var(--accent-primary-hover, var(--bg-active));
  --el-button-hover-text-color: var(--text-inverse);
}

.el-input__wrapper {
  background-color: var(--bg-tertiary);
  box-shadow: 0 0 0 1px var(--border-light) inset;
}

.el-input__inner {
  color: var(--text-primary);
}

.el-dropdown-menu__item {
  --el-dropdown-menuItem-hover-fill: var(--bg-hover)
}
</style>
