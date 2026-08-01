# MemoPaste

一款基于 Electron + Vue 3 的剪贴板管理工具，自动记录复制内容，方便随时检索与复用。

## 特性

- **历史记录**：自动保存复制的文本与图片，支持搜索、类型筛选与收藏
- **图片支持**：图片历史带缩略图预览，可一键粘贴回原尺寸图片
- **本地存储**：历史数据保存在本地 SQLite，无需联网，隐私可控
- **去重置顶**：相同内容再次复制时合并为一条并置顶，避免列表刷屏
- **快捷面板**：全局快捷键唤出类似 Win + V 的浮层，选中后可自动粘贴
- **系统托盘**：可最小化到托盘，减少对工作流的干扰
- **数据管理**：可配置历史保留天数；收藏内容不受自动清理影响
- **主题切换**：内置浅色 / 深色主题（默认浅色）
- **自动更新**：启动时检查 GitHub Releases，可关闭，并按 24 小时节流

## 预览

![image-20260726143543028](assets/image.png)

## 技术栈

| 类别 | 技术                                               |
| ---- | -------------------------------------------------- |
| 前端 | Vue 3、TypeScript、Pinia、Vue Router、Element Plus |
| 构建 | Vite、vite-plugin-electron                         |
| 桌面 | Electron                                           |
| 存储 | SQLite（better-sqlite3）、electron-store           |

## 快速开始

### 直接下载

前往 [Releases](https://github.com/hnugreycrow/MemoPaste/releases) 下载安装包。

### 源码运行

**环境要求**：Node.js 18+（建议使用 LTS 版本）

```bash
# 安装依赖
npm install

# 如遇 better-sqlite3 原生模块问题，可执行
npm run sqlite3-rebuild

# 启动开发环境
npm run dev
```

### 构建安装包

```bash
npm run build
```

产物由 electron-builder 生成，输出目录见构建日志。

## License

[MIT](./LICENSE)
