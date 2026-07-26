/** 应用退出中：允许面板真正 destroy，而不只是 hide */
let appIsQuitting = false;

export function setAppIsQuitting(value: boolean): void {
  appIsQuitting = value;
}

export function isAppQuitting(): boolean {
  return appIsQuitting;
}
