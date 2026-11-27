/**
 * 剪贴板内容类型推断（主进程入库 / 渲染进程展示共用）
 */

export type ContentType = "text" | "url" | "code" | "image";

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

/** 超大粘贴跳过 JSON.parse，避免主线程卡死后再判类型 */
const JSON_PARSE_MAX = 10_000;

function isJsonObjectOrArray(content: string): boolean {
  if (content.length > JSON_PARSE_MAX) return false;
  const t = content.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    const parsed = JSON.parse(t);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

/** 多行且结构像代码 */
function looksLikeCode(content: string): boolean {
  if (CODE_LINE_START.test(content)) return true;
  const hasBraces = content.includes("{") && content.includes("}");
  const hasOperator = CODE_OPERATORS.test(content) || /;\s*$/m.test(content);
  return hasBraces && hasOperator;
}

/** 推断文本类型：url → code → text（启发式，宁可标成 text） */
export const getContentType = (content: string): ContentType => {
  const text = content.trim();
  if (text.length < 2) return "text";

  if (URL_WHOLE.test(text)) return "url";

  if (isJsonObjectOrArray(text)) return "code";
  if (HTML_COMPLETE.test(text)) return "code";
  if (looksLikeCode(text)) return "code";

  return "text";
};

export const formatSize = (byte: number) => {
  if (byte < 1024) {
    return `${byte} B`;
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(byte) / Math.log(k));
  return `${(byte / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const TYPE_LABELS: Record<string, string> = {
  text: "文本",
  url: "链接",
  code: "代码",
  image: "图片",
};

export const getTypeLabel = (type: string) => {
  return TYPE_LABELS[type] || "文本";
};

/** 将多行文本压成干净的单行（合并换行与连续空白），用于「去换行粘贴」 */
export const collapseToSingleLine = (content: string): string => {
  if (!content) return "";
  const collapsed = content
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
  return collapsed || content.replace(/\r\n|\r|\n/g, " ");
};

/** 校验并规范化可安全外链打开的 URL（仅允许 http / https，自动补齐 www. 前缀） */
export const normalizeSafeExternalUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};
