/**
 * 管理员后台路由
 * 所有端点挂载 adminAuth 中间件（在 index.js 中统一挂载）
 * 路径前缀: /api/admin
 */

'use strict';

const router = require('express').Router();
const { ok, fail } = require('../utils/response');
const admin = require('../services/admin-service');

/* ── 统计 ── */

router.get('/stats', (_req, res) => {
    ok(res, admin.getStats());
});

router.get('/stats/economy', (_req, res) => {
    ok(res, admin.getEconomyStats());
});

router.get('/stats/distributions', (_req, res) => {
    ok(res, admin.getDistributions());
});

router.get('/stats/breeding', (_req, res) => {
    ok(res, admin.getBreedingStats());
});

/* ── 玩家管理 ── */

router.get('/users', (req, res) => {
    const keyword = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.size) || 20;
    if (!keyword) return fail(res, 8012, '请输入搜索关键词');
    ok(res, admin.searchUsers(keyword, page, pageSize));
});

router.get('/users/:uid', (req, res) => {
    const uid = parseInt(req.params.uid);
    if (!uid) return fail(res, 8010, '无效用户ID');
    const detail = admin.getUserDetail(uid);
    if (!detail) return fail(res, 8010, '用户不存在');
    ok(res, detail);
});

router.post('/users/:uid/modify', (req, res) => {
    const uid = parseInt(req.params.uid);
    if (!uid) return fail(res, 8010, '无效用户ID');
    const result = admin.modifyUser(uid, req.body);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, result.data, result.msg);
});

router.post('/users/:uid/ban', (req, res) => {
    const uid = parseInt(req.params.uid);
    if (!uid) return fail(res, 8010, '无效用户ID');
    const result = admin.banUser(uid);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, null, result.msg);
});

router.post('/users/:uid/unban', (req, res) => {
    const uid = parseInt(req.params.uid);
    if (!uid) return fail(res, 8010, '无效用户ID');
    const result = admin.unbanUser(uid);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, null, result.msg);
});

/* ── 宠物管理 ── */

router.get('/pets/:petId', (req, res) => {
    const petId = parseInt(req.params.petId);
    if (!petId) return fail(res, 8020, '无效宠物ID');
    const detail = admin.getPetDetail(petId);
    if (!detail) return fail(res, 8020, '宠物不存在');
    ok(res, detail);
});

router.post('/pets/:petId/modify', (req, res) => {
    const petId = parseInt(req.params.petId);
    if (!petId) return fail(res, 8020, '无效宠物ID');
    const result = admin.modifyPet(petId, req.body);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, null, result.msg);
});

/* ── 战斗记录 ── */

router.get('/battles', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.size) || 20;
    const filters = {};
    if (req.query.uid) filters.uid = parseInt(req.query.uid);
    if (req.query.petId) filters.petId = parseInt(req.query.petId);
    if (req.query.result) filters.result = req.query.result;
    ok(res, admin.getBattleRecords(page, pageSize, filters));
});

/* ── 数值调控 ── */

router.get('/rules', (_req, res) => {
    ok(res, admin.getRules());
});

router.post('/rules', (req, res) => {
    const changes = req.body;
    if (!changes || typeof changes !== 'object') return fail(res, 8030, '无效参数');
    const result = admin.updateRules(changes);
    ok(res, result, `已更新 ${result.count} 个参数`);
});

/* ── 测试模块 ── */

router.post('/test/create-pet', (req, res) => {
    const { uid, quality, gender, level, stage, name, renderParams, bodySeed, hiddenGene, attrBases, skills } = req.body;
    if (!uid) return fail(res, 8010, '需要指定用户ID');
    const result = admin.quickCreatePet(uid, { quality, gender, level, stage, name, renderParams, bodySeed, hiddenGene, attrBases, skills });
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, result.data);
});

router.post('/test/boost-pet', (req, res) => {
    const { petId, level, exp, stage, stamina, mood } = req.body;
    if (!petId) return fail(res, 8020, '需要指定宠物ID');
    const result = admin.boostPet(petId, { level, exp, stage, stamina, mood });
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, null, result.msg);
});

router.post('/test/clone-pet', (req, res) => {
    const { sourcePetId, targetUid } = req.body;
    if (!sourcePetId || !targetUid) return fail(res, 8022, '需要源宠物ID和目标用户ID');
    const result = admin.clonePet(sourcePetId, targetUid);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, result.data);
});

router.post('/test/battle', (req, res) => {
    const { pet1Id, pet2Id } = req.body;
    if (!pet1Id || !pet2Id) return fail(res, 8023, '需要两只宠物ID');
    const result = admin.testBattle(pet1Id, pet2Id);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, result.data);
});

router.post('/test/breeding', (req, res) => {
    const { pet1Id, pet2Id } = req.body;
    if (!pet1Id || !pet2Id) return fail(res, 8024, '需要两只宠物ID');
    const result = admin.testBreeding(pet1Id, pet2Id);
    if (result.code !== 0) return fail(res, result.code, result.msg);
    ok(res, result.data);
});

module.exports = router;
