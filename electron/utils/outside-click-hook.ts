/**
 * Windows 低级鼠标钩子：面板显示期间检测「点击在窗口外」
 * 使用 koffi + WH_MOUSE_LL，保持面板 focusable:false 时仍能点外关闭。
 */
import { createRequire } from "node:module";
import type { TypeObject } from "koffi";

const require = createRequire(import.meta.url);

const WH_MOUSE_LL = 14;
const WM_LBUTTONDOWN = 0x0201;
const WM_NCLBUTTONDOWN = 0x00a1;
/** 打开后短暂忽略，避免与唤起面板的同一次点击冲突 */
const INSTALL_GRACE_MS = 160;

export type OutsideClickHookOptions = {
  /** 屏幕物理像素坐标是否落在面板内（含边框） */
  isPointInside: (screenX: number, screenY: number) => boolean;
  onOutsideClick: () => void;
};

type HookApi = {
  koffi: typeof import("koffi");
  setWindowsHookEx: (
    idHook: number,
    lpfn: unknown,
    hMod: unknown,
    dwThreadId: number,
  ) => number | bigint;
  callNextHookEx: (
    hhk: number | bigint,
    nCode: number,
    wParam: number | bigint,
    lParam: number | bigint,
  ) => number | bigint;
  unhookWindowsHookEx: (hhk: number | bigint) => number;
  MSLLHOOKSTRUCT: TypeObject;
  HookProcPtr: TypeObject;
};

let api: HookApi | null = null;
let hookHandle: number | bigint = 0;
let registeredCb: bigint | null = null;
let options: OutsideClickHookOptions | null = null;
let graceUntil = 0;
let hideScheduled = false;

function ensureApi(): HookApi | null {
  if (process.platform !== "win32") return null;
  if (api) return api;

  try {
    const koffi = require("koffi") as typeof import("koffi");
    const user32 = koffi.load("user32.dll");

    const POINT = koffi.struct("POINT", {
      x: "long",
      y: "long",
    });

    const MSLLHOOKSTRUCT = koffi.struct("MSLLHOOKSTRUCT", {
      pt: POINT,
      mouseData: "uint32_t",
      flags: "uint32_t",
      time: "uint32_t",
      dwExtraInfo: "uintptr_t",
    });

    // Low-level hook 回调必须是 stdcall，且需 register（异步回调）
    const HookProc = koffi.proto(
      "intptr_t __stdcall OutsideClickHookProc(int nCode, uintptr_t wParam, uintptr_t lParam)",
    );
    const HookProcPtr = koffi.pointer(HookProc);

    const setWindowsHookEx = user32.func(
      "uintptr_t __stdcall SetWindowsHookExW(int idHook, void *lpfn, void *hMod, uint32_t dwThreadId)",
    );
    const callNextHookEx = user32.func(
      "intptr_t __stdcall CallNextHookEx(uintptr_t hhk, int nCode, uintptr_t wParam, uintptr_t lParam)",
    );
    const unhookWindowsHookEx = user32.func("int __stdcall UnhookWindowsHookEx(uintptr_t hhk)");

    api = {
      koffi,
      setWindowsHookEx,
      callNextHookEx,
      unhookWindowsHookEx,
      MSLLHOOKSTRUCT,
      HookProcPtr,
    };
    return api;
  } catch (error) {
    console.error("Failed to init outside-click hook API:", error);
    return null;
  }
}

function scheduleOutsideClick(): void {
  if (hideScheduled) return;
  hideScheduled = true;
  setImmediate(() => {
    hideScheduled = false;
    try {
      options?.onOutsideClick();
    } catch (error) {
      console.error("outside-click handler failed:", error);
    }
  });
}

/**
 * 安装全局鼠标钩子（幂等）。非 Windows 为 no-op。
 */
export function installOutsideClickHook(opts: OutsideClickHookOptions): boolean {
  if (process.platform !== "win32") return false;

  const a = ensureApi();
  if (!a) return false;

  // 已安装则只更新回调
  options = opts;
  if (hookHandle) {
    graceUntil = Date.now() + INSTALL_GRACE_MS;
    return true;
  }

  try {
    registeredCb = a.koffi.register(
      (nCode: number, wParam: number | bigint, lParam: number | bigint) => {
        try {
          if (nCode >= 0) {
            const msg = Number(wParam);
            if (msg === WM_LBUTTONDOWN || msg === WM_NCLBUTTONDOWN) {
              if (Date.now() >= graceUntil && options) {
                const info = a.koffi.decode(lParam, a.MSLLHOOKSTRUCT) as {
                  pt: { x: number; y: number };
                };
                const { x, y } = info.pt;
                if (!options.isPointInside(x, y)) {
                  scheduleOutsideClick();
                }
              }
            }
          }
        } catch (error) {
          console.error("outside-click hook callback error:", error);
        }
        // hhk 参数可忽略，传 0 即可
        return a.callNextHookEx(0, nCode, wParam, lParam);
      },
      a.HookProcPtr,
    );

    const handle = a.setWindowsHookEx(WH_MOUSE_LL, registeredCb, null, 0);
    if (!handle) {
      console.warn("SetWindowsHookExW(WH_MOUSE_LL) failed");
      if (registeredCb != null) {
        a.koffi.unregister(registeredCb);
        registeredCb = null;
      }
      options = null;
      return false;
    }

    hookHandle = handle;
    graceUntil = Date.now() + INSTALL_GRACE_MS;
    hideScheduled = false;
    return true;
  } catch (error) {
    console.error("Failed to install outside-click hook:", error);
    uninstallOutsideClickHook();
    return false;
  }
}

/**
 * 卸钩（幂等，可重复调用）
 */
export function uninstallOutsideClickHook(): void {
  const a = api;
  const handle = hookHandle;
  const cb = registeredCb;

  hookHandle = 0;
  registeredCb = null;
  options = null;
  hideScheduled = false;
  graceUntil = 0;

  if (!a) return;

  if (handle) {
    try {
      a.unhookWindowsHookEx(handle);
    } catch (error) {
      console.error("UnhookWindowsHookEx failed:", error);
    }
  }

  if (cb != null) {
    try {
      a.koffi.unregister(cb);
    } catch (error) {
      console.error("koffi.unregister failed:", error);
    }
  }
}
