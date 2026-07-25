// 获取内容的类型
// 预编译正则表达式以提高性能
const URL_REGEX_STRONG =
  /^(https?:\/\/|www\.)[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}(:[0-9]{1,5})?(\/.*)?(\?.*)?$/i;
const URL_REGEX_WEAK = /\b(https?:\/\/|www\.)([\w\-\.]+)\.[a-z]{2,}[^\s]*\b/i;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const CODE_KEYWORDS =
  /\b(function|class|const|let|var|import|export|return|if|for|while|switch|case|break|continue|try|catch|throw|async|await|new|this|extends|implements|interface|private|public|protected|static|typeof|instanceof|null|undefined|true|false|console|document|window|module|require|from|as|of|in|do|else|finally|get|set|super|yield)\b/g;
const CODE_SYNTAX = /[{\[\(][^{}\[\]\(\)]*[}\]\)]/;
const CODE_OPERATORS =
  /(=>|\+=|-=|\*=|\/=|%=|\*\*=|&&=|\|\|=|\?\?=|&&|\|\||===|!==|==|!=|>=|<=|\+\+|--|\*\*|<<|>>|>>>|\?\.|\.\.\.\?|\?:|\?\?)/g;
const HTML_COMPLETE = /^\s*<[\w\-]+[^>]*>[\s\S]*<\/[\w\-]+>\s*$/;
const HTML_PARTIAL = /<[\w\-]+[^>]*>|<\/[\w\-]+>/;
const INDENT_PATTERN = /^(\s+)\S/;
const SENTENCE_PATTERN = /[.!?]+\s/;

/**
 * 推断剪贴板内容的类型
 * @param {string} content - 剪贴板文本
 * @returns {"text" | "url" | "code"} 返回最可能的类型
 * @example
 * getContentType("const a = 1") // => "code"
 */
export const getContentType = (content: string) => {

  // 对于非常短的内容，快速判断为文本
  if (content.length < 5) {
    return "text";
  }

  // 高精度内容类型检测
  let type = "text";

  // 创建一个评分系统来确定内容类型
  const typeScores = {
    url: 0,
    code: 0,
    text: 0,
  };

  // URL检测 - 使用更精确的URL正则表达式
  if (URL_REGEX_STRONG.test(content)) {
    typeScores.url += 10; // 强匹配
  } else if (URL_REGEX_WEAK.test(content)) {
    typeScores.url += 5; // 弱匹配
  }

  // 电子邮件检测
  if (EMAIL_REGEX.test(content)) {
    typeScores.url += 3; // 电子邮件也归类为URL
  }

  // 代码检测 - 多层次检测
  // 1. 编程语言关键字检测
  const keywordMatches = content.match(CODE_KEYWORDS) || [];
  if (keywordMatches.length > 0) {
    // 根据关键字数量增加分数
    typeScores.code += Math.min(keywordMatches.length, 5);
  }

  // 2. 代码语法模式检测
  if (CODE_SYNTAX.test(content)) {
    typeScores.code += 2;
  }

  // 3. 操作符检测
  const operatorMatches = content.match(CODE_OPERATORS) || [];
  typeScores.code += Math.min(operatorMatches.length, 3);

  // 4. HTML/XML检测
  if (HTML_COMPLETE.test(content)) {
    typeScores.code += 5; // 完整的HTML/XML结构
  } else if (HTML_PARTIAL.test(content)) {
    typeScores.code += 3; // HTML/XML标签片段
  }

  // 5. JSON检测 - 对于长内容，跳过此检测以提高性能
  if (
    content.length < 10000 &&
    (content.startsWith("{") || content.startsWith("["))
  ) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        typeScores.code += 5;
      }
    } catch (e) {
      // 不是有效的JSON，不加分
    }
  }

  // 6. 缩进模式检测 (代码通常有一致的缩进)
  // 对于长内容，采样检测以提高性能
  const lines = content.split("\n");
  if (lines.length > 2) {
    // 对于非常长的内容，只检查前50行
    const linesToCheck = lines.length > 50 ? lines.slice(0, 50) : lines;
    let indentedLines = 0;

    for (const line of linesToCheck) {
      if (INDENT_PATTERN.test(line)) {
        indentedLines++;
      }
    }

    if (indentedLines / linesToCheck.length > 0.3) {
      // 如果30%以上的行有缩进
      typeScores.code += 2;
    }
  }

  // 普通文本特征检测
  // 对于长内容，只检查前200个字符
  const textToCheck =
    content.length > 200 ? content.substring(0, 200) : content;
  const sentences = textToCheck
    .split(SENTENCE_PATTERN)
    .filter((s) => s.length > 0);
  if (sentences.length > 2) {
    typeScores.text += sentences.length > 5 ? 3 : 1;
  }

  // 根据评分确定最终类型
  if (typeScores.url >= 5 && typeScores.url > typeScores.code) {
    type = "url";
  } else if (typeScores.code >= 3 && typeScores.code > typeScores.url) {
    type = "code";
  } else {
    type = "text"; // 默认为文本
  }

  return type;
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
  image: "图片",
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
