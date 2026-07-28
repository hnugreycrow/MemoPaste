<script setup lang="ts">
import Header from "./header/index.vue";
import Sidebar from "./sidebar/index.vue";
import { useRouter } from "vue-router";
import { computed, onMounted, onUnmounted } from "vue";
import { useClipboardStore } from "@/stores/clipboardStore";

const clipboardStore = useClipboardStore();

const router = useRouter();

// 自动找出所有 meta.keepAlive = true 的路由
const cacheRoutes = computed<string[]>(() =>
  router
    .getRoutes()
    .filter((r) => r.meta?.keepAlive)
    .map((r) => r.name)
    .filter((name): name is string => typeof name === "string"),
);

let clipboardWatcherCleanup: (() => void) | null = null; // 剪贴板监听清理函数

/**
 * 启动剪贴板监听
 * @returns {void}
 */
const startClipboardWatcher = () => {
  // 如果已经有监听清理函数，说明监听已经启动，不需要重新启动
  if (clipboardWatcherCleanup) {
    console.log("剪贴板监听已经在运行中，无需重新启动");
    return;
  }

  // 启动监听
  window.clipboard
    .startWatching()
    .then(() => {
      // 设置变化回调
      clipboardWatcherCleanup = window.clipboard.onChanged(async (content) => {
        if (content && content.trim() !== "") {
          await clipboardStore.addClipboardItem(content);
        }
      });
    })
    .catch((error) => {
      console.error("启动剪贴板监听失败:", error);
    });
};

/**
 * 停止剪贴板监听
 * @returns {void}
 */
const stopClipboardWatcher = () => {
  // 停止监听
  if (clipboardWatcherCleanup) {
    clipboardWatcherCleanup();
    clipboardWatcherCleanup = null;

    window.clipboard
      .stopWatching()
      .then(() => {
        console.log("剪贴板监听已停止");
      })
      .catch((error) => {
        console.error("停止剪贴板监听失败:", error);
      });
  }
};

onMounted(() => {
  startClipboardWatcher();
  clipboardStore.refreshCounts();
});

onUnmounted(() => {
  stopClipboardWatcher();
});
</script>

<template>
  <div class="common-layout">
    <Sidebar />
    <div class="right-stack">
      <el-header :height="'var(--header-height)'" class="right-header">
        <Header />
      </el-header>
      <el-main class="right-main">
        <router-view v-slot="{ Component, route }">
          <keep-alive :include="cacheRoutes">
            <component :is="Component" :key="route.path" />
          </keep-alive>
        </router-view>
      </el-main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.common-layout {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  margin: 0 auto;
  background: var(--bg-primary);
  overflow: hidden;
}

.right-stack {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.right-header {
  padding: 0;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  z-index: 10;
}

.right-main {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 0;
  width: 100%;
  background: transparent;
  overflow: hidden;

  :deep(> *) {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
}
</style>
