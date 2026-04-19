/**
 * JWT 鉴权中间件
 * 除 /api/user/register 和 /api/user/login 外，所有接口必须通过校验 (S-B01)
 * 解析 Authorization: Bearer {token}，验证成功后注入 req.uid
 */

'use strict';

const { verifyToken } = require('../utils/crypto');
const { fail }        = require('../utils/response');

/**
 * Express 中间件：校验 JWT Token
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

    /* 将用户ID注入请求对象，后续路由可直接使用 req.uid */
    req.uid = payload.uid;
    next();
}

module.exports = authMiddleware;
