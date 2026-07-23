import { ref } from 'vue';

// 主题类型
export type ThemeType = 'light' | 'dark';

// 创建一个响应式的主题状态
const currentTheme = ref<ThemeType>('dark');

let themeListenerBound = false;

/** 监听其他窗口发来的主题变更（主窗口 ↔ 面板） */
function bindThemeSyncListener(): void {
  if (themeListenerBound) return;
  themeListenerBound = true;

  window.ipcRenderer.on('theme-changed', (_event, theme: ThemeType) => {
    if (theme !== 'light' && theme !== 'dark') return;
    if (theme === currentTheme.value) return;
    currentTheme.value = theme;
    applyTheme(theme);
  });
}

// 获取存储的主题设置
const initTheme = async (): Promise<void> => {
  bindThemeSyncListener();

  try {
    // 使用通用配置方法获取主题
    const savedTheme = await window.config.get<ThemeType>('theme');
    if (savedTheme) {
      currentTheme.value = savedTheme;
    } else {
      // 默认使用深色主题
      currentTheme.value = 'dark';
    }
    applyTheme(currentTheme.value);
  } catch (error) {
    console.error('获取主题设置失败:', error);
    // 出错时使用默认主题
    currentTheme.value = 'dark';
    applyTheme('dark');
  }
};

// 设置主题
const setTheme = (theme: ThemeType): void => {
  currentTheme.value = theme;
  // 使用通用配置方法保存主题
  window.config.set('theme', theme).catch((error: any) => {
    console.error('保存主题设置失败:', error);
  });
  applyTheme(theme);
  // 通知其他 BrowserWindow 同步主题
  window.ipcRenderer.send('theme-changed', theme);
};

// 应用主题到DOM
const applyTheme = (theme: ThemeType): void => {
  document.documentElement.setAttribute('data-theme', theme);
  
  // 为body添加对应的主题类
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(theme);
};

// 导出主题服务
export const themeService = {
  currentTheme,
  initTheme,
  setTheme
};
