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
const { buildAttrs, sumAttrTotals, buildAppearance } = require('./pet-appearance-service');

/**
 * 获取用户宠物列表
 * @param {number} uid 用户ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function listPets(uid) {
    const db = getDB();

    const pets = db.prepare(`
        SELECT id, name, quality, gender, level, exp, stage,
               stamina, stamina_max, satiety, satiety_max,
               health, health_max, mood,
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
    const attrs = buildAttrs(attr);
    const attrTotals = sumAttrTotals(attr);

    /* 重新计算衍生属性（确保数据一致性） */
    const derived = calcDerived(attrTotals, pet.level);

    /* 计算升级所需经验 */
    const expNext = Math.floor(rules.BASE_EXP * pet.level * (1 + pet.level * 0.1));

    /* 计算渲染参数 (docs/03-game-rules.md §3.4) */
    const appearance = buildAppearance(pet, attr);

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
                health:      pet.health !== undefined ? pet.health : 100,
                health_max:  pet.health_max !== undefined ? pet.health_max : 100,
                mood:        pet.mood,
                is_active:   pet.is_active,
                arena_status: pet.arena_status || 'none',
                last_breed_at: pet.last_breed_at || 0
            },
            attrs,
            derived,
            skills,
            body_seed:     appearance.body_seed,
            render_params: appearance.render_params
        },
        msg: 'success'
    };
}

module.exports = { listPets, getPetDetail };
