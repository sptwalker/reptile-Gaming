'use strict';
/**
 * electron-main.js — Electron 主进程
 * 打开一个内置 Chromium 的桌面窗口，加载内联好的单文件演示（app/index.html）。
 * 打包后自带运行时，无需目标电脑安装浏览器或 Node。
 */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#0a0c12',
    title: '蜥蜴动画教学实验室',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.whenReady().then(function () {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
