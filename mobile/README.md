# Moon Mobile

Moon 的 React Native 移动客户端，使用 Expo 管理 iOS 与 Android 工程。

## 设备模式

`src/hooks/useResponsiveLayout.ts` 根据实时窗口尺寸选择布局，而不是根据具体设备型号：

| 模式 | 触发条件 | 主要布局 |
| --- | --- | --- |
| Phone | 安全区宽度小于 600，或短边小于 480 | 2–3 列书库；竖屏底部导航，横屏窄侧轨；抽屉式目录 |
| Pad | 600–1039 的有效安全区宽度 | 完整侧栏、最多五列、纸张式阅读区域、侧边弹层 |
| 2-in-1 | 有效安全区宽度至少 1040 | 宽侧栏、最多七列、横屏停靠阅读面板 |

分屏、旋转、挖孔/圆角安全区或 2-in-1 折叠时会自动重新计算模式、列数和阅读面板位置。界面切换、书卡进入、面板开合与翻页均使用轻量原生驱动动画。

## 运行

在仓库根目录执行：

```bash
pnpm install
pnpm dev:mobile
```

也可以直接打开模拟器：

```bash
pnpm dev:mobile:ios
pnpm dev:mobile:android
```

## Android 真机 Release 安装

不依赖 Expo Go。连接并授权 USB 调试后，推荐在仓库根目录执行：

```bash
make
```

Makefile 会自动完成 Release 构建、ADB 安装和应用启动。连接多台设备时使用 `make android DEVICE=<序列号>`。

如需直接调用底层命令：

```bash
adb devices
JAVA_HOME=$(/usr/libexec/java_home -v 17) pnpm --dir mobile android:release --device <设备名称>
```

例如设备列表中显示 `model:PLJ110` 时，设备名称填写 `PLJ110`。命令会生成 Release APK、通过 ADB 安装并启动应用。

也可仅构建 APK，再手动安装：

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 17) pnpm --dir mobile build:android:release
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

当前 Release 变体使用本地调试签名，仅适合开发测试；发布应用商店前需要配置正式签名。部分 OPPO/ColorOS 设备会要求在手机端确认“电脑端未知来源”安装，或先关闭“安装增强防护”。

## 校验

```bash
pnpm --dir mobile typecheck
pnpm --dir mobile exec expo export --platform android
```

## 数据

- EPUB 文件：复制到 Expo `documentDirectory/moon-library/`
- 书库元数据、阅读进度、书架、书签、主题和字号：AsyncStorage
- EPUB 排版：`@epubjs-react-native/core` + React Native WebView
