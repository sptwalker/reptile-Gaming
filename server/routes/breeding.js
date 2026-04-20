/**
 * 繁殖路由 (P8)
 * POST /api/breeding/market/list     🔒 — 上架宠物到交友市场
 * POST /api/breeding/market/unlist   🔒 — 下架宠物
 * POST /api/breeding/market/browse   🔒 — 浏览交友市场
 * POST /api/breeding/invite/send     🔒 — 发送配对邀请
 * POST /api/breeding/invite/list     🔒 — 查看收到的邀请
 * POST /api/breeding/invite/accept   🔒 — 接受邀请
 * POST /api/breeding/invite/reject   🔒 — 拒绝邀请
 * POST /api/breeding/cage/status     🔒 — 查看交配笼状态
 * POST /api/breeding/cage/finish     🔒 — 完成交配（领取蛋）
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ok, fail }          = require('../utils/response');
const { isValidInt }        = require('../utils/validator');
const breedingService       = require('../services/breeding-service');

const router = Router();

/* ── 交友市场 ── */

router.post('/market/list',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = breedingService.listPetOnMarket(req.uid, pet_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

router.post('/market/unlist',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
        const { pet_id } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        const result = breedingService.unlistPet(req.uid, pet_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

router.post('/market/browse',
    createRateLimiter({ window: 60, max: 30, key: 'uid' }),
    (req, res) => {
        const { gender } = req.body || {};
        const g = gender ? parseInt(gender) : null;
        const result = breedingService.browseMarket(req.uid, g);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

/* ── 配对邀请 ── */

router.post('/invite/send',
    createRateLimiter({ window: 60, max: 5, key: 'uid' }),
    (req, res) => {
        const { pet_id, target_pet_id, egg_protocol } = req.body || {};
        if (!isValidInt(pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'pet_id 参数错误');
        }
        if (!isValidInt(target_pet_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'target_pet_id 参数错误');
        }
        const result = breedingService.sendInvite(req.uid, pet_id, target_pet_id, egg_protocol || 'single', req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

router.post('/invite/list',
    createRateLimiter({ window: 60, max: 20, key: 'uid' }),
    (req, res) => {
        const result = breedingService.listInvites(req.uid);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

router.post('/invite/accept',
    createRateLimiter({ window: 60, max: 5, key: 'uid' }),
    (req, res) => {
        const { invite_id } = req.body || {};
        if (!isValidInt(invite_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'invite_id 参数错误');
        }
        const result = breedingService.acceptInvite(req.uid, invite_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

router.post('/invite/reject',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
        const { invite_id } = req.body || {};
        if (!isValidInt(invite_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'invite_id 参数错误');
        }
        const result = breedingService.rejectInvite(req.uid, invite_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

/* ── 交配笼 ── */

router.post('/cage/status',
    createRateLimiter({ window: 60, max: 20, key: 'uid' }),
    (req, res) => {
        const result = breedingService.getCageStatus(req.uid);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

router.post('/cage/finish',
    createRateLimiter({ window: 60, max: 5, key: 'uid' }),
    (req, res) => {
        const { cage_id } = req.body || {};
        if (!isValidInt(cage_id, 1, Number.MAX_SAFE_INTEGER)) {
            return fail(res, 1001, 'cage_id 参数错误');
        }
        const result = breedingService.finishBreeding(req.uid, cage_id, req.ip);
        if (result.code !== 0) return fail(res, result.code, result.msg);
        ok(res, result.data);
    }
);

module.exports = router;
