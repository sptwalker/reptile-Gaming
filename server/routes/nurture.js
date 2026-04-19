/**
 * 养成路由 (P5 + P6)
 * POST /api/nurture/feed   🔒 — 喂食
 * POST /api/nurture/rest   🔒 — 休息
 * POST /api/nurture/evolve 🔒 — 蜕变
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const { isValidInt }        = require('../utils/validator');
const nurtureService        = require('../services/nurture-service');

const router = Router();

/**
 * POST /api/nurture/feed
 * 喂食宠物：扣金币、加饱食/经验/心情、升级检测
 */
router.post('/feed',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
        const { pet_id, food } = req.body || {};

        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        if (typeof food !== 'string' || !food.trim()) {
            return fail(res, 1001, 'food 参数错误');
        }

        const result = nurtureService.feedPet(req.uid, pet_id, food.trim(), req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg, result.data);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/nurture/rest
 * 宠物休息：恢复体力
 */
router.post('/rest',
    createRateLimiter({ window: 60, max: 5, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};

        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }

        const result = nurtureService.restPet(req.uid, pet_id, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg, result.data);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/nurture/evolve
 * 宠物蜕变：提升阶段、属性加成、技能解锁 (P6)
 */
router.post('/evolve',
    createRateLimiter({ window: 60, max: 3, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};

        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }

        const result = nurtureService.evolvePet(req.uid, pet_id, req.ip);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg, result.data);
        }
        ok(res, result.data);
    }
);

module.exports = router;
