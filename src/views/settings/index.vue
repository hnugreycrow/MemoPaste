<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { themeService } from "../../utils/theme";
import type { ThemeType } from "../../utils/theme";
import { useRouter } from "vue-router";
import {
  validateShortcut,
  normalizeShortcut,
  formatShortcutForDisplay,
  normalKeyFromCode,
} from "@shared/shortcut";

defineOptions({
  name: "settings",
});

const shortcut = ref("Alt+Shift+C");
const tempKeys = ref<string[]>([]);
const isRecording = ref(false);
const shortcutInput = ref<HTMLElement | null>(null);
const minimizeToTray = ref<boolean>(false);
const dataRetentionDays = ref<number>(1);
const isLoading = ref<boolean>(false);
const appVersion = ref("–");
const router = useRouter();

const retentionOptions = [1, 2, 3, 4, 5, 6, 7];

const theme = computed<ThemeType>({
  get: () => themeService.currentTheme.value,
  set: (value: ThemeType) => themeService.setTheme(value),
});

const displayKeyParts = computed(() => {
  const raw = isRecording.value
    ? tempKeys.value.length > 0
      ? tempKeys.value.join("+")
      : ""
    : shortcut.value;

  return formatShortcutForDisplay(raw);
});

const startRecording = () => {
  tempKeys.value = [];
  isRecording.value = true;
  shortcutInput.value?.focus();
};

const onBlur = () => {
  isRecording.value = false;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!isRecording.value) return;

  e.preventDefault();
  tempKeys.value = [];

  if (e.ctrlKey) {
    tempKeys.value.push("CommandOrControl");
  }
  if (e.altKey) {
    tempKeys.value.push("Alt");
  }
  if (e.shiftKey) {
    tempKeys.value.push("Shift");
  }
  // Win / Cmd（非 Ctrl）→ Super，与共享校验一致
  if (e.metaKey && !e.ctrlKey) {
    tempKeys.value.push("Super");
  }

  const normalKey = normalKeyFromCode(e.code);
  if (normalKey) {
    tempKeys.value.push(normalKey);
  }
};

const onKeyUp = async (_e: KeyboardEvent) => {
  if (!isRecording.value || tempKeys.value.length === 0) return;

  const recorded = tempKeys.value.join("+");
  const checkResult = validateShortcut(recorded);

  if (!checkResult.success) {
    ElMessage.error(checkResult.error);
    isRecording.value = false;
    shortcutInput.value?.blur();
    return;
  }

  const newShortcut = checkResult.shortcut;
  if (newShortcut === normalizeShortcut(shortcut.value)) {
    isRecording.value = false;
    shortcutInput.value?.blur();
    return;
  }

  const previous = shortcut.value;
  shortcut.value = newShortcut;

  try {
    const result = await window.ipcRenderer.invoke(
      "shortcut-update",
      newShortcut,
    );
    shortcutInput.value?.blur();
    if (!result?.success) {
      shortcut.value = result?.shortcut || previous;
      ElMessage.error(`快捷键设置失败: ${result?.error ?? "未知错误"}`);
    } else {
      shortcut.value = result.shortcut;
      ElMessage.success("快捷键设置成功");
    }
  } catch (error) {
    shortcut.value = previous;
    ElMessage.error(`快捷键设置失败: ${error}`);
  }

  isRecording.value = false;
  shortcutInput.value?.blur();
};

onMounted(async () => {
  await themeService.initTheme();

  minimizeToTray.value = await window.config.get<boolean>("minimizeToTray");
  dataRetentionDays.value = await window.config.get<number>("dataRetentionDays");

  try {
    const version = await window.ipcRenderer.invoke("app-get-version");
    if (version) appVersion.value = version;
  } catch (error) {
    console.error("获取应用版本失败:", error);
  }

  try {
    const currentShortcut = await window.ipcRenderer.invoke("shortcut-get");
    if (currentShortcut) {
      shortcut.value = currentShortcut;
    }
  } catch (error) {
    console.error("获取快捷键失败:", error);
  }
});

const handleMinimizeToTrayChange = (value: boolean) => {
  window.config.set("minimizeToTray", value);
};

const handleDataRetentionChange = (value: number) => {
  dataRetentionDays.value = value;
  window.config.set("dataRetentionDays", value);
  ElMessage.success(`数据保存时间已设置为 ${value} 天`);
};

const setTheme = (value: ThemeType) => {
  theme.value = value;
};

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
  window.ipcRenderer.invoke(
    "open-external-url",
    "https://github.com/hnugreycrow/MemoPaste",
  );
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
              <span class="setting-label">最小化到托盘</span>
              <span class="setting-desc">最小化时隐藏到系统托盘</span>
            </div>
            <el-switch
              v-model="minimizeToTray"
              @change="handleMinimizeToTrayChange"
            />
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
                全局快捷键打开 Win+V 风格浮层，支持 Ctrl / Alt / Shift 组合
              </span>
            </div>
            <div
              class="shortcut-capture"
              :class="{ recording: isRecording }"
              tabindex="0"
              role="button"
              :aria-label="isRecording ? '正在录制快捷键' : '点击设置快捷键'"
              ref="shortcutInput"
              @click="startRecording"
              @blur="onBlur"
              @keydown="onKeyDown"
              @keyup="onKeyUp"
            >
              <template v-if="displayKeyParts.length">
                <kbd
                  v-for="(key, index) in displayKeyParts"
                  :key="`${key}-${index}`"
                  class="keycap"
                >
                  {{ key }}
                </kbd>
              </template>
              <span v-else class="shortcut-hint">按下快捷键…</span>
            </div>
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
              src="/icon.png"
              alt="MemoPaste"
              :preview-src-list="['/icon.png']"
              fit="cover"
            />
            <div class="about-intro-text">
              <div class="about-name">MemoPaste</div>
              <p class="about-desc">
                剪贴板管理工具，帮助您管理和组织剪贴板内容。基于 Electron +
                Vue + Vite 构建。
              </p>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">当前版本</span>
              <span class="setting-desc">MemoPaste v{{ appVersion }}</span>
            </div>
            <el-button
              :loading="isLoading"
              class="action-btn"
              @click="checkForUpdates"
            >
              检查更新
            </el-button>
          </div>

          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-label">更新日志</span>
              <span class="setting-desc">查看版本更新历史</span>
            </div>
            <el-button class="action-btn" @click="viewChangelog">
              查看日志
            </el-button>
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
  width: 48px;
  height: 48px;
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
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 25%, transparent);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 3px;
    border-radius: 8px;
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
    background: #f4f4f4;

    .preview-sidebar {
      background: #fafafa;
      border-right: 1px solid #e5e5e5;
    }

    .preview-line {
      background: #d4d4d4;
    }
  }

  &.dark {
    background: #111111;

    .preview-sidebar {
      background: #151515;
      border-right: 1px solid #2a2a2a;
    }

    .preview-line {
      background: #3a3a3a;
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
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
}

.shortcut-capture {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 180px;
  min-height: 40px;
  padding: 6px 14px;
  border-radius: 10px;
  border: 1.5px dashed var(--border-medium);
  background: var(--bg-tertiary);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
  flex-shrink: 0;

  &:hover {
    border-color: var(--accent-primary);
  }

  &.recording {
    border-style: solid;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 18%, transparent);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--accent-primary);
  }
}

.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--border-medium);
  background: var(--bg-secondary);
  box-shadow: 0 1px 0 var(--border-medium);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.shortcut-hint {
  font-size: 12px;
  color: var(--text-tertiary);
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

  .shortcut-capture,
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
