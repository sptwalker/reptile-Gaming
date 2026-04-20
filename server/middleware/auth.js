/**
 * JWT 鉴权中间件
 * 除 /api/user/register 和 /api/user/login 外，所有接口必须通过校验 (S-B01)
 * 解析 Authorization: Bearer {token}，验证成功后注入 req.uid
 * SEC-04: 增加 token_version 比对，支持 Token 吊销
 */

'use strict';

const { verifyToken } = require('../utils/crypto');
const { getDB }       = require('../db');
const { fail }        = require('../utils/response');

/**
 * Express 中间件：校验 JWT Token + token_version
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return fail(res, 1002, '未登录/Token过期');
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
        return fail(res, 1002, '未登录/Token过期');
    }

    /* SEC-04: 比对 token_version，不匹配则视为已吊销 */
    const db = getDB();
    const user = db.prepare('SELECT token_version FROM user WHERE id = ?').get(payload.uid);
    if (!user || (payload.tv || 1) !== (user.token_version || 1)) {
        return fail(res, 1002, '登录已失效，请重新登录');
    }

    /* 将用户ID注入请求对象，后续路由可直接使用 req.uid */
    req.uid = payload.uid;
    next();
}

module.exports = authMiddleware;
