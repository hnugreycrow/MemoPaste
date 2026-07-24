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
  router.getRoutes()
    .filter(r => r.meta?.keepAlive)
    .map(r => r.name) 
    .filter((name): name is string => typeof name === "string")
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
});

onUnmounted(() => {
  stopClipboardWatcher();
})
</script>

<template>
  <div class="common-layout">
    <el-container>
      <el-header :height="'var(--header-height)'">
        <Header></Header>
      </el-header>
      <el-container class="main-container">
        <Sidebar />
        <el-main>
          <router-view v-slot="{ Component, route }">
            <keep-alive :include="cacheRoutes">
              <component :is="Component" :key="route.path" />
            </keep-alive>
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<style lang="scss" scoped>
.common-layout {
  display: flex;
  flex: 1;
  margin: 0 auto;
  background: var(--bg-primary);
  overflow: hidden;
}

.el-header,
.el-main {
  padding: 0;
  width: 100%;
}

.el-header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  z-index: 10;
}

.el-main {
  display: flex;
  background: transparent;
}

.main-container {
  height: calc(100% - var(--header-height));
  overflow: hidden;
  display: flex;
  flex: 1;
}
</style>
