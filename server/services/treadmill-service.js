/**
 * 跑道业务逻辑 (P7)
 * - install：安装/升级跑道（扣金币）
 * - start：启动跑步（心情+性格→时长）
 * - collect：收集产出金币（计算时间×速率，每日上限）
 * - status：查询跑道状态
 *
 * 所有时间使用服务端 Unix 秒级时间戳 (S-G05)
 * 所有随机数使用 secureRandom (S-A03)
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const rules                    = require('../models/game-rules');
const { secureRandomFloat }    = require('../utils/random');

/**
 * 获取 UTC+8 今日日期字符串 YYYY-MM-DD
 * @returns {string}
 */
function _todayStr() {
    const d = new Date(Date.now() + 8 * 3600_000);
    return d.toISOString().slice(0, 10);
}

/**
 * 查询跑道状态
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function getStatus(uid, petId) {
    const db = getDB();
    const pet = db.prepare('SELECT id, user_id, mood FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };

    const tm = db.prepare('SELECT * FROM treadmill WHERE pet_id = ? AND user_id = ?').get(petId, uid);
    if (!tm) {
        return {
            code: 0,
            data: { installed: false, tier: 0, tier_name: null, is_running: false, collected_today: 0, daily_cap: 0 },
            msg: 'success'
        };
    }

    const tierInfo = rules.TREADMILL_TIERS[tm.tier];
    const today = _todayStr();
    const collectedToday = tm.last_reset_date === today ? tm.collected_today : 0;

    return {
        code: 0,
        data: {
            installed: true,
            tier: tm.tier,
            tier_name: tierInfo.name,
            is_running: tm.is_running === 1,
            started_at: tm.started_at,
            collected_today: collectedToday,
            daily_cap: tierInfo.daily_cap,
            gold_per_min: tierInfo.gold_per_min
        },
        msg: 'success'
    };
}

/**
 * 安装或升级跑道
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @param {number} tier  目标等级 (1~4)
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function install(uid, petId, tier, ip) {
    const db = getDB();
    const ts = now();

    const tierInfo = rules.TREADMILL_TIERS[tier];
    if (!tierInfo) return { code: 1001, data: null, msg: '无效的跑道等级' };

    const pet = db.prepare('SELECT id, user_id FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };

    const existing = db.prepare('SELECT * FROM treadmill WHERE pet_id = ?').get(petId);

    /* 不能降级 */
    if (existing && tier <= existing.tier) {
        return { code: 4001, data: null, msg: '只能升级到更高等级的跑道' };
    }

    /* 必须逐级升级 */
    if (existing && tier !== existing.tier + 1) {
        return { code: 4001, data: null, msg: '只能升级到下一级跑道' };
    }
    if (!existing && tier !== 1) {
        return { code: 4001, data: null, msg: '请先安装初级跑道' };
    }

    /* 金币检测 */
    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);
    if (!user || user.gold < tierInfo.install_cost) {
        return { code: 5002, data: null, msg: `金币不足，安装${tierInfo.name}需要${tierInfo.install_cost}金币` };
    }

    const txn = db.transaction(() => {
        /* 扣金币 */
        if (tierInfo.install_cost > 0) {
            db.prepare('UPDATE user SET gold = gold - ?, updated_at = ? WHERE id = ?')
                .run(tierInfo.install_cost, ts, uid);
        }

        if (existing) {
            /* 升级：停止运行 */
            db.prepare('UPDATE treadmill SET tier = ?, is_running = 0, updated_at = ? WHERE pet_id = ?')
                .run(tier, ts, petId);
        } else {
            /* 新安装 */
            db.prepare(`
                INSERT INTO treadmill (pet_id, user_id, tier, is_running, started_at, collected_today, last_collect_at, last_reset_date, created_at, updated_at)
                VALUES (?, ?, ?, 0, 0, 0, 0, '', ?, ?)
            `).run(petId, uid, tier, ts, ts);
        }
    });
    txn();

    writeLog(uid, 'treadmill_install', 'pet', petId, {
        tier, cost: tierInfo.install_cost, gold_remain: user.gold - tierInfo.install_cost
    }, ip);

    return {
        code: 0,
        data: {
            tier,
            tier_name: tierInfo.name,
            gold_cost: tierInfo.install_cost,
            gold_remain: user.gold - tierInfo.install_cost
        },
        msg: 'success'
    };
}

/**
 * 启动跑步
 * 运行时长 = 基础时长 × (1 + mood/200)
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function startRun(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const pet = db.prepare('SELECT id, user_id, mood, stamina FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };

    if (pet.stamina < 5) {
        return { code: 5001, data: null, msg: '体力不足，跑步需要体力≥5' };
    }

    const tm = db.prepare('SELECT * FROM treadmill WHERE pet_id = ? AND user_id = ?').get(petId, uid);
    if (!tm) return { code: 4001, data: null, msg: '请先安装跑道' };

    if (tm.is_running === 1) {
        return { code: 4001, data: null, msg: '跑道已在运行中' };
    }

    /* 检查每日上限 */
    const tierInfo = rules.TREADMILL_TIERS[tm.tier];
    const today = _todayStr();
    const collectedToday = tm.last_reset_date === today ? tm.collected_today : 0;
    if (collectedToday >= tierInfo.daily_cap) {
        return { code: 4001, data: null, msg: '今日产出已达上限' };
    }

    /* 运行时长受心情影响 */
    const duration = Math.floor(rules.TREADMILL_BASE_DURATION * (1 + pet.mood / 200));

    db.prepare('UPDATE treadmill SET is_running = 1, started_at = ?, updated_at = ? WHERE pet_id = ?')
        .run(ts, ts, petId);

    /* 扣少量体力 */
    db.prepare('UPDATE pet SET stamina = MAX(0, stamina - 5), updated_at = ? WHERE id = ?')
        .run(ts, petId);

    writeLog(uid, 'treadmill_start', 'pet', petId, { duration, mood: pet.mood }, ip);

    return {
        code: 0,
        data: {
            is_running: true,
            started_at: ts,
            duration,
            stamina_cost: 5
        },
        msg: 'success'
    };
}

/**
 * 收集跑道产出金币
 * 金币 = floor(运行分钟数 × gold_per_min)，受每日上限约束
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function collect(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const pet = db.prepare('SELECT id, user_id FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };

    const tm = db.prepare('SELECT * FROM treadmill WHERE pet_id = ? AND user_id = ?').get(petId, uid);
    if (!tm) return { code: 4001, data: null, msg: '请先安装跑道' };

    if (tm.is_running !== 1) {
        return { code: 4001, data: null, msg: '跑道未在运行' };
    }

    const tierInfo = rules.TREADMILL_TIERS[tm.tier];
    const today = _todayStr();

    /* 每日重置 */
    let collectedToday = tm.last_reset_date === today ? tm.collected_today : 0;

    /* 计算运行时间产出 */
    const elapsedSec = ts - tm.started_at;
    const elapsedMin = elapsedSec / 60;
    let goldEarned = Math.floor(elapsedMin * tierInfo.gold_per_min);

    /* 每日上限约束 */
    const remaining = tierInfo.daily_cap - collectedToday;
    if (remaining <= 0) {
        /* 停止跑道 */
        db.prepare('UPDATE treadmill SET is_running = 0, last_reset_date = ?, updated_at = ? WHERE pet_id = ?')
            .run(today, ts, petId);
        return { code: 4001, data: null, msg: '今日产出已达上限' };
    }
    goldEarned = Math.min(goldEarned, remaining);

    if (goldEarned <= 0) {
        return { code: 4001, data: null, msg: '运行时间太短，暂无产出' };
    }

    const txn = db.transaction(() => {
        /* 加金币 */
        db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?')
            .run(goldEarned, ts, uid);

        /* 更新跑道：停止运行，记录今日收集量 */
        db.prepare(`
            UPDATE treadmill SET is_running = 0, collected_today = ?, last_collect_at = ?,
                                  last_reset_date = ?, updated_at = ?
            WHERE pet_id = ?
        `).run(collectedToday + goldEarned, ts, today, ts, petId);
    });
    txn();

    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);

    writeLog(uid, 'gold_change', 'user', uid, {
        delta: goldEarned, reason: 'treadmill', balance: user.gold
    }, ip);

    return {
        code: 0,
        data: {
            gold_earned: goldEarned,
            gold_remain: user.gold,
            collected_today: collectedToday + goldEarned,
            daily_cap: tierInfo.daily_cap,
            elapsed_seconds: elapsedSec
        },
        msg: 'success'
    };
}

module.exports = { getStatus, install, startRun, collect };
