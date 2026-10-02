import { ref } from "vue";
import { ElMessage } from "element-plus";
import type { ThemeMode } from "./type";

export type ThemeType = ThemeMode;

const saving = ref(false);
const currentTheme = ref<ThemeType>("light");

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
    currentTheme.value = savedTheme === "dark" ? "dark" : "light";
    applyTheme(currentTheme.value);
  } catch (error) {
    console.error("获取主题设置失败:", error);
    currentTheme.value = "light";
    applyTheme("light");
  }
};

const setTheme = async (theme: ThemeType): Promise<void> => {
  if (saving.value || theme === currentTheme.value) return;
  saving.value = true;
  try {
    if (!(await window.config.set("theme", theme))) throw new Error("保存失败");
    currentTheme.value = theme;
    applyTheme(theme);
    window.theme.broadcast(theme);
  } catch {
    ElMessage.error("主题保存失败，请重试");
  } finally {
    saving.value = false;
  }
};

/** 主题样式挂在 :root.dark / :root.light（见 themes.css） */
const applyTheme = (theme: ThemeType): void => {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
};

export const themeService = {
  currentTheme,
  saving,
  initTheme,
  setTheme,
};
