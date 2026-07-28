/**
 * 模拟系统粘贴（不抢焦点场景）
 *
 * 面板以 focusable:false + showInactive 显示时，原输入框仍持有编辑焦点，
 * 因此只需向系统输入流注入 Ctrl+V / Cmd+V，无需 SetForegroundWindow。
 *
 * Windows 使用 koffi 调用 user32.SendInput，避免拉起 PowerShell 触发安全软件拦截。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// Win32 虚拟键与 SendInput 标志
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12; // Alt
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;
const VK_V = 0x56;

type SendInputFn = (cInputs: number, pInputs: unknown, cbSize: number) => number;

/** 缓存 SendInput，避免每次粘贴重复定义 koffi struct */
let sendInput: SendInputFn | null = null;
let inputSize = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 懒加载 user32.SendInput 与 INPUT 结构体 */
function ensureSendInput(): void {
  if (sendInput) return;

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

  sendInput = user32.func(
    "uint32_t __stdcall SendInput(uint32_t cInputs, INPUT *pInputs, int cbSize)",
  );
  inputSize = koffi.sizeof(INPUT);
}

function makeKey(vk: number, down: boolean) {
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vk,
        wScan: 0,
        dwFlags: down ? 0 : KEYEVENTF_KEYUP,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  };
}

function sendKeys(events: ReturnType<typeof makeKey>[]): void {
  ensureSendInput();
  const sent = sendInput!(events.length, events, inputSize);
  if (sent !== events.length) {
    throw new Error(`SendInput failed: sent ${sent}/${events.length}`);
  }
}

/**
 * 松开可能仍被系统视为按下的修饰键。
 * 用 Alt/Shift 等全局快捷键唤起面板后，残留修饰键会导致 Ctrl+V 变成别的组合键。
 */
function releaseModifiers(): void {
  sendKeys([
    makeKey(VK_MENU, false),
    makeKey(VK_SHIFT, false),
    makeKey(VK_CONTROL, false),
    makeKey(VK_LWIN, false),
    makeKey(VK_RWIN, false),
  ]);
}

function sendCtrlV(): void {
  sendKeys([
    makeKey(VK_CONTROL, true),
    makeKey(VK_V, true),
    makeKey(VK_V, false),
    makeKey(VK_CONTROL, false),
  ]);
}

/**
 * 模拟粘贴到当前持有编辑焦点的控件。
 * 调用方应先写入剪贴板并隐藏面板。
 */
export async function simulatePaste(): Promise<void> {
  if (process.platform === "win32") {
    releaseModifiers();
    // 等修饰键抬起与面板隐藏落定，再发 Ctrl+V，否则易变成 Alt/Shift+V
    await delay(30);
    sendCtrlV();
    return;
  }

  await delay(30);

  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to keystroke "v" using command down',
    ]);
    return;
  }

  // Linux：依赖 xdotool
  try {
    await execFileAsync("xdotool", ["key", "ctrl+v"]);
  } catch {
    console.warn("当前环境不支持自动粘贴（需要 xdotool）");
  }
}
