<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { themeService } from "../../utils/theme";
import type { ThemeType } from "../../utils/theme";
import { useRouter } from "vue-router";
import { APP_ICON_URL } from "@/constants/assets";
import ShortcutRecorder from "./components/ShortcutRecorder.vue";

defineOptions({
  name: "settings",
});

/** 当前已生效的全局快捷键（由 ShortcutRecorder 加载/更新） */
const shortcut = ref("Alt+Shift+C");
const minimizeToTray = ref<boolean>(false);
const openAtLogin = ref<boolean>(false);
const dataRetentionDays = ref<number>(1);
const isLoading = ref<boolean>(false);
const appVersion = ref("–");
const router = useRouter();

const retentionOptions = [1, 2, 3, 4, 5, 6, 7];

const theme = computed<ThemeType>({
  get: () => themeService.currentTheme.value,
  set: (value: ThemeType) => themeService.setTheme(value),
});

onMounted(async () => {
  minimizeToTray.value = (await window.config.get<boolean>("minimizeToTray")) ?? false;
  openAtLogin.value = (await window.config.get<boolean>("openAtLogin")) ?? false;
  dataRetentionDays.value = (await window.config.get<number>("dataRetentionDays")) ?? 1;

  try {
    const version = await window.app.getVersion();
    if (version) appVersion.value = version;
  } catch (error) {
    console.error("获取应用版本失败:", error);
  }
});

const handleMinimizeToTrayChange = (value: boolean) => {
  window.config.set("minimizeToTray", value);
};

/** 开机自启：开发态可能仅写入配置，打包后才真正生效 */
const handleOpenAtLoginChange = async (value: boolean) => {
  const previous = !value;
  try {
    const result = await window.app.setOpenAtLogin(value);
    if (!result?.success) {
      openAtLogin.value = previous;
      ElMessage.error(`开机自启设置失败: ${result?.error ?? "未知错误"}`);
      return;
    }
    openAtLogin.value = result.openAtLogin;
    if (!result.applied) {
      ElMessage.success("已保存（打包后生效）");
    }
  } catch (error) {
    openAtLogin.value = previous;
    ElMessage.error(`开机自启设置失败: ${error}`);
  }
};

const handleDataRetentionChange = (value: number) => {
  dataRetentionDays.value = value;
  window.config.set("dataRetentionDays", value);
  ElMessage.success(`数据保存时间已设置为 ${value} 天`);
};

const setTheme = (value: ThemeType) => {
  theme.value = value;
};

/** 检查更新时的状态监听清理函数 */
let removeListener: (() => void) | null = null;

const checkForUpdates = async () => {
  try {
    isLoading.value = true;

    removeListener = window.updater.onUpdateStatus((status) => {
      if (status.status === "update-not-available") {
        ElMessage.info("当前已是最新版本");
      }
    });

    await window.updater.checkForUpdates();
  } catch (error) {
    ElMessage.error("检查更新失败: " + error);
  } finally {
    removeListener?.();
    isLoading.value = false;
  }
};

const viewChangelog = () => {
  router.push("/changelog");
};

const openGithub = () => {
  window.shell.openExternal("https://github.com/hnugreycrow/MemoPaste");
};

onUnmounted(() => {
  if (removeListener) {
    removeListener();
    removeListener = null;
  }
});
</script>

<template>
  <div class="settings-container">
    <div class="content-header">
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">个性化你的剪贴板工作流</p>
    </div>

    <div class="content">
      <!-- 常规 -->
      <section class="settings-section">
        <div class="section-header">
          <el-icon class="section-icon"><i-ep-Setting /></el-icon>
          <h2 class="section-title">常规</h2>
        </div>

        <div class="settings-group">
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">主题</span>
              <span class="setting-desc">选择界面外观</span>
            </div>
            <div class="theme-picker">
              <button
                type="button"
                class="theme-option"
                :class="{ active: theme === 'light' }"
                @click="setTheme('light')"
              >
                <div class="theme-preview light">
                  <span class="preview-sidebar" />
                  <span class="preview-body">
                    <span class="preview-line" />
                    <span class="preview-line short" />
                  </span>
                </div>
                <span class="theme-name">
                  <el-icon><i-ep-Sunny /></el-icon>
                  浅色
                </span>
              </button>
              <button
                type="button"
                class="theme-option"
                :class="{ active: theme === 'dark' }"
                @click="setTheme('dark')"
              >
                <div class="theme-preview dark">
                  <span class="preview-sidebar" />
                  <span class="preview-body">
                    <span class="preview-line" />
                    <span class="preview-line short" />
                  </span>
                </div>
                <span class="theme-name">
                  <el-icon><i-ep-Moon /></el-icon>
                  深色
                </span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">关闭时最小化到托盘</span>
              <span class="setting-desc">点击关闭时隐藏到托盘</span>
            </div>
            <el-switch v-model="minimizeToTray" @change="handleMinimizeToTrayChange" />
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">开机自启</span>
              <span class="setting-desc">电脑开机后自动启动</span>
            </div>
            <el-switch v-model="openAtLogin" @change="handleOpenAtLoginChange" />
          </div>

          <div class="setting-row retention-row">
            <div class="setting-meta">
              <span class="setting-label">
                数据保存时间
                <span class="inline-tag">收藏除外</span>
              </span>
              <span class="setting-desc">启动时自动清理过期记录</span>
            </div>
            <div class="segmented" role="group" aria-label="数据保存天数">
              <button
                v-for="days in retentionOptions"
                :key="days"
                type="button"
                class="segment"
                :class="{ active: dataRetentionDays === days }"
                @click="handleDataRetentionChange(days)"
              >
                {{ days }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 快捷键 -->
      <section class="settings-section">
        <div class="section-header">
          <el-icon class="section-icon"><i-ep-Key /></el-icon>
          <h2 class="section-title">快捷键</h2>
        </div>

        <div class="settings-group">
          <div class="setting-row shortcut-row">
            <div class="setting-meta">
              <span class="setting-label">唤起快捷面板</span>
              <span class="setting-desc">
                全局快捷键打开浮层；需包含 Ctrl / Alt / Win 之一，可叠加
                Shift；普通键限字母、数字、F1–F12
              </span>
            </div>
            <ShortcutRecorder v-model:shortcut="shortcut" />
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="settings-section">
        <div class="section-header">
          <el-icon class="section-icon"><i-ep-InfoFilled /></el-icon>
          <h2 class="section-title">关于</h2>
        </div>

        <div class="settings-group">
          <div class="about-intro">
            <el-image
              class="about-logo"
              :src="APP_ICON_URL"
              alt="MemoPaste"
              :preview-src-list="[APP_ICON_URL]"
              fit="cover"
            />
            <div class="about-intro-text">
              <div class="about-name">MemoPaste</div>
              <p class="about-desc">
                剪贴板管理工具，帮助您管理和组织剪贴板内容。基于 Electron + Vue + Vite 构建。
              </p>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">当前版本</span>
              <span class="setting-desc">MemoPaste v{{ appVersion }}</span>
            </div>
            <el-button :loading="isLoading" class="action-btn" @click="checkForUpdates">
              检查更新
            </el-button>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">更新日志</span>
              <span class="setting-desc">查看版本更新历史</span>
            </div>
            <el-button class="action-btn" @click="viewChangelog"> 查看日志 </el-button>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">项目主页</span>
              <span class="setting-desc">GitHub 仓库与源码</span>
            </div>
            <el-button class="action-btn" @click="openGithub">
              <el-icon class="btn-icon"><i-ep-Link /></el-icon>
              打开
            </el-button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.content-header {
  padding: 20px 28px 8px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.content {
  flex: 1;
  padding: 8px 28px 28px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.settings-section {
  margin-top: 20px;

  &:first-child {
    margin-top: 8px;
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 4px;
}

.section-icon {
  font-size: 15px;
  color: var(--accent-primary);
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.settings-group {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--setting-card-bg);
  overflow: hidden;
}

.about-intro {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-light);
}

.about-logo {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--bg-tertiary);
}

.about-intro-text {
  min-width: 0;
}

.about-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.about-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 64px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light);
  transition: background-color 0.15s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-hover);
  }
}

.setting-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-tertiary);
}

.inline-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent-quaternary);
  background: var(--favorite-bg);
  border: 1px solid color-mix(in srgb, var(--favorite-border) 35%, transparent);
}

.theme-picker {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);

  &.active {
    color: var(--text-primary);

    .theme-preview {
      border-color: var(--accent-primary);
    }
  }
}

.theme-preview {
  width: 72px;
  height: 48px;
  border-radius: 8px;
  border: 1.5px solid var(--border-medium);
  display: flex;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  .theme-option:hover & {
    transform: translateY(-1px);
  }

  &.light {
    background: #f4f8f6;

    .preview-sidebar {
      background: #eaf4f0;
      border-right: 1px solid #d5e8e1;
    }

    .preview-line {
      background: #c9b6f5;
    }
  }

  &.dark {
    background: #221c2e;

    .preview-sidebar {
      background: #1b1624;
      border-right: 1px solid #3a3148;
    }

    .preview-line {
      background: #7ddbb8;
    }
  }
}

.preview-sidebar {
  width: 18px;
  flex-shrink: 0;
}

.preview-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
}

.preview-line {
  display: block;
  height: 4px;
  border-radius: 2px;

  &.short {
    width: 60%;
  }
}

.theme-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
  flex-shrink: 0;
}

.segment {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-primary);
    color: var(--accent-on-primary, #fff);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
}

.action-btn {
  flex-shrink: 0;
}

.btn-icon {
  margin-right: 4px;
}

@media (max-width: 720px) {
  .setting-row,
  .shortcut-row,
  .retention-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .segmented,
  .theme-picker {
    width: 100%;
  }

  .segmented {
    justify-content: space-between;
  }

  .segment {
    flex: 1;
  }
}
</style>
