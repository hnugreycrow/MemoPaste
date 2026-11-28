import { ref, computed, type Ref } from "vue";
import {
  validateShortcut,
  normalizeShortcut,
  formatShortcutForDisplay,
  normalKeyFromCode,
} from "@shared/shortcut";

const MODIFIER_KEY_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

const DEFAULT_RECORD_HINT = "按住 Ctrl / Alt 不放，再按普通键（Esc 取消）";

export type ShortcutCommitResult = {
  success: boolean;
  shortcut?: string;
  error?: string;
};

export type ShortcutRecorderOptions = {
  isRegistered?: Ref<boolean>;
  onSuspendChange?: (suspended: boolean) => void | Promise<void>;
  onFeedback?: (type: "success" | "error", text: string) => void;
};

/**
 * 全局快捷键录制逻辑：预览、校验、命中合法组合即提交。
 * 录制期间临时暂停当前全局快捷键，避免按到原快捷键直接关闭浮窗。
 */
export function useShortcutRecorder(
  shortcut: Ref<string>,
  commit: (next: string) => Promise<ShortcutCommitResult>,
  options: ShortcutRecorderOptions = {},
) {
  const tempKeys = ref<string[]>([]);
  const isRecording = ref(false);
  const recordHint = ref("");
  const recordInvalid = ref(false);
  const captureEl = ref<HTMLElement | null>(null);
  let committing = false;

  const displayKeyParts = computed(() => {
    const raw = isRecording.value ? tempKeys.value.join("+") : shortcut.value;
    return formatShortcutForDisplay(raw);
  });

  const collectModifiers = (e: KeyboardEvent): string[] => {
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("CommandOrControl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    return mods;
  };

  const updateModifierPreview = (mods: string[]) => {
    tempKeys.value = mods;
    recordInvalid.value = false;
    if (mods.length === 1 && mods[0] === "Shift") {
      recordHint.value = "需同时按住 Ctrl 或 Alt，再按普通键…";
    } else if (mods.length > 0) {
      recordHint.value = "保持按住，再按字母、数字、空格或常用符号…";
    } else {
      recordHint.value = DEFAULT_RECORD_HINT;
    }
  };

  const stopRecording = () => {
    const wasRecording = isRecording.value;
    isRecording.value = false;
    committing = false;
    tempKeys.value = [];
    recordHint.value = "";
    recordInvalid.value = false;
    if (wasRecording) {
      void options.onSuspendChange?.(false);
    }
  };

  const startRecording = () => {
    if (isRecording.value) {
      captureEl.value?.focus();
      return;
    }
    committing = false;
    tempKeys.value = [];
    recordHint.value = DEFAULT_RECORD_HINT;
    recordInvalid.value = false;
    isRecording.value = true;
    void options.onSuspendChange?.(true);
    captureEl.value?.focus();
  };

  const onBlur = () => {
    stopRecording();
  };

  const onKeyDown = async (e: KeyboardEvent) => {
    if (!isRecording.value) return;

    e.preventDefault();
    e.stopPropagation();

    if (committing || e.repeat) return;

    if (e.key === "Escape") {
      stopRecording();
      captureEl.value?.blur();
      return;
    }

    if (e.metaKey || e.code === "MetaLeft" || e.code === "MetaRight") {
      tempKeys.value = [];
      recordInvalid.value = true;
      recordHint.value = "不支持 Win 键，请按住 Ctrl 或 Alt";
      return;
    }

    const mods = collectModifiers(e);
    if (MODIFIER_KEY_CODES.has(e.code)) {
      updateModifierPreview(mods);
      return;
    }

    const normalKey = normalKeyFromCode(e.code);
    if (!normalKey) {
      tempKeys.value = mods;
      recordInvalid.value = true;
      recordHint.value = "不支持此键，请使用字母、数字、空格、F1-F12 或常用符号";
      return;
    }

    tempKeys.value = [...mods, normalKey];
    const check = validateShortcut(tempKeys.value.join("+"));
    if (!check.success) {
      recordInvalid.value = true;
      recordHint.value = check.error;
      return;
    }

    const newShortcut = check.shortcut;
    if (newShortcut === normalizeShortcut(shortcut.value) && options.isRegistered?.value !== false) {
      stopRecording();
      captureEl.value?.blur();
      return;
    }

    const previous = shortcut.value;
    shortcut.value = newShortcut;
    recordInvalid.value = false;
    recordHint.value = "正在保存…";
    committing = true;

    try {
      const result = await commit(newShortcut);
      stopRecording();
      captureEl.value?.blur();
      if (!result?.success) {
        shortcut.value = result?.shortcut || previous;
        options.onFeedback?.("error", `快捷键设置失败：${result?.error ?? "未知错误"}`);
      } else {
        shortcut.value = result.shortcut ?? newShortcut;
        options.onFeedback?.("success", "快捷键已更新");
      }
    } catch (error) {
      shortcut.value = previous;
      stopRecording();
      captureEl.value?.blur();
      options.onFeedback?.("error", `快捷键设置失败：${error}`);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (!isRecording.value) return;
    e.preventDefault();
    e.stopPropagation();

    if (!committing && MODIFIER_KEY_CODES.has(e.code)) {
      updateModifierPreview(collectModifiers(e));
    }
  };

  return {
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
  };
}
