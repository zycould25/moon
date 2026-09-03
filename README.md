# Moon

Moon 是一个面向桌面与移动设备的 EPUB 阅读器。桌面端使用 Electron，移动端使用 React Native + Expo，EPUB 元数据与文件处理核心使用可跨平台复用的 Rust。

![Moon 深色主题书库界面](docs/screenshots/library-dark.png)

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
- Phone、Pad 与 2-in-1 自适应布局
- iOS / Android 本地 EPUB 离线阅读

## 自适应布局

- **Phone**：双列书库、底部导航、底部目录/书签抽屉
- **Pad**：侧边导航、多列书库、横竖屏动态重排
- **2-in-1**：宽屏桌面式侧栏；横屏阅读时目录/书签停靠在右侧；窗口变窄或设备翻转后自动切换为触控布局

布局由实时窗口尺寸驱动，因此分屏、旋转和 2-in-1 姿态变化不需要重启应用。

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

需要 Node.js、pnpm、Rust；构建 Windows 安装包时需要 Windows。

```powershell
pnpm install
pnpm dev
```

`pnpm dev` 会增量编译当前平台的 Rust N-API 模块。也可以单独执行：

```bash
make rust-desktop
```

只启动浏览器版本：

```powershell
pnpm dev:web
```

启动 React Native 移动端：

```bash
pnpm install
pnpm dev:mobile
```

然后使用 Expo Go 扫码，或直接启动模拟器：

```bash
pnpm dev:mobile:ios
pnpm dev:mobile:android
```

Android 真机 Release 构建、安装和启动不依赖 Expo Go。连接并授权 USB 调试后，在项目根目录执行：

```bash
make
```

Makefile 会自动选择唯一一台已授权设备。连接多台设备时指定序列号：

```bash
make devices
make android DEVICE=<序列号>
```

也可以分别执行 `make android-build`、`make android-install` 和 `make android-launch`。OPPO/ColorOS 首次通过 ADB 安装时，可能仍需在手机端关闭“安装增强防护”或确认未知来源安装。

Android 构建会自动通过 NDK 编译 Rust 核心。首次构建需要安装 Rust、Android NDK 和 `cargo-ndk`：

```bash
cargo install cargo-ndk --locked
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Rust 核心、C/JNI 接口及 Swift Package 的结构与独立构建方法见 [`rust/`](rust/README.md)。

移动端代码位于 [`mobile/`](mobile/README.md)。导入的 EPUB 会复制到应用文档目录；书库、进度、书架、书签与设置保存在设备本地。

## 构建

构建前端：

```powershell
pnpm run build:renderer
```

构建当前平台可直接运行的 Electron 应用目录（包含 Rust EPUB 核心）：

```bash
make electron
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
- epub.js（HTML/CSS 排版与渲染）
- Zustand
- IndexedDB
- React Native
- Expo
- React Native WebView
- AsyncStorage
- Rust
- JNI / C ABI / Swift Package / Node N-API

## 数据

导入的书籍、书架、书签、设置与阅读进度保存在本机。

## License

本项目使用 [Apache License 2.0](LICENSE)。
