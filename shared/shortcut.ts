/**
 * 快捷键规则（主进程 / 渲染进程共用）
 *
 * 规范名与 Electron Accelerator 对齐：
 * - 修饰键：CommandOrControl、Alt、Shift（Windows 端暂不支持 Super/Win）
 * - 普通键：A–Z、0–9、num0–num9、F1–F12、Space、常见符号（` - = [ ] \ ; , . /）
 * - 至少包含一个强修饰键（Ctrl / Alt），Shift 可叠加
 * - 禁止系统/高频编辑组合（见 RESERVED_SHORTCUTS）
 */

export const DEFAULT_SHORTCUT = "Alt+V";

export type ShortcutValidationResult =
  | { success: true; shortcut: string }
  | { success: false; error: string };

const MODIFIER_ORDER = ["CommandOrControl", "Alt", "Shift", "Super"] as const;

type CanonicalModifier = (typeof MODIFIER_ORDER)[number];

/** 除 Shift 外的强修饰键：至少需要其中一个 */
const STRONG_MODIFIERS = new Set<CanonicalModifier>(["CommandOrControl", "Alt"]);

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

const NORMAL_KEY_RE = /^([A-Z0-9]|num[0-9]|F([1-9]|1[0-2])|Space|[`\-=[\]\\;,./])$/;

/** 规范化后禁止注册的系统/高频常用组合 */
const RESERVED_SHORTCUTS = new Set([
  "CommandOrControl+A",
  "CommandOrControl+C",
  "CommandOrControl+V",
  "CommandOrControl+X",
  "CommandOrControl+Z",
  "CommandOrControl+Y",
  "CommandOrControl+S",
  "CommandOrControl+W",
  "CommandOrControl+Q",
  "CommandOrControl+R",
  "CommandOrControl+F",
  "CommandOrControl+T",
  "CommandOrControl+N",
  "CommandOrControl+P",
  "CommandOrControl+Space",
  "Alt+F4",
]);

const CODE_TO_PUNCTUATION: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

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

    if (/^[a-z]$/i.test(part)) {
      others.push(part.toUpperCase());
    } else if (/^f([1-9]|1[0-2])$/i.test(part)) {
      others.push(part.toUpperCase());
    } else if (/^num[0-9]$/i.test(part)) {
      others.push(part.toLowerCase());
    } else if (part.toLowerCase() === "space") {
      others.push("Space");
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

  if (modifiers.includes("Super")) {
    return {
      success: false,
      error: "不支持 Win 键，请使用 Ctrl 或 Alt",
    };
  }

  if (modifiers.length === 0 || normalKeys.length === 0) {
    return {
      success: false,
      error: "请按住 Ctrl 或 Alt，再搭配一个普通键",
    };
  }

  if (normalKeys.length > 1) {
    return { success: false, error: "只能包含一个普通键" };
  }

  if (!modifiers.some((m) => STRONG_MODIFIERS.has(m as CanonicalModifier))) {
    return {
      success: false,
      error: "请至少包含 Ctrl 或 Alt",
    };
  }

  const normalKey = normalKeys[0];
  if (!NORMAL_KEY_RE.test(normalKey)) {
    return {
      success: false,
      error: "不支持此键，请使用字母、数字、空格、F1-F12 或常用符号",
    };
  }

  if (RESERVED_SHORTCUTS.has(normalized)) {
    return {
      success: false,
      error: "该快捷键为系统或高频常用组合，请换一个",
    };
  }

  return { success: true, shortcut: normalized };
}

/**
 * UI 展示用：CommandOrControl → Ctrl，Super → Win，num0–9 → Num0–9
 */
export function formatShortcutForDisplay(shortcut: string): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map((key) => {
    if (key === "CommandOrControl") return "Ctrl";
    if (key === "Super") return "Win";
    if (/^num[0-9]$/i.test(key)) return `Num${key.slice(3)}`;
    return key;
  });
}

/**
 * 从 KeyboardEvent.code 解析普通键（与白名单对齐）。
 * 仅修饰键或不支持的键返回 null。
 */
export function normalKeyFromCode(code: string): string | null {
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  if (/^Numpad[0-9]$/.test(code)) {
    return `num${code.slice(6)}`;
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }
  if (code === "Space") {
    return "Space";
  }
  return CODE_TO_PUNCTUATION[code] ?? null;
}
