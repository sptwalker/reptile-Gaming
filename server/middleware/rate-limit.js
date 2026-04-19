/**
 * 内存级接口限流中间件
 * 基于滑动窗口计数器，支持 IP 和 UID 两种维度 (S-D01)
 * 触发限流返回 { code: 9001, msg: '请求过于频繁' } (S-D04)
 */

'use strict';

const { fail } = require('../utils/response');

/**
 * 限流记录存储
 * @type {Map<string, { count: number, resetAt: number }>}
 */
const _store = new Map();

/** 定期清理过期记录（每5分钟），unref() 避免阻止进程退出 */
const _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of _store) {
        if (now > val.resetAt) _store.delete(key);
    }
}, 300000);
_cleanupTimer.unref();

/**
 * 创建限流中间件
 * @param {object} opts 配置
 * @param {number} opts.window 时间窗口（秒）
 * @param {number} opts.max    窗口内最大请求数
 * @param {'ip'|'uid'} opts.key 限流维度
 * @returns {Function} Express中间件
 */
function createRateLimiter(opts) {
    const { window: windowSec, max, key } = opts;

    return function rateLimitMiddleware(req, res, next) {
        /* 构造限流键 */
        let identifier;
        if (key === 'uid') {
            identifier = req.uid ? `uid:${req.uid}` : `ip:${req.ip}`;
        } else {
            identifier = `ip:${req.ip}`;
        }
        const storeKey = `${req.path}:${identifier}`;

        const now = Date.now();
        let record = _store.get(storeKey);

        if (!record || now > record.resetAt) {
            /* 窗口过期或首次请求，重置计数 */
            record = { count: 1, resetAt: now + windowSec * 1000 };
            _store.set(storeKey, record);
            return next();
        }

        record.count++;
        if (record.count > max) {
            const retryAfter = Math.ceil((record.resetAt - now) / 1000);
            return fail(res, 9001, '请求过于频繁', { retry_after: retryAfter });
        }

        next();
    };
}

module.exports = { createRateLimiter };
