/**
 * 宠物路由 (P4 + P5 + P7)
 * POST /api/pet/list     🔒 — 获取宠物列表
 * POST /api/pet/detail   🔒 — 获取宠物详情
 * POST /api/pet/sync     🔒 — 同步宠物状态（时间衰减后最新值）
 * POST /api/pet/evaluate 🔒 — 评估宠物售价 (P7)
 * POST /api/pet/sell     🔒 — 售卖宠物 (P7)
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const { isValidInt }        = require('../utils/validator');
const petService            = require('../services/pet-service');
const nurtureService        = require('../services/nurture-service');
const petSellService        = require('../services/pet-sell-service');

const router = Router();

/**
 * POST /api/pet/list
 */
router.post('/list',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const result = petService.listPets(req.uid);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/pet/detail
 */
router.post('/detail',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }

        const result = petService.getPetDetail(req.uid, pet_id);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/pet/sync (P5)
 * 同步宠物状态：服务端计算离线衰减后返回最新数值
 */
router.post('/sync',
    createRateLimiter({ window: 60, max: 12, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }

        const result = nurtureService.syncPet(req.uid, pet_id);
        if (result.code !== 0) {
            return fail(res, result.code, result.msg);
        }
        ok(res, result.data);
    }
);

/**
 * POST /api/pet/evaluate (P7)
 * 评估宠物售价
 */
router.post('/evaluate',
    createRateLimiter({ window: 60, max: 20, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = petSellService.evaluate(req.uid, pet_id);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

/**
 * POST /api/pet/sell (P7)
 * 售卖宠物
 */
router.post('/sell',
    createRateLimiter({ window: 60, max: 3, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = petSellService.sellPet(req.uid, pet_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

module.exports = router;
