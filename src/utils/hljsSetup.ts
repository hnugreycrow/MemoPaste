/**
 * highlight.js 语言注册与主题 CSS 生命周期（模块单例）
 * 由 HighlightedText 等组件 acquire / release，避免把全局副作用写进 SFC。
 */
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import { watch, type WatchStopHandle } from "vue";
import { themeService } from "@/utils/theme";
import githubDarkUrl from "highlight.js/styles/github-dark.css?url";
import githubLightUrl from "highlight.js/styles/github.css?url";

let languagesRegistered = false;

/** 仅注册常用语言，降低自动检测开销（幂等） */
export function ensureHljsLanguages(): void {
  if (languagesRegistered) return;
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("python", python);
  languagesRegistered = true;
}

const HLJS_LINK_ID = "hljs-theme-css";

let instanceCount = 0;
let currentLinkElement: HTMLLinkElement | null = null;
let stopThemeWatch: WatchStopHandle | null = null;

function createLink(href: string) {
  if (currentLinkElement) {
    currentLinkElement.remove();
    currentLinkElement = null;
  }
  const link = document.createElement("link");
  link.id = HLJS_LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
  currentLinkElement = link;
}

function removeLink() {
  if (currentLinkElement) {
    currentLinkElement.remove();
    currentLinkElement = null;
  }
}

function applyHljsTheme(theme: string) {
  const href = theme === "dark" ? githubDarkUrl : githubLightUrl;
  createLink(href);
}

/** 组件挂载时调用：注册语言、挂主题 CSS（首个实例时） */
export function acquireHljsTheme(): void {
  ensureHljsLanguages();
  instanceCount++;
  if (instanceCount === 1) {
    applyHljsTheme(themeService.currentTheme.value);
    stopThemeWatch = watch(
      () => themeService.currentTheme.value,
      (t) => {
        if (instanceCount > 0) {
          applyHljsTheme(t);
        }
      },
    );
  }
}

/** 组件卸载时调用：最后一个实例时移除主题 CSS */
export function releaseHljsTheme(): void {
  instanceCount = Math.max(0, instanceCount - 1);
  if (instanceCount === 0) {
    stopThemeWatch?.();
    stopThemeWatch = null;
    removeLink();
  }
}

export { hljs };
