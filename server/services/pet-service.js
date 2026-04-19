/**
 * 宠物查询业务逻辑 (P4 + P6)
 * - listPets：获取用户所有宠物摘要
 * - getPetDetail：获取宠物完整详情（属性+衍生+技能+渲染参数）
 * - 渲染参数映射严格对齐 docs/03-game-rules.md §3.4
 * - P6：渲染参数增加阶段倍率，蜕变后体型自然放大
 */

'use strict';

const { getDB } = require('../db');
const rules     = require('../models/game-rules');
const { calcDerived } = require('./hatch-service');

/**
 * 获取用户宠物列表
 * @param {number} uid 用户ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function listPets(uid) {
    const db = getDB();

    const pets = db.prepare(`
        SELECT id, name, quality, gender, level, exp, stage,
               stamina, stamina_max, satiety, satiety_max, mood,
               is_active, created_at
        FROM pet WHERE user_id = ?
        ORDER BY is_active DESC, created_at DESC
    `).all(uid);

    /* 附加品质名称、性别名称、阶段名称 */
    const list = pets.map(p => ({
        ...p,
        quality_name: rules.QUALITY_NAMES[p.quality] || '未知',
        gender_name:  rules.GENDER_NAMES[p.gender] || '未知',
        stage_name:   rules.STAGE_NAMES[p.stage] || '未知'
    }));

    return { code: 0, data: { pets: list }, msg: 'success' };
}

/**
 * 获取宠物完整详情
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function getPetDetail(uid, petId) {
    const db = getDB();

    /* 查询宠物主表 */
    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) {
        return { code: 3001, data: null, msg: '宠物不存在' };
    }

    /* 查询属性表 */
    const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
    if (!attr) {
        return { code: 9999, data: null, msg: '宠物属性数据异常' };
    }

    /* 查询技能表 */
    const skills = db.prepare(
        'SELECT skill_code, skill_level, is_equipped, slot_index FROM pet_skill WHERE pet_id = ? ORDER BY slot_index'
    ).all(petId);

    /* 构建六维属性 */
    const attrKeys = rules.ATTR_KEYS;
    const attrs = {};
    const attrTotals = {};
    for (const key of attrKeys) {
        const base   = attr[key + '_base'];
        const talent = attr[key + '_talent'];
        attrs[key] = { base, talent, total: base + talent };
        attrTotals[key] = base + talent;
    }

    /* 重新计算衍生属性（确保数据一致性） */
    const derived = calcDerived(attrTotals, pet.level);

    /* 计算升级所需经验 */
    const expNext = Math.floor(rules.BASE_EXP * pet.level * (1 + pet.level * 0.1));

    /* 解析外观种子 */
    let bodySeed;
    try { bodySeed = JSON.parse(pet.body_seed); }
    catch { bodySeed = {}; }

    /* 计算渲染参数 (docs/03-game-rules.md §3.4)
     * P6: 阶段倍率 — 每提升1阶段，体型相关参数 ×1.1 */
    const rb = rules.RENDER_BASE;
    const stageMul = 1 + pet.stage * 0.1;  // stage 0→1.0, 1→1.1, 2→1.2, 3→1.3
    const renderParams = {
        bodyWidth:         +(rb.bodyWidth * (1 + attrTotals.str * 0.01) * stageMul).toFixed(3),
        headScale:         +(rb.headScale * (1 + attrTotals.str * 0.008) * stageMul).toFixed(3),
        moveSpeed:         +(rb.moveSpeed * (1 + attrTotals.agi * 0.015)).toFixed(3),
        legFrequency:      +(rb.legFrequency * (1 + attrTotals.agi * 0.02)).toFixed(3),
        spineNodes:        rb.spineNodes + Math.floor(attrTotals.vit / 10) + pet.stage * 2,
        segmentWidth:      +(rb.segmentWidth * (1 + attrTotals.vit * 0.005) * stageMul).toFixed(3),
        fovAngle:          +(rb.fovAngle * (1 + attrTotals.int * 0.01)).toFixed(3),
        fovDistance:       +(rb.fovDistance * (1 + attrTotals.per * 0.02)).toFixed(3),
        colorSaturation:   +(rb.colorSaturation * (1 + attrTotals.cha * 0.01) * (1 + pet.stage * 0.05)).toFixed(3),
        patternComplexity: rb.patternComplexity + Math.floor(attrTotals.cha / 8) + pet.stage
    };

    return {
        code: 0,
        data: {
            pet: {
                id:          pet.id,
                name:        pet.name,
                quality:     pet.quality,
                quality_name: rules.QUALITY_NAMES[pet.quality] || '未知',
                gender:      pet.gender,
                gender_name: rules.GENDER_NAMES[pet.gender] || '未知',
                level:       pet.level,
                exp:         pet.exp,
                exp_next:    expNext,
                stage:       pet.stage,
                stage_name:  rules.STAGE_NAMES[pet.stage] || '未知',
                stamina:     pet.stamina,
                stamina_max: pet.stamina_max,
                satiety:     pet.satiety,
                satiety_max: pet.satiety_max,
                mood:        pet.mood,
                is_active:   pet.is_active
            },
            attrs,
            derived,
            skills,
            body_seed:     bodySeed,
            render_params: renderParams
        },
        msg: 'success'
    };
}

module.exports = { listPets, getPetDetail };
