/**
 * 管理员鉴权中间件
 * 独立于玩家鉴权体系，使用 ADMIN_KEY 静态密钥
 * 请求头: X-Admin-Key: {key}
 * 与玩家业务完全隔离
 */

'use strict';

const config = require('../config');
const { fail } = require('../utils/response');

/** 管理员密钥（环境变量或默认开发密钥） */
const ADMIN_KEY = process.env.ADMIN_KEY || 'reptile_admin_2026';

/**
 * Express 中间件：校验管理员密钥
 */
function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!key || key !== ADMIN_KEY) {
        return fail(res, 8001, '管理员认证失败');
    }
    req.isAdmin = true;
    next();
}

module.exports = adminAuth;
