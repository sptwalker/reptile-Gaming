# 蜥蜴动画教学实验室 — 独立打包

把 `client/` 下的教学演示打包成可在**新电脑上独立运行**的形式。演示本身是纯静态前端（无第三方库、无后端、无联网），因此提供两种交付物：

## A. 单文件离线 HTML（最轻量，任意系统）

把 CSS 与全部 JS 内联进一个 `.html`，零依赖，双击用浏览器打开即可运行。

```bash
cd packaging
node build-standalone.js dist/蜥蜴动画教学.html
```

产物：`packaging/dist/蜥蜴动画教学.html`。拷到任意电脑（Windows 自带 Edge 即可），双击打开。无需安装、无需联网。

## B. Windows 便携版 / 安装包（自带运行时，无需浏览器/Node）

用 Electron 把内置 Chromium 一起打包。先安装依赖（约 200MB，需联网一次）：

```bash
cd packaging
npm install
```

### B1. 便携版（推荐，最稳妥）

```bash
npm run standalone                         # 生成 app/index.html
npx electron-builder --win dir             # 生成免安装目录 dist/win-unpacked/
```

把 `dist/win-unpacked/` 整个文件夹拷到任意 Windows 电脑，双击里面的 `蜥蜴动画教学实验室.exe` 即可运行；或压缩成 zip 分发（仓库已提供脚本产物 `dist/蜥蜴动画教学-portable-win-x64.zip`，解压即用）。**目标电脑无需安装任何浏览器或 Node。**

### B2. NSIS 安装程序（生成 setup.exe）

```bash
npm run dist                               # 生成 NSIS 安装程序 + 便携 exe
```

产物：`dist/蜥蜴动画教学-1.0.0-x64.exe`（安装程序，可选安装路径、建桌面快捷方式）。

> ⚠️ 注意：electron-builder 打包 NSIS 时会解压 winCodeSign 工具，其中含 macOS 符号链接，**在未开启“开发者模式 / 管理员权限”的 Windows 上会因无权创建符号链接而失败**。若 `npm run dist` 报 “Cannot create symbolic link”，请任选其一后重试：
> - 设置 → 隐私和安全性 → 开发者选项 → 打开“开发人员模式”；或
> - 以管理员身份运行终端再执行 `npm run dist`。
> 便携版（B1）不受此限制。


## 本地预览（开发用）

```bash
cd packaging
npm install
npm start              # 生成单文件并用 Electron 打开
```

## 操作说明（演示内）

- 每个环节先显示提示词板，按 **空格** 隐藏并播放动画。
- **左键拖动**牵引蜥蜴；底部时间轴切换 13 个步骤。
- 第10步**右键**放置光点食物；第11步**右键**放置蠕动小虫（蜥蜴一倍身长外瞬间冲刺、连续捕食）。
- 顶部（底部工具条）**自动游走**开关、播放/调速/自动演进、第7步蛇形滑块、第12步外观滑块。
