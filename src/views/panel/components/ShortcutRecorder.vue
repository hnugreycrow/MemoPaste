<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useShortcutRecorder } from "../composables/useShortcutRecorder";

const shortcut = defineModel<string>("shortcut", { required: true });

const emit = defineEmits<{
  feedback: [payload: { type: "success" | "error"; text: string }];
  recordingChange: [recording: boolean];
}>();

const {
  captureEl,
  isRecording,
  recordHint,
  recordInvalid,
  displayKeyParts,
  startRecording,
  onBlur,
  onKeyDown,
  onKeyUp,
} = useShortcutRecorder(
  shortcut,
  async (next) => window.shortcut.update(next),
  (type, text) => emit("feedback", { type, text }),
);

watch(isRecording, (val) => {
  emit("recordingChange", val);
});

onMounted(async () => {
  try {
    const current = await window.shortcut.get();
    if (current) {
      shortcut.value = current;
    }
  } catch (error) {
    console.error("获取快捷键失败:", error);
  }
});
</script>

<template>
  <div class="shortcut-capture-wrap">
    <div
      ref="captureEl"
      class="shortcut-capture"
      :class="{
        recording: isRecording,
        invalid: isRecording && recordInvalid,
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
    <span
      v-if="isRecording && recordHint"
      class="shortcut-record-tip"
      :class="{ error: recordInvalid }"
    >
      {{ recordHint }}
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.shortcut-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
