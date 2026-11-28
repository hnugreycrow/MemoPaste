/**
 * 模拟系统粘贴（单浮窗隐藏并归还前景焦点后注入 Ctrl+V / Cmd+V）
 *
 * Windows 使用 koffi 调用 user32.SendInput，避免拉起 PowerShell 触发安全软件拦截：
 * - 切回目标窗口前仅对实际处于按下态的修饰键补发松键，避免向 Edge/Chrome 发送多余 Alt 抬起导致菜单抢焦点
 * - 切回目标窗口后等待前景窗口落定并预留浏览器渲染进程焦点恢复时间
 * - 带真实硬件扫描码（MapVirtualKeyW）分步注入 Ctrl+V，兼容 Chromium/Electron 富文本输入框与中文 IME
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { waitForForegroundWindow, type ForegroundWindowHandle } from "./foreground-window";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// Win32 虚拟键与 SendInput 标志
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const MAPVK_VK_TO_VSC = 0;

const VK_LSHIFT = 0xa0;
const VK_RSHIFT = 0xa1;
const VK_LCONTROL = 0xa2;
const VK_RCONTROL = 0xa3;
const VK_LMENU = 0xa4; // Left Alt
const VK_RMENU = 0xa5; // Right Alt
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;
const VK_V = 0x56;

const MODIFIER_VKS = [
  VK_LMENU,
  VK_RMENU,
  VK_LSHIFT,
  VK_RSHIFT,
  VK_LCONTROL,
  VK_RCONTROL,
  VK_LWIN,
  VK_RWIN,
] as const;

const EXTENDED_VKS = new Set<number>([VK_RCONTROL, VK_RMENU, VK_LWIN, VK_RWIN]);

/** 目标窗口回到前台后，额外留给 Chromium/Edge 渲染进程恢复 DOM 输入框焦点的时间 */
const RENDERER_FOCUS_SETTLE_MS = 85;
/** 分步发送 Ctrl+V 时每步间隔，确保 GetKeyState / GetAsyncKeyState / IME 状态一致 */
const KEY_STEP_DELAY_MS = 15;

type SendInputFn = (cInputs: number, pInputs: unknown, cbSize: number) => number;
type GetAsyncKeyStateFn = (vKey: number) => number;
type MapVirtualKeyWFn = (uCode: number, uMapType: number) => number;

type Win32PasteApi = {
  sendInput: SendInputFn;
  getAsyncKeyState: GetAsyncKeyStateFn;
  mapVirtualKeyW: MapVirtualKeyWFn;
  inputSize: number;
};

/** 缓存 user32 函数与 INPUT 尺寸，避免每次粘贴重复定义 koffi struct */
let pasteApi: Win32PasteApi | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 懒加载 user32.SendInput / GetAsyncKeyState / MapVirtualKeyW 与 INPUT 结构体 */
function ensureWin32PasteApi(): Win32PasteApi {
  if (pasteApi) return pasteApi;

  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");

  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16_t",
    wScan: "uint16_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
  });

  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "long",
    dy: "long",
    mouseData: "uint32_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
  });

  const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
    uMsg: "uint32_t",
    wParamL: "uint16_t",
    wParamH: "uint16_t",
  });

  // INPUT 为带 union 的结构，需与 Win32 布局一致
  const INPUT = koffi.struct("INPUT", {
    type: "uint32_t",
    u: koffi.union({
      mi: MOUSEINPUT,
      ki: KEYBDINPUT,
      hi: HARDWAREINPUT,
    }),
  });

  pasteApi = {
    sendInput: user32.func(
      "uint32_t __stdcall SendInput(uint32_t cInputs, INPUT *pInputs, int cbSize)",
    ),
    getAsyncKeyState: user32.func("int16_t __stdcall GetAsyncKeyState(int vKey)"),
    mapVirtualKeyW: user32.func("uint32_t __stdcall MapVirtualKeyW(uint32_t uCode, uint32_t uMapType)"),
    inputSize: koffi.sizeof(INPUT),
  };
  return pasteApi;
}

function makeKey(api: Win32PasteApi, vk: number, down: boolean) {
  const scan = api.mapVirtualKeyW(vk, MAPVK_VK_TO_VSC) & 0xff;
  const flags = (EXTENDED_VKS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0) | (down ? 0 : KEYEVENTF_KEYUP);
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vk,
        wScan: scan,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

function sendKeys(api: Win32PasteApi, events: ReturnType<typeof makeKey>[]): void {
  if (events.length === 0) return;
  const sent = api.sendInput(events.length, events, api.inputSize);
  if (sent !== events.length) {
    throw new Error(`SendInput failed: sent ${sent}/${events.length}`);
  }
}

/** 纯逻辑筛选当前处于按下状态的修饰键（便于单元测试） */
export function selectPressedModifiers(getKeyState: (vk: number) => number): number[] {
  return MODIFIER_VKS.filter((vk) => (getKeyState(vk) & 0x8000) !== 0);
}

/**
 * 在隐藏浮窗、归还目标焦点之前调用：
 * 仅释放当前确实被按住的修饰键（例如 Alt+1~9 速贴时残留的 Alt），
 * 让自身窗口吸收松键事件，避免把多余的 Alt/Win 抬起注入到 Edge 等浏览器引发菜单栏抢焦点。
 */
export function releasePressedModifiers(): void {
  if (process.platform !== "win32") return;
  try {
    const api = ensureWin32PasteApi();
    const pressed = selectPressedModifiers((vk) => api.getAsyncKeyState(vk));
    if (pressed.length === 0) return;
    sendKeys(
      api,
      pressed.map((vk) => makeKey(api, vk, false)),
    );
  } catch (error) {
    console.warn("释放残留修饰键失败:", error);
  }
}

async function sendCtrlV(api: Win32PasteApi): Promise<void> {
  sendKeys(api, [makeKey(api, VK_LCONTROL, true)]);
  try {
    await delay(KEY_STEP_DELAY_MS);
    sendKeys(api, [makeKey(api, VK_V, true)]);
    await delay(KEY_STEP_DELAY_MS);
    sendKeys(api, [makeKey(api, VK_V, false)]);
    await delay(KEY_STEP_DELAY_MS);
  } finally {
    sendKeys(api, [makeKey(api, VK_LCONTROL, false)]);
  }
}

export type SimulatePasteOptions = {
  targetHwnd?: ForegroundWindowHandle | null;
};

/**
 * 模拟粘贴到目标前景窗口。
 * 调用方应先写入剪贴板、释放残留修饰键、隐藏浮窗并恢复原窗口焦点。
 */
export async function simulatePaste(options?: SimulatePasteOptions): Promise<void> {
  if (process.platform === "win32") {
    const api = ensureWin32PasteApi();
    if (options?.targetHwnd) {
      await waitForForegroundWindow(options.targetHwnd, { timeoutMs: 200, pollMs: 10 });
    }
    // 等待目标应用（尤其是 Chromium/Edge 渲染进程）完成输入框焦点落定，再分步发送 Ctrl+V
    await delay(RENDERER_FOCUS_SETTLE_MS);
    await sendCtrlV(api);
    return;
  }

  await delay(45);

  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to keystroke "v" using command down',
    ]);
    return;
  }

  try {
    await execFileAsync("xdotool", ["key", "ctrl+v"]);
  } catch {
    throw new Error("当前环境不支持自动粘贴（需要 xdotool）");
  }
}
