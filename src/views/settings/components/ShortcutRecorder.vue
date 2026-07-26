<script setup lang="ts">
import { onMounted } from "vue";
import { useShortcutRecorder } from "../composables/useShortcutRecorder";

const shortcut = defineModel<string>("shortcut", { required: true });

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
} = useShortcutRecorder(shortcut, async (next) => {
  return window.shortcut.update(next);
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
  gap: 6px;
  flex-shrink: 0;
  max-width: 100%;
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
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--accent-primary) 18%, transparent);
  }

  &.invalid {
    border-color: var(--el-color-danger, #f56c6c);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--el-color-danger, #f56c6c) 18%, transparent);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--accent-primary);
  }
}

.shortcut-record-tip {
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-tertiary);
  text-align: right;
  max-width: 220px;

  &.error {
    color: var(--el-color-danger, #f56c6c);
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

@media (max-width: 720px) {
  .shortcut-capture-wrap,
  .shortcut-capture {
    width: 100%;
  }

  .shortcut-capture-wrap {
    align-items: stretch;
  }

  .shortcut-record-tip {
    text-align: left;
    max-width: none;
  }
}
</style>
