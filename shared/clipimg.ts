/**
 * 自定义协议 clipimg:// 的 URL 约定（渲染进程展示缩略图 / 原图）
 * 主进程 protocol.handle 映射到 userData/clipboard-images/
 */

export const CLIPIMG_SCHEME = "clipimg";

/** 相对文件名 → 可加载 URL，如 hash_thumb.jpg */
export function clipimgUrl(relativePath: string | null | undefined): string {
  if (!relativePath) return "";
  const name = relativePath.replace(/^.*[/\\]/, "");
  if (!name) return "";
  return `${CLIPIMG_SCHEME}://image/${name}`;
}
