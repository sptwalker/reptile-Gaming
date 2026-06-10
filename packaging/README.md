# 蜥蜴动画教学实验室 — 独立打包

把 `client/` 下的教学演示打包成可在**新电脑上独立运行**的形式。演示本身是纯静态前端（无第三方库、无后端、无联网），因此提供两种交付物：

## A. 单文件离线 HTML（最轻量，任意系统）

把 CSS 与全部 JS 内联进一个 `.html`，零依赖，双击用浏览器打开即可运行。

```bash
cd packaging
node build-standalone.js dist/蜥蜴动画教学.html
```

产物：`packaging/dist/蜥蜴动画教学.html`。拷到任意电脑（Windows 自带 Edge 即可），双击打开。无需安装、无需联网。

## B. Windows 安装包（自带运行时，无需浏览器/Node）

用 Electron 把内置 Chromium 一起打包，生成 Windows 安装程序（NSIS `.exe`）和免安装便携版（portable `.exe`）。

```bash
cd packaging
npm install            # 安装 electron 与 electron-builder（约 200MB，需联网一次）
npm run dist           # 生成安装包
```

产物（在 `packaging/dist/`）：
- `蜥蜴动画教学-1.0.0-x64.exe` —— NSIS 安装程序（可选安装路径、建桌面快捷方式）
- `蜥蜴动画教学-1.0.0-x64.exe`（portable）—— 免安装，拷过去直接双击运行

把安装程序拷到新电脑，双击安装→开始菜单/桌面启动；或用便携版直接运行。**目标电脑无需安装任何浏览器或 Node 运行时**。

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
