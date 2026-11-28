<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { DEFAULT_SHORTCUT, normalizeShortcut } from "@shared/shortcut";
import { useShortcutRecorder } from "../composables/useShortcutRecorder";

const shortcut = defineModel<string>("shortcut", { required: true });

const emit = defineEmits<{
  feedback: [payload: { type: "success" | "error"; text: string }];
  recordingChange: [recording: boolean];
}>();

const registered = ref(true);
const statusError = ref<string | null>(null);
const updating = ref(false);

const refreshStatus = async () => {
  try {
    const status = await window.shortcut.getStatus();
    if (status) {
      if (status.shortcut) {
        shortcut.value = status.shortcut;
      }
      registered.value = status.registered;
      statusError.value = status.error;
    }
  } catch (error) {
    console.error("获取快捷键状态失败:", error);
  }
};

const commitShortcut = async (next: string) => {
  updating.value = true;
  try {
    const result = await window.shortcut.update(next);
    await refreshStatus();
    return result;
  } finally {
    updating.value = false;
  }
};

const {
  captureEl,
  isRecording,
  recordHint,
  recordInvalid,
  displayKeyParts,
  startRecording,
  stopRecording,
  onBlur,
  onKeyDown,
  onKeyUp,
} = useShortcutRecorder(shortcut, commitShortcut, {
  isRegistered: registered,
  onSuspendChange: (suspended) => window.shortcut.setSuspended(suspended),
  onFeedback: (type, text) => emit("feedback", { type, text }),
});

const isDefaultShortcut = computed(
  () => normalizeShortcut(shortcut.value) === normalizeShortcut(DEFAULT_SHORTCUT),
);

const showConflict = computed(() => !isRecording.value && !registered.value);

const quickActionLabel = computed(() => {
  if (isRecording.value) return "";
  if (!isDefaultShortcut.value) return "恢复默认";
  if (!registered.value) return "重试";
  return "";
});

const handleQuickAction = async () => {
  if (updating.value || isRecording.value) return;
  const target = isDefaultShortcut.value ? shortcut.value : DEFAULT_SHORTCUT;
  try {
    const result = await commitShortcut(target);
    if (!result?.success) {
      emit("feedback", {
        type: "error",
        text: `快捷键设置失败：${result?.error ?? "未知错误"}`,
      });
    } else {
      emit("feedback", {
        type: "success",
        text: isDefaultShortcut.value ? "快捷键已重新生效" : "已恢复默认快捷键",
      });
    }
  } catch (error) {
    emit("feedback", { type: "error", text: `快捷键设置失败：${error}` });
  }
};

watch(isRecording, (val) => {
  emit("recordingChange", val);
});

onMounted(() => {
  void refreshStatus();
});

onUnmounted(() => {
  stopRecording();
});
</script>

<template>
  <div class="shortcut-capture-wrap">
    <div class="shortcut-controls">
      <button
        v-if="quickActionLabel"
        type="button"
        class="shortcut-action-btn"
        :disabled="updating"
        @click="handleQuickAction"
      >
        {{ quickActionLabel }}
      </button>
      <div
        ref="captureEl"
        class="shortcut-capture"
        :class="{
          recording: isRecording,
          invalid: (isRecording && recordInvalid) || showConflict,
        }"
        tabindex="0"
        role="button"
        :aria-label="isRecording ? '正在录制快捷键' : '点击设置快捷键'"
        @click="startRecording"
        @blur="onBlur"
        @keydown="onKeyDown"
        @keyup="onKeyUp"
      >
        <template v-if="displayKeyParts.length">
          <kbd v-for="(key, index) in displayKeyParts" :key="`${key}-${index}`" class="keycap">
            {{ key }}
          </kbd>
        </template>
        <span v-else class="shortcut-hint">按下快捷键…</span>
      </div>
    </div>
    <span
      v-if="isRecording && recordHint"
      class="shortcut-record-tip"
      :class="{ error: recordInvalid }"
    >
      {{ recordHint }}
    </span>
    <span v-else-if="showConflict" class="shortcut-record-tip error">
      {{ statusError || "快捷键已被占用，请点击重新设置" }}
    </span>
  </div>
</template>

<style lang="scss" scoped>
.shortcut-capture-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  max-width: 100%;
}

.shortcut-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.shortcut-action-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  transition:
    color 0.12s ease,
    background-color 0.12s ease;

  &:hover:not(:disabled) {
    color: var(--accent-primary);
    background: var(--bg-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.shortcut-capture {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 96px;
  min-height: 30px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    box-shadow 0.14s ease,
    background-color 0.14s ease;

  &:hover {
    border-color: var(--accent-primary);
  }

  &.recording {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
    box-shadow: 0 0 0 2.5px var(--accent-soft);
  }

  &.invalid {
    border-color: var(--accent-danger);
    box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--accent-danger) 20%, transparent);
  }
}

.shortcut-record-tip {
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-tertiary);
  text-align: right;

  &.error {
    color: var(--accent-danger);
  }
}

.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 21px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid var(--border-light);
  background: var(--bg-tertiary);
  box-shadow: 0 1px 0 var(--border-medium);
  font-family: "Cascadia Mono", Consolas, ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1;
}

.shortcut-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
