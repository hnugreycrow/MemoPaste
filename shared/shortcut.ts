/**
 * 快捷键规则（主进程 / 渲染进程共用）
 *
 * 规范名与 Electron Accelerator 对齐：
 * - 修饰键：CommandOrControl、Alt、Shift、Super
 * - 普通键：A–Z、0–9、F1–F12、`
 * - 至少包含一个强修饰键（Ctrl / Alt / Win），Shift 可叠加
 * - 禁止系统/常用组合（见 RESERVED_SHORTCUTS）
 */

export type ShortcutValidationResult =
  | { success: true; shortcut: string }
  | { success: false; error: string };

const MODIFIER_ORDER = [
  "CommandOrControl",
  "Alt",
  "Shift",
  "Super",
] as const;

type CanonicalModifier = (typeof MODIFIER_ORDER)[number];

/** 除 Shift 外的强修饰键：至少需要其中一个 */
const STRONG_MODIFIERS = new Set<CanonicalModifier>([
  "CommandOrControl",
  "Alt",
  "Super",
]);

const MODIFIER_ALIASES: Record<string, CanonicalModifier> = {
  commandorcontrol: "CommandOrControl",
  ctrl: "CommandOrControl",
  control: "CommandOrControl",
  command: "CommandOrControl",
  cmd: "CommandOrControl",
  meta: "Super",
  super: "Super",
  win: "Super",
  windows: "Super",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};

const NORMAL_KEY_RE = /^([A-Z0-9]|F([1-9]|1[0-2])|`)$/;

/** 规范化后禁止注册的系统/常用组合 */
const RESERVED_SHORTCUTS = new Set([
  "CommandOrControl+A",
  "CommandOrControl+C",
  "CommandOrControl+V",
  "CommandOrControl+X",
  "CommandOrControl+Z",
  "CommandOrControl+S",
  "Alt+F4",
]);

/**
 * 将快捷键字符串规范为 Electron accelerator 形式。
 * 修饰键按固定顺序排列；无法识别的片段原样保留（由 validate 拒绝）。
 */
export function normalizeShortcut(shortcut: string): string {
  if (!shortcut || typeof shortcut !== "string") return "";

  const parts = shortcut
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return "";

  const modifiers = new Set<CanonicalModifier>();
  const others: string[] = [];

  for (const part of parts) {
    const alias = MODIFIER_ALIASES[part.toLowerCase()];
    if (alias) {
      modifiers.add(alias);
      continue;
    }

    // 字母统一大写；F 键保持 F1 形式；反引号保持 `
    if (/^[a-z]$/i.test(part)) {
      others.push(part.toUpperCase());
    } else if (/^f([1-9]|1[0-2])$/i.test(part)) {
      others.push(part.toUpperCase());
    } else {
      others.push(part);
    }
  }

  const orderedMods = MODIFIER_ORDER.filter((m) => modifiers.has(m));
  return [...orderedMods, ...others].join("+");
}

/**
 * 校验并返回规范化后的快捷键。
 */
export function validateShortcut(shortcut: string): ShortcutValidationResult {
  if (!shortcut || typeof shortcut !== "string") {
    return { success: false, error: "请输入有效的快捷键组合" };
  }

  const normalized = normalizeShortcut(shortcut);
  if (!normalized) {
    return { success: false, error: "请输入有效的快捷键组合" };
  }

  const keys = normalized.split("+");
  const canonicalMods = new Set<string>(MODIFIER_ORDER);

  const modifiers: string[] = [];
  const normalKeys: string[] = [];

  for (const key of keys) {
    if (canonicalMods.has(key)) {
      modifiers.push(key);
    } else {
      normalKeys.push(key);
    }
  }

  if (modifiers.length === 0 || normalKeys.length === 0) {
    return {
      success: false,
      error: "格式不正确！快捷键必须包含修饰键和普通键",
    };
  }

  if (normalKeys.length > 1) {
    return { success: false, error: "只能包含一个普通键" };
  }

  if (!modifiers.some((m) => STRONG_MODIFIERS.has(m as CanonicalModifier))) {
    return {
      success: false,
      error: "请至少包含 Ctrl、Alt 或 Win",
    };
  }

  const normalKey = normalKeys[0];
  if (!NORMAL_KEY_RE.test(normalKey)) {
    return {
      success: false,
      error: "普通键无效！请使用字母、数字、F1-F12 或 `",
    };
  }

  if (RESERVED_SHORTCUTS.has(normalized)) {
    return {
      success: false,
      error: "该快捷键为系统或常用组合，请换一个",
    };
  }

  return { success: true, shortcut: normalized };
}

/**
 * UI 展示用：CommandOrControl → Ctrl，Super → Win
 */
export function formatShortcutForDisplay(shortcut: string): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map((key) => {
    if (key === "CommandOrControl") return "Ctrl";
    if (key === "Super") return "Win";
    return key;
  });
}

/**
 * 从 KeyboardEvent.code 解析普通键（与白名单对齐）。
 * 仅修饰键时返回 null。
 */
export function normalKeyFromCode(code: string): string | null {
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith("Numpad") && /^Numpad\d$/.test(code)) {
    return code.slice(6);
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }
  if (code === "Backquote") {
    return "`";
  }
  return null;
}
