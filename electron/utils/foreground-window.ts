/**
 * Windows 前台窗口句柄记录、恢复与进程名读取（单浮窗 focusable:true 场景）
 *
 * - 呼出浮窗前记录原前台窗口句柄；隐藏浮窗准备自动粘贴时通过 SetForegroundWindow 兜底恢复
 * - 剪贴板变更时读取前台进程名，供隐私保护模块跳过密码管理器
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type ForegroundWindowHandle = number | bigint;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

type ForegroundApi = {
  getForegroundWindow: () => ForegroundWindowHandle;
  setForegroundWindow: (hwnd: ForegroundWindowHandle) => number;
  isWindow: (hwnd: ForegroundWindowHandle) => number;
  getWindowThreadProcessId: (hwnd: ForegroundWindowHandle, pidOut: Uint32Array) => number;
  openProcess: (access: number, inherit: number, pid: number) => ForegroundWindowHandle;
  queryFullProcessImageNameW: (
    hProcess: ForegroundWindowHandle,
    flags: number,
    buf: Buffer,
    sizeOut: Uint32Array,
  ) => number;
  closeHandle: (handle: ForegroundWindowHandle) => number;
};

let api: ForegroundApi | null = null;

function ensureApi(): ForegroundApi | null {
  if (process.platform !== "win32") return null;
  if (api) return api;

  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    api = {
      getForegroundWindow: user32.func("uintptr_t __stdcall GetForegroundWindow()"),
      setForegroundWindow: user32.func("int __stdcall SetForegroundWindow(uintptr_t hWnd)"),
      isWindow: user32.func("int __stdcall IsWindow(uintptr_t hWnd)"),
      getWindowThreadProcessId: user32.func(
        "uint32_t __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32_t *lpdwProcessId)",
      ),
      openProcess: kernel32.func(
        "uintptr_t __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)",
      ),
      queryFullProcessImageNameW: kernel32.func(
        "int __stdcall QueryFullProcessImageNameW(uintptr_t hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)",
      ),
      closeHandle: kernel32.func("int __stdcall CloseHandle(uintptr_t hObject)"),
    };
    return api;
  } catch (error) {
    console.error("Failed to load Win32 foreground API:", error);
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

/** 读取当前前台窗口所属进程的可执行文件名（小写，如 bitwarden.exe）；失败返回 null */
export function getForegroundProcessName(): string | null {
  const a = ensureApi();
  if (!a) return null;

  let hProcess: ForegroundWindowHandle | null = null;
  try {
    const hwnd = a.getForegroundWindow();
    if (!hwnd || BigInt(hwnd) === 0n) return null;

    const pidArr = new Uint32Array(1);
    a.getWindowThreadProcessId(hwnd, pidArr);
    const pid = pidArr[0];
    if (!pid) return null;

    hProcess = a.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if (!hProcess || BigInt(hProcess) === 0n) return null;

    const maxChars = 512;
    const buf = Buffer.alloc(maxChars * 2);
    const sizeArr = new Uint32Array([maxChars]);
    const ok = a.queryFullProcessImageNameW(hProcess, 0, buf, sizeArr);
    if (!ok || sizeArr[0] === 0) return null;

    const fullPath = buf.subarray(0, sizeArr[0] * 2).toString("utf16le");
    const base = path.win32.basename(fullPath).trim().toLowerCase();
    return base || null;
  } catch {
    return null;
  } finally {
    if (hProcess && BigInt(hProcess) !== 0n) {
      try {
        a.closeHandle(hProcess);
      } catch {
        // ignore
      }
    }
  }
}
