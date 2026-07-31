import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, type NativeImage } from "electron";

/** 单张图片落盘上限，防止截图/大图拖垮磁盘 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const THUMB_MAX_EDGE = 240;

export type StoredImage = {
  hash: string;
  filePath: string;
  thumbPath: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export function getClipboardImagesDir(): string {
  const dir = path.join(app.getPath("userData"), "clipboard-images");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 只允许 hash.png / hash_thumb.jpg，防止路径穿越 */
export function isSafeImageFileName(name: string): boolean {
  return /^[a-f0-9]{64}(_thumb)?\.(png|jpg)$/i.test(name);
}

export function resolveImageAbsolutePath(relative: string): string | null {
  const name = path.basename(relative);
  if (!isSafeImageFileName(name)) {
    console.warn("拒绝解析非法图片路径:", relative);
    return null;
  }
  return path.join(getClipboardImagesDir(), name);
}

/**
 * 将剪贴板 NativeImage 存为 PNG + JPEG 缩略图。
 * 同 hash 已存在则复用文件。
 */
export function storeClipboardImage(image: NativeImage): StoredImage | null {
  if (image.isEmpty()) return null;

  const png = image.toPNG();
  if (png.length > MAX_IMAGE_BYTES) {
    console.warn(
      `跳过超大图片: ${(png.length / (1024 * 1024)).toFixed(1)}MB > ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
    );
    return null;
  }

  const hash = createHash("sha256").update(png).digest("hex");
  const dir = getClipboardImagesDir();
  const filePath = `${hash}.png`;
  const thumbPath = `${hash}_thumb.jpg`;
  const absPng = path.join(dir, filePath);
  const absThumb = path.join(dir, thumbPath);

  if (!fs.existsSync(absPng)) {
    fs.writeFileSync(absPng, png);
  }

  if (!fs.existsSync(absThumb)) {
    const { width, height } = image.getSize();
    const longest = Math.max(width, height, 1);
    const scale = Math.min(1, THUMB_MAX_EDGE / longest);
    const thumb =
      scale < 1
        ? image.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
          })
        : image;
    fs.writeFileSync(absThumb, thumb.toJPEG(80));
  }

  const { width, height } = image.getSize();
  return {
    hash,
    filePath,
    thumbPath,
    width,
    height,
    sizeBytes: png.length,
  };
}

export function deleteImageFiles(filePath?: string | null, thumbPath?: string | null): void {
  for (const rel of [filePath, thumbPath]) {
    if (!rel) continue;
    const abs = resolveImageAbsolutePath(rel);
    if (!abs) continue;
    try {
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
      }
    } catch (error) {
      console.warn("删除图片文件失败:", abs, error);
    }
  }
}
