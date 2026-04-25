/**
 * Express 服务入口
 * - 加载配置，校验关键环境变量
 * - 初始化数据库
 * - 挂载中间件：CORS、JSON解析、静态资源
 * - 注册路由
 * - 全局错误处理（生产环境脱敏 S-F04）
 */

'use strict';

const express        = require('express');
const cors           = require('cors');
const path           = require('path');
const config         = require('./config');
const { initDB }     = require('./db');
const authMiddleware = require('./middleware/auth');

/* ── 启动前校验 ── */
if (config.NODE_ENV === 'production' && config.JWT_SECRET === 'dev_secret_DO_NOT_USE_IN_PROD') {
    console.error('[FATAL] 生产环境必须设置 JWT_SECRET 环境变量');
    process.exit(1);
}
if (config.NODE_ENV === 'production' && !config.ALLOWED_ORIGIN) {
    console.error('[FATAL] 生产环境必须设置 ALLOWED_ORIGIN 环境变量');
    process.exit(1);
}

/* ── 初始化数据库 ── */
initDB();

/* ── 创建 Express 实例 ── */
const app = express();

/* 信任第一层反向代理，确保 req.ip 获取真实客户端IP (SEC-03) */
app.set('trust proxy', 1);

/* ── 中间件 ── */

/* CORS (S-F02) — 支持 GET+POST 以兼容 P9 竞技场 GET 路由 */
app.use(cors({
    origin:         config.ALLOWED_ORIGIN,
    methods:        ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Seq', 'X-Admin-Key']
}));

/* JSON 解析，限制请求体大小 (S-F03) */
app.use(express.json({ limit: config.BODY_LIMIT }));

/* 静态资源：托管 client/ 目录，设置缓存头提升加载速度 */
app.use(express.static(path.join(__dirname, '..', 'client'), {
    maxAge: config.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
    lastModified: true,
}));

/* ── 路由注册 ── */

/* 用户模块（register/login 无需鉴权，info 在路由内部挂鉴权） */
app.use('/api/user', require('./routes/user'));

/* 宠物蛋模块（全部需要鉴权） */
app.use('/api/egg', authMiddleware, require('./routes/egg'));

/* 孵化模块（全部需要鉴权） */
app.use('/api/hatch', authMiddleware, require('./routes/hatch'));

/* 宠物模块（全部需要鉴权） */
app.use('/api/pet', authMiddleware, require('./routes/pet'));

/* 养成模块（全部需要鉴权） (P5) */
app.use('/api/nurture', authMiddleware, require('./routes/nurture'));

/* 日志模块（全部需要鉴权） */
app.use('/api/log', authMiddleware, require('./routes/log'));

/* 跑道模块（全部需要鉴权） (P7) */
app.use('/api/treadmill', authMiddleware, require('./routes/treadmill'));

/* 繁殖模块（全部需要鉴权） (P8) */
app.use('/api/breeding', authMiddleware, require('./routes/breeding'));

/* 竞技场模块（全部需要鉴权） (P9) */
app.use('/api/arena', authMiddleware, require('./routes/arena'));

/* 管理员后台（独立鉴权，与玩家体系完全隔离） */
const adminAuth = require('./middleware/admin-auth');
app.use('/api/admin', adminAuth, require('./routes/admin'));
app.use('/api/battle-debug', adminAuth, require('./routes/battle-debug'));

/* ── 404 处理 ── */
app.use('/api/{*path}', (_req, res) => {
    res.json({ code: 1001, data: null, msg: '接口不存在' });
});

/* ── 全局错误处理 (S-F04 + S-C04 JSON解析错误) ── */
app.use((err, req, res, _next) => {
    /* JSON 解析失败 */
    if (err.type === 'entity.parse.failed') {
        return res.json({ code: 1001, data: null, msg: '请求格式错误' });
    }
    console.error(`[ERROR] ${req.method} ${req.path}`, err.message || err);
    res.json({
        code: 9999,
        data: null,
        msg: config.NODE_ENV === 'production' ? '服务器内部错误' : err.message
    });
});

/* ── 启动服务 ── */
app.listen(config.PORT, () => {
    console.log(`[Server] 运行中 http://localhost:${config.PORT}`);
    console.log(`[Server] 环境: ${config.NODE_ENV}`);
});

/* ── 定时任务：过期战斗记录清理（每小时执行一次） ── */
const arenaService = require('./services/arena-service');
setInterval(() => {
    try {
        const result = arenaService.cleanExpiredRecords();
        if (result.deleted > 0) {
            console.log(`[Cron] 清理过期战斗记录: ${result.deleted} 条`);
        }
    } catch (e) {
        console.error('[Cron] 清理过期记录失败:', e.message);
    }
}, 60 * 60 * 1000);

// 启动时也立即清理一次
try { arenaService.cleanExpiredRecords(); } catch (_) {}
