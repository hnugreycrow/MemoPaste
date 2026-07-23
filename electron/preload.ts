import { WindowControls, UpdateControls, PanelControls } from '@/utils/type'
import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args;
    return ipcRenderer.once(channel, listener);
  }
})

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const wrappedCallback = (_: any, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window-maximize-changed', wrappedCallback);
    return () => ipcRenderer.removeListener('window-maximize-changed', wrappedCallback);
  }
} as WindowControls)

contextBridge.exposeInMainWorld('panel', {
  /** 隐藏快捷面板 */
  hide: () => ipcRenderer.send('panel-hide'),
  /** 关闭面板并打开主窗口 */
  openMain: () => ipcRenderer.send('panel-open-main'),
  /** 面板每次显示时回调（用于刷新列表） */
  onShown: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('panel-shown', wrappedCallback);
    return () => ipcRenderer.removeListener('panel-shown', wrappedCallback);
  }
} as PanelControls)

// 剪切板 API
contextBridge.exposeInMainWorld('clipboard', {
  read: () => ipcRenderer.invoke('clipboard-read'),
  write: (text: string) => ipcRenderer.invoke('clipboard-write', text),
  /** 写入剪贴板、隐藏面板并模拟粘贴到当前输入焦点 */
  pasteAndHide: (text: string) => ipcRenderer.invoke('clipboard-paste-and-hide', text),
  startWatching: () => ipcRenderer.invoke('clipboard-watch-start'),
  stopWatching: () => ipcRenderer.invoke('clipboard-watch-stop'),
  onChanged: (callback: (content: string) => void) => {
    const wrappedCallback = (_: any, content: string) => callback(content);
    ipcRenderer.on('clipboard-changed', wrappedCallback);
    return () => ipcRenderer.removeListener('clipboard-changed', wrappedCallback);
  },
  saveItem: (item: any) => ipcRenderer.invoke('clipboard-save-item', item),
  deleteItem: (id: number) => ipcRenderer.invoke('clipboard-delete-item', id),
  deleteBatch: (ids: number[]) => ipcRenderer.invoke('clipboard-delete-batch', ids),
  clearAll: () => ipcRenderer.invoke('clipboard-clear-all'),
  clearExceptFavorites: () => ipcRenderer.invoke('clipboard-clear-except-favorites'),
  getHistory: (page: number, pageSize: number, type: string, keyword: string = '') => ipcRenderer.invoke('clipboard-get-history', page, pageSize, type, keyword),
  setFavorite: (id: number, isFavorite: boolean) => ipcRenderer.invoke('clipboard-set-favorite', id, isFavorite),
  getFavorites: () => ipcRenderer.invoke('clipboard-get-favorites'),
  getCounts: () => ipcRenderer.invoke('clipboard-get-counts')
})

// 配置 API
contextBridge.exposeInMainWorld('config', {
  get: (key: string) => ipcRenderer.invoke('config-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('config-set', key, value),
  getAll: () => ipcRenderer.invoke('config-get-all'),
})

// 暴露更新相关API
contextBridge.exposeInMainWorld('updater', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  setAutoUpdate: (enabled: boolean) => ipcRenderer.invoke('set-auto-update', enabled),
  getAutoUpdate: () => ipcRenderer.invoke('get-auto-update'),
  onUpdateStatus: (callback: (status: { status: string, data?: any }) => void) => {
    const wrappedCallback = (_event: any, status: any) => callback(status);
    ipcRenderer.on('update-status', wrappedCallback);
    return () => ipcRenderer.removeListener('update-status', wrappedCallback);
  }
} as UpdateControls)
