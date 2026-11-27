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
const dataRetentionDays = ref(7);
const appVersion = ref("–");
const saving = ref<Record<string, boolean>>({});

const retentionOptions = [1, 3, 7, 30];

const theme = computed(() => themeService.currentTheme.value);

onMounted(async () => {
  try {
    const [login, days, version] = await Promise.all([
      window.config.get<boolean>("openAtLogin"),
      window.config.get<number>("dataRetentionDays"),
      window.app.getVersion(),
    ]);
    openAtLogin.value = login ?? false;
    dataRetentionDays.value = days ?? 7;
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

const handleRetentionChange = async (days: number) => {
  if (saving.value.dataRetentionDays || days === dataRetentionDays.value) return;
  const previous = dataRetentionDays.value;
  dataRetentionDays.value = days;
  saving.value.dataRetentionDays = true;
  try {
    if (!(await window.config.set("dataRetentionDays", days))) {
      throw new Error("保存失败");
    }
    emit("feedback", { type: "success", text: `非收藏历史将保留 ${days} 天` });
  } catch {
    dataRetentionDays.value = previous;
    emit("feedback", { type: "error", text: "保留天数保存失败" });
  } finally {
    saving.value.dataRetentionDays = false;
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
      <span class="sub-title">设置</span>
    </header>

    <div class="settings-body">
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
          <span class="row-desc">切换浅色或深色界面</span>
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

      <div class="setting-row retention-row">
        <div class="row-info">
          <span class="row-label">自动清理</span>
          <span class="row-desc">启动时清理超时非收藏记录（常用不受影响）</span>
        </div>
        <div class="segmented" role="radiogroup" aria-label="历史保留天数">
          <button
            v-for="days in retentionOptions"
            :key="days"
            type="button"
            class="seg-btn"
            :class="{ active: dataRetentionDays === days }"
            role="radio"
            :aria-checked="dataRetentionDays === days"
            @click="handleRetentionChange(days)"
          >
            {{ days }}天
          </button>
        </div>
      </div>
    </div>

    <footer class="settings-footer">
      <span class="version-text">MemoPaste v{{ appVersion }}</span>
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
  padding: 10px 12px 8px;
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
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-tertiary);

  &.retention-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.row-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.35;
}

.segmented {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  flex-shrink: 0;

  .retention-row & {
    width: 100%;
  }
}

.seg-btn {
  min-width: 44px;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  .retention-row & {
    flex: 1;
  }

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-primary);
    color: var(--accent-on-primary, #fff);
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
  transition: background-color 0.15s ease;

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
  transition: transform 0.15s ease;

  .toggle-switch.checked & {
    transform: translateX(16px);
  }
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border-light);
  background: color-mix(in srgb, var(--bg-primary) 50%, transparent);
}

.version-text {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.quit-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--accent-danger) 40%, transparent);
  background: color-mix(in srgb, var(--accent-danger) 10%, transparent);
  color: var(--accent-danger);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease;

  &:hover {
    background: color-mix(in srgb, var(--accent-danger) 18%, transparent);
    border-color: var(--accent-danger);
  }
}
</style>
