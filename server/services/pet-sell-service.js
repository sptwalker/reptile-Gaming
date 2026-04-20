/**
 * 宠物售卖业务逻辑 (P7)
 * - evaluate：评估宠物售价（基于等级/品质/阶段/技能数）
 * - sellPet：执行售卖（删除宠物+关联数据，加金币）
 *
 * 售价公式：base + level×level_factor + stage×stage_factor + quality×quality_factor + skill_count×skill_factor
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const rules                    = require('../models/game-rules');

/**
 * 评估宠物售价
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function evaluate(uid, petId) {
    const db = getDB();

    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };

    const skillCount = db.prepare('SELECT COUNT(*) AS cnt FROM pet_skill WHERE pet_id = ?').get(petId).cnt;

    const price = _calcPrice(pet, skillCount);

    return {
        code: 0,
        data: {
            pet_id: petId,
            pet_name: pet.name,
            level: pet.level,
            quality: pet.quality,
            stage: pet.stage,
            skill_count: skillCount,
            sell_price: price
        },
        msg: 'success'
    };
}

/**
 * 执行宠物售卖
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function sellPet(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };

    /* 在斗兽场中的宠物不能售卖 */
    if (pet.arena_status === 'in_arena') {
        return { code: 4001, data: null, msg: '宠物正在斗兽场中，无法售卖' };
    }

    const skillCount = db.prepare('SELECT COUNT(*) AS cnt FROM pet_skill WHERE pet_id = ?').get(petId).cnt;
    const price = _calcPrice(pet, skillCount);

    const txn = db.transaction(() => {
        /* 删除关联数据 */
        db.prepare('DELETE FROM pet_skill WHERE pet_id = ?').run(petId);
        db.prepare('DELETE FROM pet_attr WHERE pet_id = ?').run(petId);
        db.prepare('DELETE FROM treadmill WHERE pet_id = ?').run(petId);

        /* 删除宠物主表 */
        db.prepare('DELETE FROM pet WHERE id = ?').run(petId);

        /* 加金币 */
        db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?')
            .run(price, ts, uid);
    });
    txn();

    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);

    writeLog(uid, 'gold_change', 'user', uid, {
        delta: price, reason: 'pet_sell', balance: user.gold
    }, ip);

    writeLog(uid, 'pet_sell', 'pet', petId, {
        pet_name: pet.name, level: pet.level, quality: pet.quality,
        stage: pet.stage, skill_count: skillCount, price
    }, ip);

    return {
        code: 0,
        data: {
            pet_id: petId,
            pet_name: pet.name,
            sell_price: price,
            gold_remain: user.gold
        },
        msg: 'success'
    };
}

/**
 * 计算售价
 * @param {object} pet       宠物行
 * @param {number} skillCount 技能数量
 * @returns {number}
 */
function _calcPrice(pet, skillCount) {
    return rules.PET_SELL_BASE_PRICE
        + pet.level   * rules.PET_SELL_LEVEL_FACTOR
        + pet.stage   * rules.PET_SELL_STAGE_FACTOR
        + pet.quality * rules.PET_SELL_QUALITY_FACTOR
        + skillCount  * rules.PET_SELL_SKILL_FACTOR;
}

module.exports = { evaluate, sellPet };
