import { ref } from "vue";
import type { ThemeMode } from "./type";

export type ThemeType = ThemeMode;

const saving = ref(false);
const currentTheme = ref<ThemeType>("light");

/** 主题样式挂在 :root.dark / :root.light（见 themes.css） */
const applyTheme = (theme: ThemeType): void => {
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
};

const initTheme = async (): Promise<void> => {
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

const setTheme = async (theme: ThemeType): Promise<boolean> => {
  if (saving.value || theme === currentTheme.value) return true;
  saving.value = true;
  try {
    const saved = await window.config.set("theme", theme);
    if (!saved) return false;
    currentTheme.value = theme;
    applyTheme(theme);
    return true;
  } catch {
    return false;
  } finally {
    saving.value = false;
  }
};

export const themeService = {
  currentTheme,
  saving,
  initTheme,
  setTheme,
};
