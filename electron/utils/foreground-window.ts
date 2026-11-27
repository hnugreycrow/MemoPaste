/**
 * Windows 前台窗口句柄记录与恢复（单浮窗 focusable:true 场景）
 *
 * 呼出浮窗前记录原前台窗口句柄；隐藏浮窗准备自动粘贴时，
 * 如系统未自动将焦点交还给原窗口，则通过 SetForegroundWindow 兜底恢复。
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type ForegroundWindowHandle = number | bigint;

type ForegroundApi = {
  getForegroundWindow: () => ForegroundWindowHandle;
  setForegroundWindow: (hwnd: ForegroundWindowHandle) => number;
  isWindow: (hwnd: ForegroundWindowHandle) => number;
};

let api: ForegroundApi | null = null;

function ensureApi(): ForegroundApi | null {
  if (process.platform !== "win32") return null;
  if (api) return api;

  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    api = {
      getForegroundWindow: user32.func("uintptr_t __stdcall GetForegroundWindow()"),
      setForegroundWindow: user32.func("int __stdcall SetForegroundWindow(uintptr_t hWnd)"),
      isWindow: user32.func("int __stdcall IsWindow(uintptr_t hWnd)"),
    };
    return api;
  } catch (error) {
    console.error("Failed to load user32 foreground API:", error);
    return null;
  }
}

/** 将 BrowserWindow.getNativeWindowHandle() Buffer 转为无符号整数句柄 */
export function readNativeHandle(buf: Buffer): ForegroundWindowHandle | null {
  if (!buf || buf.length === 0) return null;
  if (buf.length >= 8) {
    return buf.readBigUInt64LE(0);
  }
  if (buf.length >= 4) {
    return buf.readUInt32LE(0);
  }
  return null;
}

function isSameHandle(
  a: ForegroundWindowHandle | null | undefined,
  b: ForegroundWindowHandle | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return BigInt(a) === BigInt(b);
}

/** 记录当前前台窗口句柄；若命中自身窗口则返回 null */
export function captureForegroundWindow(
  selfHandle?: ForegroundWindowHandle | null,
): ForegroundWindowHandle | null {
  const a = ensureApi();
  if (!a) return null;
  try {
    const hwnd = a.getForegroundWindow();
    if (!hwnd || BigInt(hwnd) === 0n) return null;
    if (isSameHandle(hwnd, selfHandle)) return null;
    return hwnd;
  } catch (error) {
    console.error("GetForegroundWindow failed:", error);
    return null;
  }
}

/** 若原窗口依然有效且当前尚未回到前台，则尝试恢复前台焦点 */
export function restoreForegroundWindow(hwnd: ForegroundWindowHandle | null): boolean {
  if (!hwnd || BigInt(hwnd) === 0n) return false;
  const a = ensureApi();
  if (!a) return false;

  try {
    if (!a.isWindow(hwnd)) return false;
    const current = a.getForegroundWindow();
    if (isSameHandle(current, hwnd)) return true;
    return a.setForegroundWindow(hwnd) !== 0;
  } catch (error) {
    console.error("SetForegroundWindow failed:", error);
    return false;
  }
}
