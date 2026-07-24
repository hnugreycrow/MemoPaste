import { validateShortcut } from "@shared/shortcut";

/** @deprecated 请优先使用 shared/shortcut 的 validateShortcut；保留以兼容现有调用 */
export const checkShortcut = (shortcut: string) => {
  const result = validateShortcut(shortcut);
  if (result.success) {
    return { success: true as const };
  }
  return { success: false as const, error: result.error };
};
