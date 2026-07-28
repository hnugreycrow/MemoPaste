import { ref } from "vue";
import type { ThemeMode } from "./type";

export type ThemeType = ThemeMode;

const currentTheme = ref<ThemeType>("dark");

/** 避免 initTheme 被多次调用时重复挂上 IPC 监听 */
let themeListenerBound = false;

/**
 * 主窗口与快捷面板是两个 BrowserWindow，改主题后需经主进程广播，
 * 否则另一窗口的 DOM class 不会跟着变。
 */
function bindThemeSyncListener(): void {
  if (themeListenerBound) return;
  themeListenerBound = true;

  window.theme.onChanged((theme: ThemeType) => {
    if (theme !== "light" && theme !== "dark") return;
    if (theme === currentTheme.value) return;
    currentTheme.value = theme;
    applyTheme(theme);
  });
}

const initTheme = async (): Promise<void> => {
  bindThemeSyncListener();

  try {
    const savedTheme = await window.config.get<ThemeType>("theme");
    currentTheme.value = savedTheme ?? "dark";
    applyTheme(currentTheme.value);
  } catch (error) {
    console.error("获取主题设置失败:", error);
    currentTheme.value = "dark";
    applyTheme("dark");
  }
};

const setTheme = (theme: ThemeType): void => {
  currentTheme.value = theme;
  window.config.set("theme", theme).catch((error: unknown) => {
    console.error("保存主题设置失败:", error);
  });
  applyTheme(theme);
  // 先改本窗 DOM，再广播；对端只 apply，避免循环写 config
  window.theme.broadcast(theme);
};

/** 主题样式挂在 :root.dark / :root.light（见 themes.css） */
const applyTheme = (theme: ThemeType): void => {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
};

export const themeService = {
  currentTheme,
  initTheme,
  setTheme,
};
