import { ref, computed, type Ref } from "vue";
import {
  validateShortcut,
  normalizeShortcut,
  formatShortcutForDisplay,
  normalKeyFromCode,
} from "@shared/shortcut";

/** KeyboardEvent.code：仅修饰键本身（用于区分「按住 Ctrl」与「Ctrl+字母」） */
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

export type ShortcutCommitResult = {
  success: boolean;
  shortcut?: string;
  error?: string;
};

/**
 * 全局快捷键录制逻辑：预览、即时校验、松键后提交。
 * UI（keycap / 提示条）由 ShortcutRecorder 组件负责。
 */
export function useShortcutRecorder(
  shortcut: Ref<string>,
  commit: (next: string) => Promise<ShortcutCommitResult>,
) {
  /** 录制中的按键预览（规范化片段，如 CommandOrControl、A） */
  const tempKeys = ref<string[]>([]);
  const isRecording = ref(false);
  /** 录制引导 / 错误提示文案 */
  const recordHint = ref("");
  /** 当前预览组合是否校验失败（用于标红） */
  const recordInvalid = ref(false);
  const captureEl = ref<HTMLElement | null>(null);

  /** 展示用 keycap：录制中看预览，否则看已保存值 */
  const displayKeyParts = computed(() => {
    const raw = isRecording.value
      ? tempKeys.value.length > 0
        ? tempKeys.value.join("+")
        : ""
      : shortcut.value;

    return formatShortcutForDisplay(raw);
  });

  /** 从事件收集修饰键；Win/Cmd 映射为 Super（Ctrl 按下时忽略 meta，避免重复） */
  const collectModifiers = (e: KeyboardEvent): string[] => {
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("CommandOrControl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey && !e.ctrlKey) mods.push("Super");
    return mods;
  };

  /** 结束录制并清空预览状态 */
  const stopRecording = () => {
    isRecording.value = false;
    tempKeys.value = [];
    recordHint.value = "";
    recordInvalid.value = false;
  };

  const startRecording = () => {
    tempKeys.value = [];
    recordHint.value = "按下 Ctrl / Alt / Win，再按普通键";
    recordInvalid.value = false;
    isRecording.value = true;
    captureEl.value?.focus();
  };

  const onBlur = () => {
    stopRecording();
  };

  /**
   * 录制 keydown：即时预览 + 校验反馈，不在此处提交。
   * - Esc：取消
   * - 仅修饰键：引导继续按普通键
   * - 不支持的普通键 / 弱组合 / 黑名单：标红提示，保持录制
   * - 合法组合：提示松开确认
   */
  const onKeyDown = (e: KeyboardEvent) => {
    if (!isRecording.value) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      stopRecording();
      captureEl.value?.blur();
      return;
    }

    const mods = collectModifiers(e);

    if (MODIFIER_KEY_CODES.has(e.code)) {
      tempKeys.value = mods;
      recordInvalid.value = false;
      recordHint.value = mods.length
        ? "再按一个字母、数字或 F 键…"
        : "按下 Ctrl / Alt / Win，再按普通键";
      return;
    }

    const normalKey = normalKeyFromCode(e.code);
    if (!normalKey) {
      tempKeys.value = mods;
      recordInvalid.value = true;
      recordHint.value = "不支持此键";
      return;
    }

    tempKeys.value = [...mods, normalKey];
    const check = validateShortcut(tempKeys.value.join("+"));
    if (!check.success) {
      recordInvalid.value = true;
      recordHint.value = check.error;
      return;
    }

    recordInvalid.value = false;
    recordHint.value = "松开按键以确认";
  };

  /**
   * 录制 keyup：仅在预览合法时提交。
   * 修饰键抬起不提交，便于先按 Ctrl 再按字母。
   */
  const onKeyUp = async (e: KeyboardEvent) => {
    if (!isRecording.value) return;
    if (e.key === "Escape") return;
    if (MODIFIER_KEY_CODES.has(e.code)) return;
    if (tempKeys.value.length === 0 || recordInvalid.value) return;

    const recorded = tempKeys.value.join("+");
    const checkResult = validateShortcut(recorded);
    if (!checkResult.success) {
      recordInvalid.value = true;
      recordHint.value = checkResult.error;
      return;
    }

    const newShortcut = checkResult.shortcut;
    if (newShortcut === normalizeShortcut(shortcut.value)) {
      stopRecording();
      captureEl.value?.blur();
      return;
    }

    const previous = shortcut.value;
    shortcut.value = newShortcut;

    try {
      const result = await commit(newShortcut);
      stopRecording();
      captureEl.value?.blur();
      if (!result?.success) {
        shortcut.value = result?.shortcut || previous;
        ElMessage.error(`快捷键设置失败: ${result?.error ?? "未知错误"}`);
      } else {
        shortcut.value = result.shortcut ?? newShortcut;
        ElMessage.success("快捷键设置成功");
      }
    } catch (error) {
      shortcut.value = previous;
      stopRecording();
      captureEl.value?.blur();
      ElMessage.error(`快捷键设置失败: ${error}`);
    }
  };

  return {
    captureEl,
    isRecording,
    recordHint,
    recordInvalid,
    displayKeyParts,
    startRecording,
    onBlur,
    onKeyDown,
    onKeyUp,
  };
}
