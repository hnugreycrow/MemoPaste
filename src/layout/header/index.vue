<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import MaximizeIcon from "@/assets/window-maximize.svg";
import RestoreIcon from "@/assets/window-restore.svg";

const isMaximized = ref(false);
let unsubscribe: (() => void) | null = null;

const handleMinimize = () => {
  window.windowControls.minimize();
};

const handleMaximize = () => {
  if (window.windowControls) {
    window.windowControls.maximize();
  } else {
    console.error("windowControls 未定义");
  }
};

const handleClose = () => {
  window.windowControls.close();
};

onMounted(async () => {
  try {
    isMaximized.value = await window.windowControls.isMaximized();
  } catch (error) {
    console.error("获取窗口状态失败:", error);
  }

  if (window.windowControls.onMaximizeChange) {
    unsubscribe = window.windowControls.onMaximizeChange((maximized: boolean) => {
      isMaximized.value = maximized;
    });
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<template>
  <div class="titlebar">
    <div class="titlebar-drag" />
    <div class="titlebar-controls">
      <el-button class="titlebar-btn minimize-btn" aria-label="最小化窗口" @click="handleMinimize">
        <template #icon><i-ep-Minus /></template>
      </el-button>

      <el-button class="titlebar-btn maximize-btn" @click="handleMaximize">
        <template #icon>
          <component style="font-size: 13px" :is="isMaximized ? RestoreIcon : MaximizeIcon" />
        </template>
      </el-button>

      <el-button class="titlebar-btn close-btn" aria-label="关闭窗口" @click="handleClose">
        <template #icon><i-ep-Close /></template>
      </el-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.titlebar {
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0;
  -webkit-app-region: drag;
  user-select: none;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  height: var(--header-height);
}

.titlebar-drag {
  flex: 1;
  height: 100%;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
  position: relative;
  height: 100%;
  margin-right: 4px;
}

:deep(.titlebar-btn) {
  width: 32px;
  height: 32px;
  background-color: transparent;
  border: none;
  border-radius: 0;
  margin: 0;
  padding: 0;
  transition: all 0.2s ease;

  .el-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-secondary);
    font-size: 14px;
  }

  &:focus-visible {
    outline: none;
    box-shadow: none;
  }

  &:active {
    transform: scale(0.95);
  }
}

.minimize-btn:hover,
.maximize-btn:hover {
  background-color: var(--bg-hover);

  :deep(.el-icon) {
    color: var(--text-primary);
  }
}

.close-btn:hover {
  background-color: var(--accent-danger);

  :deep(.el-icon) {
    color: white;
  }
}

:deep(.el-button) {
  &:hover,
  &:focus {
    color: var(--text-primary);
  }

  &:active {
    color: var(--text-primary);
  }
}
</style>
