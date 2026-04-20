/**
 * 孵化路由
 * POST /api/hatch/start  🔒 — 开始孵化
 * POST /api/hatch/status 🔒 — 查询孵化状态
 * POST /api/hatch/finish 🔒 — 完成孵化（天赋分配）
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const { isValidInt, isValidString } = require('../utils/validator');
const hatchService          = require('../services/hatch-service');

const router = Router();

/**
 * POST /api/hatch/start
 */
router.post('/start',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const { egg_id } = req.body || {};
        if (!isValidInt(egg_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'egg_id 参数错误');
        }

        const result = hatchService.startHatch(req.uid, egg_id, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/hatch/status
 */
router.post('/status',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const { egg_id } = req.body || {};
        if (!isValidInt(egg_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'egg_id 参数错误');
        }

        const result = hatchService.getHatchStatus(req.uid, egg_id);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/hatch/finish
 * talents 可选：传入则手动分配，不传则服务端自动随机分配
 */
router.post('/finish',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const { egg_id, pet_name, talents } = req.body || {};

        /* 参数校验 (S-C01) */
        if (!isValidInt(egg_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'egg_id 参数错误');
        }
        if (!isValidString(pet_name, 1, 12)) {
            return fail(res, 1001, '宠物名称须为1~12字符');
        }
        /* talents 可选：null/undefined = 自动模式，object = 手动模式 */
        if (talents !== undefined && talents !== null && typeof talents !== 'object') {
            return fail(res, 1001, 'talents 参数错误');
        }

        const result = hatchService.finishHatch(req.uid, egg_id, pet_name, talents || null, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

module.exports = router;
