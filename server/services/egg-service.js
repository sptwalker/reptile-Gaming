/**
 * 宠物蛋业务逻辑
 * - 领取初始蛋：限1枚，加权随机品质，生成外观种子 (S-A01/S-A03)
 * - 查询蛋列表：返回当前用户所有蛋
 * - 每次操作从数据库读取最新状态校验 (S-A04)
 * - 所有关键操作写入 log 表 (S-E04)
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const { secureRandom }         = require('../utils/random');
const rules                    = require('../models/game-rules');

/**
 * 加权随机品质 (docs/03-game-rules.md §1.3)
 * weights = [50, 30, 13, 5, 2]，总和100
 * @returns {number} 品质等级 1~5
 */
function rollQuality() {
    const roll = secureRandom(1, 100);
    let acc = 0;
    for (let i = 0; i < rules.QUALITY_WEIGHTS.length; i++) {
        acc += rules.QUALITY_WEIGHTS[i];
        if (roll <= acc) return i + 1;
    }
    return 1;
}

/**
 * 生成外观种子 (docs/03-game-rules.md §9)
 * 品质越高 → 饱和度越高、花纹越复杂
 * @param {number} quality 品质等级
 * @returns {object} pattern_seed JSON 对象
 */
function generatePatternSeed(quality) {
    return {
        bodyHue:        secureRandom(0, 360),
        bodyLightness:  secureRandom(20, 80),
        patternType:    secureRandom(0, Math.min(quality, 3)),
        patternHue:     secureRandom(0, 360),
        patternDensity: secureRandom(1, quality),
        eyeColor:       secureRandom(0, 360),
        tailRatio:      +(0.2 + secureRandom(0, 30) / 100).toFixed(2),
        headShape:      secureRandom(0, 2)
    };
}

/**
 * 领取初始蛋
 * @param {number} uid 用户ID
 * @param {string} ip  请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function claimEgg(uid, ip) {
    const db = getDB();
    const ts = now();

    /* 从数据库读取最新用户状态 (S-A04) */
    const user = db.prepare('SELECT id, egg_claimed FROM user WHERE id = ?').get(uid);
    if (!user) {
        return { code: 1002, data: null, msg: '用户不存在' };
    }

    /* 校验领取资格：每人限1枚 */
    if (user.egg_claimed !== 0) {
        return { code: 3002, data: null, msg: '已领取过蛋' };
    }

    /* 服务端随机品质 (S-A01/S-A03) */
    const quality = rollQuality();

    /* 根据品质确定孵化时长 */
    const hatchDuration = rules.HATCH_DURATION[quality];

    /* 生成外观种子 */
    const patternSeed = generatePatternSeed(quality);

    /* 事务：创建蛋 + 更新用户 egg_claimed */
    const insertEgg = db.prepare(`
        INSERT INTO pet_egg (user_id, quality, pattern_seed, is_hatched, hatch_start_at, hatch_duration, talent_points, created_at, updated_at)
        VALUES (?, ?, ?, 0, 0, ?, 0, ?, ?)
    `);
    const updateUser = db.prepare('UPDATE user SET egg_claimed = 1, updated_at = ? WHERE id = ?');

    const txn = db.transaction(() => {
        const result = insertEgg.run(uid, quality, JSON.stringify(patternSeed), hatchDuration, ts, ts);
        updateUser.run(ts, uid);
        return result.lastInsertRowid;
    });

    const eggId = txn();

    /* 审计日志 (S-E04) */
    writeLog(uid, 'egg_claim', 'egg', eggId, { egg_id: eggId, quality }, ip);

    return {
        code: 0,
        data: {
            egg_id:       eggId,
            quality,
            quality_name: rules.QUALITY_NAMES[quality],
            pattern_seed: patternSeed
        },
        msg: 'success'
    };
}

/**
 * 查询用户的蛋列表
 * @param {number} uid 用户ID
 * @returns {{ code: number, data: object, msg: string }}
 */
function listEggs(uid) {
    const db = getDB();

    const eggs = db.prepare(`
        SELECT id, quality, is_hatched, hatch_start_at, hatch_duration, talent_points, created_at
        FROM pet_egg WHERE user_id = ? ORDER BY id DESC
    `).all(uid);

    /* 附加品质名称 */
    const result = eggs.map(e => ({
        ...e,
        quality_name: rules.QUALITY_NAMES[e.quality]
    }));

    return { code: 0, data: { eggs: result }, msg: 'success' };
}

module.exports = { claimEgg, listEggs, rollQuality, generatePatternSeed };
