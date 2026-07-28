export type ContentType = "text" | "url" | "code";

/** 整段内容是 URL（不含弱匹配 / 邮箱） */
const URL_WHOLE =
  /^(https?:\/\/|www\.)[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,}(:[0-9]{1,5})?(\/[^\s]*)?(\?[^\s]*)?$/i;

/** 完整 HTML/XML 片段 */
const HTML_COMPLETE = /^\s*<[\w-]+[^>]*>[\s\S]*<\/[\w-]+>\s*$/;

/** 行首常见代码语句 */
const CODE_LINE_START =
  /^\s*(import\b|export\b|function\b|const\b|let\b|var\b|class\b|def\b|async\b|#include\b|package\b|using\b|fn\b|pub\b)/m;

/** 典型代码运算符 */
const CODE_OPERATORS = /=>|===|!==|\?\?|\?\.|\+\+|--/;

const JSON_PARSE_MAX = 10_000;

function isJsonObjectOrArray(content: string): boolean {
  if (content.length > JSON_PARSE_MAX) return false;
  if (!(content.startsWith("{") || content.startsWith("["))) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

/** 多行且结构像代码 */
function looksLikeCode(content: string): boolean {
  const lines = content.split("\n");
  if (lines.length < 2) return false;
  if (CODE_LINE_START.test(content)) return true;
  const hasBraces = content.includes("{") && content.includes("}");
  const hasOperator = CODE_OPERATORS.test(content) || /;\s*$/m.test(content);
  return hasBraces && hasOperator;
}

/**
 * 推断剪贴板内容的类型（优先级：url → code → text）
 * @example
 * getContentType("https://a.com") // => "url"
 * getContentType('{"a":1}') // => "code"
 */
export const getContentType = (content: string): ContentType => {
  const text = content.trim();
  if (text.length < 2) return "text";

  if (URL_WHOLE.test(text)) return "url";

  if (isJsonObjectOrArray(text)) return "code";
  if (HTML_COMPLETE.test(text)) return "code";
  if (looksLikeCode(text)) return "code";

  return "text";
};

/**
 * 将字节数格式化为人类可读字符串
 * @param {number} byte - 原始字节数
 * @returns {string} 形如 "1.23 KB"
 */
export const formatSize = (byte: number) => {
  if (byte < 1024) {
    return `${byte} B`;
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(byte) / Math.log(k));
  return `${(byte / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * 格式化时间
 * @param timestamp 时间戳
 * @returns 格式化后的时间字符串
 */
export const formatTime = (timestamp: Date) => {
  return timestamp.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

/**
 * 获取类型标签
 * @param type 类型
 * @returns 类型标签
 */
export const TYPE_LABELS: Record<string, string> = {
  text: "文本",
  url: "链接",
  code: "代码",
};

export const getTypeLabel = (type: string) => {
  return TYPE_LABELS[type] || "文本";
};

/**
 * 截断超长文本，超出部分追加 "..."
 * @param {string} text - 原始文本
 * @param {number} maxLength - 保留最大长度
 * @returns {string} 截断后的结果
 */
export const truncateText = (text: string, maxLength: number) => {
  if (!text || typeof text !== "string") return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * 时分格式化（HH:mm）
 */
export const formatTimeOfDay = (timestamp: Date) => {
  const d = new Date(timestamp);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * 列表项相对时间：
 * - 今天 → HH:mm
 * - 昨天 → "昨天"
 * - 今年内 → M月D日
 * - 更早 → YYYY/M/D
 */
export const formatRelativeTime = (timestamp: Date) => {
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(d, today)) return formatTimeOfDay(d);
  if (isSameDay(d, yesterday)) return "昨天";
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
