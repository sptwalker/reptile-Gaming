/**
 * 用户路由
 * POST /api/user/register — 无需鉴权，IP限流 5/min
 * POST /api/user/login    — 无需鉴权，IP限流 10/min
 * POST /api/user/info     — 需要鉴权 🔒
 */

'use strict';

const { Router }          = require('express');
const authMiddleware      = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rate-limit');
const { validateRegister, validateLogin } = require('../utils/validator');
const { ok, fail }        = require('../utils/response');
const userService         = require('../services/user-service');

const router = Router();

/**
 * POST /api/user/register
 * 限流：同IP 5次/分钟
 */
router.post('/register',
    createRateLimiter({ window: 60, max: 5, key: 'ip' }),
    (req, res) => {
        /* 参数校验 (S-C01) */
        const errors = validateRegister(req.body);
        if (errors.length > 0) {
            return fail(res, 1001, errors.join('; '));
        }

        const result = userService.register(req.body, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/user/login
 * 限流：同IP 10次/分钟
 */
router.post('/login',
    createRateLimiter({ window: 60, max: 10, key: 'ip' }),
    (req, res) => {
        /* 参数校验 (S-C01) */
        const errors = validateLogin(req.body);
        if (errors.length > 0) {
            return fail(res, 1001, errors.join('; '));
        }

        const result = userService.login(req.body, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/user/info 🔒
 * 通过 token 识别用户
 */
router.post('/info', authMiddleware, (req, res) => {
    const result = userService.getUserInfo(req.uid);
    if (result.code !== 0) {
        return fail(res, result.code, result.msg);
    }
    ok(res, result.data);
});

module.exports = router;
