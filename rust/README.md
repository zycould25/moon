# Moon EPUB Core

`moon-epub-core` 是不依赖 Android、Apple、React Native 或 UI 框架的纯 Rust EPUB 核心。

它目前负责：

- 从 ZIP/OPF 读取 title、author、封面、页数和固定/流式版式
- 按需提取封面
- 带 ZIP Slip、符号链接、条目数和解压大小限制的安全解包
- 为漫画等 fixed-layout EPUB 生成可直接交给渲染层的 package 路径

目录职责：

```text
epub-core/   纯 Rust 领域逻辑，可用于 Android、iOS、macOS、Windows 和 CLI
epub-ffi/    稳定 C ABI；Android JNI 也只封装这一层
epub-node/   Electron N-API 适配层，只转发到 epub-ffi
apple/       Swift Package 包装，供 Swift / SwiftUI 调用
scripts/     Android 与 Apple 原生产物构建脚本
```

运行测试：

```bash
make rust-test
```

Android 的 Gradle 构建会自动调用 Rust；也可以单独构建 JNI 库：

```bash
make rust-android
```

生成 Swift 可导入的 XCFramework：

```bash
make rust-apple
```

随后在 Xcode 中把 `rust/apple` 作为本地 Swift Package 加入项目，即可从 Swift/SwiftUI 调用 `MoonEpubCore`。UI 线程之外执行 `inspect` 和 `prepareForReading`。

生成当前桌面平台的 Electron N-API 模块：

```bash
make rust-desktop
```

Electron 主进程异步调用该模块，并通过受限 IPC 向 React 暴露 `inspect`、`prepare` 与 `removeArtifacts`。导入文件复制到 Electron 的应用数据目录，React/IndexedDB 只保存轻量元数据；解包后的资源由 `moon-epub://` 私有协议读取，epub.js 只负责排版和渲染，不再在新导入书籍上重复解析 ZIP。
