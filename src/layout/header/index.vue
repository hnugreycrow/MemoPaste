<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MaximizeIcon from '@/assets/window-maximize.svg'
import RestoreIcon from '@/assets/window-restore.svg'
import { themeService, type ThemeType } from '@/utils/theme'

const isMaximized = ref(false)
let unsubscribe: (() => void) | null = null

const toggleTheme = () => {
  const nextTheme: ThemeType = themeService.currentTheme.value === 'dark' ? 'light' : 'dark'
  themeService.setTheme(nextTheme)
}

const handleMinimize = () => {
  window.windowControls.minimize();
}

const handleMaximize = () => {
  if (window.windowControls) { // 确保对象存在
    window.windowControls.maximize();
  } else {
    console.error('windowControls 未定义');
  }
}

const handleClose = () => {
  ElMessageBox.confirm('确认关闭应用吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'info'
  }).then(() => {
    window.windowControls.close();
  }).catch(() => {
    // 取消关闭
  });
}

onMounted(async () => {
  // 获取初始状态
  try {
    isMaximized.value = await window.windowControls.isMaximized()
  } catch (error) {
    console.error('获取窗口状态失败:', error)
  }
  
  // 监听状态变化
  if (window.windowControls.onMaximizeChange) {
    unsubscribe = window.windowControls.onMaximizeChange((maximized: boolean) => {
      isMaximized.value = maximized
    })
  }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<template>
  <div class="titlebar">
    <div class="titlebar-left">
      <img src="/electron.svg" class="app-logo"></img>
      <el-text class="app-title">Eideticlip</el-text>
    </div>
    <div class="titlebar-controls">
      <!-- 主题切换按钮 -->
      <el-button
        class="titlebar-btn theme-btn"
        :aria-label="themeService.currentTheme.value === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
        @click="toggleTheme"
      >
        <template #icon>
          <i-ep-moon v-if="themeService.currentTheme.value === 'dark'" />
          <i-ep-sunny v-else />
        </template>
      </el-button>

      <!-- 最小化按钮 -->
      <el-button class="titlebar-btn minimize-btn" aria-label="最小化窗口" @click="handleMinimize">
        <template #icon> <i-ep-minus /></template>
      </el-button>

      <!-- 最大化/还原按钮 -->
      <el-button 
        class="titlebar-btn maximize-btn" 
        @click="handleMaximize"
      >
        <template #icon>
          <component style="font-size: 13px;" :is="isMaximized ? RestoreIcon : MaximizeIcon" />
        </template>
      </el-button>

      <!-- 关闭按钮 -->
      <el-button class="titlebar-btn close-btn" aria-label="关闭窗口" @click="handleClose">
        <template #icon> <i-ep-close /></template>
      </el-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.titlebar {
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  border-radius: 8px 8px 0 0;
  -webkit-app-region: drag;
  user-select: none;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
  height: var(--header-height);
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding-left: 12px;
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

// 基础按钮样式
:deep(.titlebar-btn) {
  width: 32px;
  height: 32px;
  background-color: transparent;
  border: none;
  border-radius: 0;
  margin: 0;
  padding: 0;
  transition: all 0.2s ease;

  // 图标居中
  .el-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-secondary);
    font-size: 14px;
  }

  // 去除默认聚焦样式
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }

  // 点击效果
  &:active {
    transform: scale(0.95);
  }
}

// 最小化按钮，最大化按钮，主题切换按钮
.minimize-btn:hover,
.maximize-btn:hover,
.theme-btn:hover {
  background-color: var(--bg-hover);
  
  :deep(.el-icon) {
    color: var(--text-primary);
  }
}

// 关闭按钮 - 使用更醒目的红色
.close-btn:hover {
  background-color: var(--accent-danger);
  
  :deep(.el-icon) {
    color: white;
  }
}

// 修复按钮点击时的样式问题
:deep(.el-button) {
  &:hover,
  &:focus {
    color: var(--text-primary);
  }

  &:active {
    color: var(--text-primary);
  }
}

// 应用图标样式
.app-logo {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

// 应用标题样式
.app-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}
</style>
