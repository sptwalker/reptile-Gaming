'use strict';
/**
 * build-standalone.js — 把教学演示打包成“单文件离线 HTML”
 * 读取 client/animation-lab.html，将其引用的 CSS 与全部 JS 内联进同一个 .html，
 * 产出文件零外部依赖、可在任意带浏览器的电脑上双击运行（无需 Node / 服务器 / 联网）。
 */
const fs = require('fs');
const path = require('path');

const CLIENT = path.resolve(__dirname, '..', 'client');
const SRC_HTML = path.join(CLIENT, 'animation-lab.html');
const OUT = process.argv[2] || path.join(__dirname, 'app', 'index.html');

let html = fs.readFileSync(SRC_HTML, 'utf8');

// 内联 <link rel="stylesheet" href="...">
html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, function (m, href) {
  var css = fs.readFileSync(path.join(CLIENT, href), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

// 内联 <script src="..."></script>（保持原顺序）
html = html.replace(/<script\s+src="([^"]+)"><\/script>/g, function (m, src) {
  var js = fs.readFileSync(path.join(CLIENT, src), 'utf8');
  return '<script>\n' + js + '\n</script>';
});

// 安全检查：不应再残留对本地资源的外部引用
if (/href="css\//.test(html) || /src="js\//.test(html)) {
  throw new Error('内联不完整：仍有未内联的本地 css/js 引用');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('✓ 单文件离线 HTML 已生成:', OUT, '(' + html.length + ' 字节)');
