<script setup lang="ts">
import { computed } from "vue";
import router from "@/router";
import { useRoute } from "vue-router";

const route = useRoute();

// 根据当前路由路径计算当前激活的模块
const activeModule = computed(() => {
  const path = route.path;
  if (path.includes("/settings")) {
    return "settings";
  } else if (path.includes("/clipboard")) {
    return "clipboard";
  }
  return "";
});

const switchModule = (module: string) => {
  if (module === "settings") {
    router.push("/settings");
  } else if (module === "clipboard") {
    router.push("/clipboard");
  }
};
</script>

<template>
  <div class="nav-sidebar">
    <button
      class="nav-item"
      :class="{ active: activeModule === 'clipboard' }"
      title="剪贴板历史"
      @click="switchModule('clipboard')"
    >
      <i-ep-document-copy />
    </button>
    <div class="nav-divider"></div>
    <button
      class="nav-item"
      :class="{ active: activeModule === 'settings' }"
      title="设置"
      @click="switchModule('settings')"
    >
      <i-ep-setting />
    </button>
  </div>
</template>

<style lang="scss" scoped>
/* 左侧导航栏 - 纯图标模式 */
.nav-sidebar {
  width: var(--nav-width, 60px);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  height: 100%;
  box-shadow: 1px 0 3px rgba(0, 0, 0, 0.05);
}

.nav-item {
  width: 42px;
  height: 42px;
  margin: 5px 0;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  position: relative;
  opacity: 0.85;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  opacity: 1;
  transform: translateY(-1px);
}

.nav-item.active {
  background: var(--bg-active);
  color: var(--accent-primary);
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0, 132, 255, 0.15);
}

.nav-item.active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 20px;
  background: var(--accent-primary);
  border-radius: 0 2px 2px 0;
}

.nav-divider {
  width: 30px;
  height: 1px;
  background: var(--border-light);
  margin-top: auto;
}

.nav-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--accent-danger);
  color: white;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}
</style>
