# Moon

Moon 是一个使用 Electron 构建的 Windows EPUB 阅读器。

## 功能

- 导入单个或多个 EPUB 文件
- 书架分类与书籍拖拽归档
- 最近阅读与阅读位置保存
- 自定义书架封面
- 目录与书签
- 浅色、深色与暖色主题
- 字号调整
- 可拖动的阅读进度条
- 沉浸式全屏阅读

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `←` / `→` | 上一页 / 下一页 |
| `↑` / `↓` | 上一页 / 下一页 |
| `PageUp` / `PageDown` | 上一页 / 下一页 |
| `Space` | 下一页 |
| `Shift + Space` | 上一页 |
| `Ctrl + 鼠标滚轮` | 调整字号 |
| `F` / `F11` | 切换全屏 |
| `Esc` | 退出全屏或返回书架 |

## 安装

从 [Releases](https://github.com/zycould25/moon/releases) 下载最新的 `Moon-Setup-*.exe` 并运行。

## 开发

需要 Node.js、pnpm 和 Windows。

```powershell
pnpm install
pnpm dev
```

只启动浏览器版本：

```powershell
pnpm dev:web
```

## 构建

构建前端：

```powershell
pnpm run build:renderer
```

生成 Windows 安装包：

```powershell
pnpm build:exe
```

安装包会生成到 `release/`。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- epub.js
- Zustand
- IndexedDB

## 数据

导入的书籍、书架、书签、设置与阅读进度保存在本机。

## License

本项目使用 [Apache License 2.0](LICENSE)。
