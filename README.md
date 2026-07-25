# MemoPaste

一款基于 Electron + Vue 3 的剪贴板管理工具，自动记录复制内容，方便随时检索与复用。

## 特性

- **历史记录**：自动保存复制的文本，支持搜索、筛选与收藏
- **本地存储**：历史数据保存在本地 SQLite，无需联网，隐私可控
- **快捷面板**：全局快捷键唤出类似 Win + V 的浮层，选中后可自动粘贴
- **系统托盘**：可最小化到托盘，减少对工作流的干扰
- **数据管理**：可配置历史保留天数，支持批量删除与清空
- **主题切换**：内置亮色 / 暗色主题
- **自动更新**：通过 GitHub Releases 检查并提示更新

## 预览

![image-20260725150046177](assets/image.png)

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Pinia、Vue Router、Element Plus |
| 构建 | Vite、vite-plugin-electron |
| 桌面 | Electron |
| 存储 | SQLite（better-sqlite3）、electron-store |

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
