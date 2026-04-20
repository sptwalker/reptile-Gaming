/**
 * 日志查询路由
 * POST /api/log/list 🔒 — 查询当前用户的操作日志
 */

'use strict';

const { Router }            = require('express');
const { createRateLimiter } = require('../middleware/rate-limit');
const { getDB }             = require('../db');
const { ok, fail }          = require('../utils/response');
const { isValidInt }        = require('../utils/validator');

const router = Router();

/**
 * POST /api/log/list
 * 参数：action(可选), page(默认1), page_size(默认20, 最大50)
 */
router.post('/list',
    createRateLimiter({ window: 60, max: 10, key: 'uid' }),
    (req, res) => {
    const db = getDB();
    const uid = req.uid;

    let { action, page, page_size } = req.body || {};

    /* 默认值与校验 */
    page = isValidInt(page, 1, 9999) ? page : 1;
    page_size = isValidInt(page_size, 1, 50) ? page_size : 20;

    const offset = (page - 1) * page_size;

    let countSql = 'SELECT COUNT(*) AS total FROM log WHERE user_id = ?';
    let querySql = 'SELECT id, action, target_type, target_id, detail, created_at FROM log WHERE user_id = ?';
    const params = [uid];

    /* 可选：按操作类型筛选 */
    if (action && typeof action === 'string') {
        countSql += ' AND action = ?';
        querySql += ' AND action = ?';
        params.push(action.trim());
    }

    querySql += ' ORDER BY id DESC LIMIT ? OFFSET ?';

    const totalRow = db.prepare(countSql).get(...params);
    const logs = db.prepare(querySql).all(...params, page_size, offset);

    ok(res, {
        total: totalRow.total,
        page,
        page_size,
        logs
    });
});

module.exports = router;
