<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { themeService, type ThemeType } from "@/utils/theme";
import ShortcutRecorder from "./ShortcutRecorder.vue";

const emit = defineEmits<{
  back: [];
  feedback: [payload: { type: "success" | "error"; text: string }];
  recordingChange: [recording: boolean];
}>();

const shortcut = ref("Alt+V");
const openAtLogin = ref(false);
const appVersion = ref("–");
const saving = ref<Record<string, boolean>>({});
const appIconUrl = `${import.meta.env.BASE_URL}icon.png`;

const theme = computed(() => themeService.currentTheme.value);

onMounted(async () => {
  try {
    const [login, version] = await Promise.all([
      window.config.get<boolean>("openAtLogin"),
      window.app.getVersion(),
    ]);
    openAtLogin.value = login ?? false;
    if (version) appVersion.value = version;
  } catch (error) {
    console.error("加载设置失败:", error);
  }
});

const handleThemeChange = async (next: ThemeType) => {
  const ok = await themeService.setTheme(next);
  if (!ok) {
    emit("feedback", { type: "error", text: "主题保存失败，请重试" });
  }
};

const handleOpenAtLoginToggle = async () => {
  if (saving.value.openAtLogin) return;
  const previous = openAtLogin.value;
  const next = !previous;
  openAtLogin.value = next;
  saving.value.openAtLogin = true;
  try {
    const result = await window.app.setOpenAtLogin(next);
    if (!result?.success) {
      openAtLogin.value = previous;
      emit("feedback", {
        type: "error",
        text: `开机自启设置失败：${result?.error ?? "未知错误"}`,
      });
      return;
    }
    openAtLogin.value = result.openAtLogin;
    if (!result.applied) {
      emit("feedback", { type: "success", text: "已保存（打包后生效）" });
    }
  } catch (error) {
    openAtLogin.value = previous;
    emit("feedback", { type: "error", text: `开机自启设置失败：${error}` });
  } finally {
    saving.value.openAtLogin = false;
  }
};

const handleQuit = () => {
  window.app.quit();
};
</script>

<template>
  <section class="settings-view" aria-label="设置">
    <header class="sub-header">
      <button type="button" class="back-btn" title="返回列表 (Esc)" @click="emit('back')">
        <i-ep-ArrowLeft />
        <span>返回</span>
      </button>
      <span class="sub-title">偏好设置</span>
    </header>

    <div class="settings-body">
      <div class="settings-group">
        <div class="setting-row shortcut-row">
          <div class="row-info">
            <span class="row-label">唤起快捷键</span>
            <span class="row-desc">全局呼出或隐藏浮窗</span>
          </div>
          <ShortcutRecorder
            v-model:shortcut="shortcut"
            @feedback="emit('feedback', $event)"
            @recording-change="emit('recordingChange', $event)"
          />
        </div>

        <div class="setting-row">
          <div class="row-info">
            <span class="row-label">外观主题</span>
            <span class="row-desc">切换宣纸浅色或暖炭深色</span>
          </div>
          <div class="segmented" role="radiogroup" aria-label="外观主题">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: theme === 'light' }"
              role="radio"
              :aria-checked="theme === 'light'"
              @click="handleThemeChange('light')"
            >
              浅色
            </button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: theme === 'dark' }"
              role="radio"
              :aria-checked="theme === 'dark'"
              @click="handleThemeChange('dark')"
            >
              深色
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="row-info">
            <span class="row-label">开机自启</span>
            <span class="row-desc">登录系统后静默常驻托盘</span>
          </div>
          <button
            type="button"
            class="toggle-switch"
            :class="{ checked: openAtLogin }"
            role="switch"
            :aria-checked="openAtLogin"
            :disabled="saving.openAtLogin"
            aria-label="开机自启"
            @click="handleOpenAtLoginToggle"
          >
            <span class="toggle-knob" />
          </button>
        </div>
      </div>

      <p class="retention-note">非收藏历史 24 小时后自动清理，常用收藏永久保留。</p>
    </div>

    <footer class="settings-footer">
      <div class="brand-badge">
        <img class="brand-icon" :src="appIconUrl" alt="" draggable="false" />
        <span class="version-text">MemoPaste v{{ appVersion }}</span>
      </div>
      <button type="button" class="quit-btn" @click="handleQuit">退出应用</button>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.sub-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 10px 2px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-light);
  -webkit-app-region: drag;
}

.back-btn {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px 0 6px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background: var(--bg-hover);
  }
}

.sub-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-group {
  border-radius: 11px;
  border: 1px solid var(--border-light);
  background: var(--bg-tertiary);
  box-shadow: var(--top-highlight);
  overflow: hidden;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 13px;

  & + & {
    border-top: 1px solid var(--border-light);
  }
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.row-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.segmented {
  display: inline-flex;
  padding: 2.5px;
  gap: 2px;
  border-radius: 8px;
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.seg-btn {
  min-width: 44px;
  height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    box-shadow 0.14s ease;

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    background: var(--bg-seg-active);
    color: var(--accent-primary);
    font-weight: 500;
    box-shadow: var(--shadow-seg);
  }
}

.toggle-switch {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 2px;
  border: none;
  border-radius: 999px;
  background: var(--border-medium);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.16s ease;

  &.checked {
    background: var(--accent-primary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.toggle-knob {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1);

  .toggle-switch.checked & {
    transform: translateX(16px);
  }
}

.retention-note {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-elevated);
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.brand-icon {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: block;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}

.version-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.quit-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent-danger) 35%, transparent);
  background: color-mix(in srgb, var(--accent-danger) 9%, transparent);
  color: var(--accent-danger);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;

  &:hover {
    background: color-mix(in srgb, var(--accent-danger) 16%, transparent);
    border-color: var(--accent-danger);
  }
}
</style>
