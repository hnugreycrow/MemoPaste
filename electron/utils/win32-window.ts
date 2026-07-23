/**
 * Win32 窗口样式工具
 * 为快捷面板追加 WS_EX_NOACTIVATE，显示/点击时不抢激活态，便于直接粘贴到原输入框。
 */
import { createRequire } from "node:module";
import type { BrowserWindow } from "electron";

const require = createRequire(import.meta.url);

const GWL_EXSTYLE = -20;
const WS_EX_NOACTIVATE = 0x08000000;

type WinApi = {
  GetWindowLongPtrW: (hwnd: unknown, nIndex: number) => bigint | number;
  SetWindowLongPtrW: (
    hwnd: unknown,
    nIndex: number,
    dwNewLong: bigint | number,
  ) => bigint | number;
};

let winApi: WinApi | null = null;

function getWinApi(): WinApi {
  if (winApi) return winApi;

  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");

  winApi = {
    GetWindowLongPtrW: user32.func(
      "intptr_t __stdcall GetWindowLongPtrW(void *hWnd, int nIndex)",
    ),
    SetWindowLongPtrW: user32.func(
      "intptr_t __stdcall SetWindowLongPtrW(void *hWnd, int nIndex, intptr_t dwNewLong)",
    ),
  };

  return winApi;
}

/**
 * 为窗口追加 WS_EX_NOACTIVATE，点击/显示时不抢激活态
 */
export function applyNoActivateStyle(win: BrowserWindow): void {
  if (process.platform !== "win32" || win.isDestroyed()) return;

  try {
    const api = getWinApi();
    // Electron 的 NativeWindowHandle Buffer 可直接作为 HWND 指针传给 user32
    const hwnd = win.getNativeWindowHandle();
    const exStyle = BigInt(api.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    api.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle | BigInt(WS_EX_NOACTIVATE));
  } catch (error) {
    console.warn("applyNoActivateStyle failed:", error);
  }
}
