/**
 * 孵化业务逻辑
 * - 开始孵化：校验蛋归属/状态，记录 hatch_start_at (S-A04)
 * - 查询状态：服务端计算剩余时间/进度，前端无权修改 (S-A01)
 * - 完成孵化：校验倒计时结束，生成天赋点，创建宠物+属性 (S-A03)
 * - 支持自动/手动双模式天赋分配 (P4)
 * - 衍生属性公式严格对齐 docs/03-game-rules.md §3
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const { secureRandom }         = require('../utils/random');
const { sanitize }             = require('../utils/validator');
const rules                    = require('../models/game-rules');
const geneEngine               = require('./gene-engine');

/**
 * 开始孵化
 * @param {number} uid   用户ID
 * @param {number} eggId 蛋ID
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function startHatch(uid, eggId, ip) {
    const db = getDB();
    const ts = now();

    /* 校验蛋存在且属于当前用户 (S-B02) */
    const egg = db.prepare('SELECT * FROM pet_egg WHERE id = ? AND user_id = ?').get(eggId, uid);
    if (!egg) {
        return { code: 3001, data: null, msg: '蛋不存在' };
    }

    /* 已孵化的蛋不能再孵化 */
    if (egg.is_hatched === 1) {
        return { code: 3001, data: null, msg: '该蛋已孵化完成' };
    }

    /* 已开始孵化的蛋不能重复开始 */
    if (egg.hatch_start_at > 0) {
        return { code: 4001, data: null, msg: '该蛋已在孵化中' };
    }

    /* 检查是否有其他蛋正在孵化（同一时间只能孵化1个） */
    const hatching = db.prepare(
        'SELECT id FROM pet_egg WHERE user_id = ? AND hatch_start_at > 0 AND is_hatched = 0'
    ).get(uid);
    if (hatching) {
        return { code: 4001, data: null, msg: '已有蛋在孵化中' };
    }

    /* 设置孵化开始时间 */
    const hatchDuration = rules.HATCH_DURATION[egg.quality];
    db.prepare('UPDATE pet_egg SET hatch_start_at = ?, hatch_duration = ?, updated_at = ? WHERE id = ?')
        .run(ts, hatchDuration, ts, eggId);

    /* 审计日志 */
    writeLog(uid, 'hatch_start', 'egg', eggId, { egg_id: eggId }, ip);

    return {
        code: 0,
        data: {
            egg_id:           eggId,
            hatch_start_at:   ts,
            hatch_duration:   hatchDuration,
            estimated_finish: ts + hatchDuration
        },
        msg: 'success'
    };
}

/**
 * 查询孵化状态
 * 服务端计算剩余时间，前端无权修改 (S-A01)
 * @param {number} uid   用户ID
 * @param {number} eggId 蛋ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function getHatchStatus(uid, eggId) {
    const db = getDB();
    const ts = now();

    const egg = db.prepare('SELECT * FROM pet_egg WHERE id = ? AND user_id = ?').get(eggId, uid);
    if (!egg) {
        return { code: 3001, data: null, msg: '蛋不存在' };
    }

    /* 未开始孵化 */
    if (egg.hatch_start_at === 0) {
        return {
            code: 0,
            data: {
                egg_id: eggId,
                status: 'idle',
                progress: 0,
                remaining_seconds: egg.hatch_duration
            },
            msg: 'success'
        };
    }

    const elapsed  = ts - egg.hatch_start_at;
    const duration = egg.hatch_duration;
    const finished = elapsed >= duration;

    if (finished && egg.is_hatched === 0) {
        /* 孵化时间到：生成天赋点并标记完成 */
        const talentRange = rules.TALENT_RANGE[egg.quality];
        const talentPoints = secureRandom(talentRange.min, talentRange.max);

        db.prepare('UPDATE pet_egg SET is_hatched = 1, talent_points = ?, updated_at = ? WHERE id = ?')
            .run(talentPoints, ts, eggId);

        return {
            code: 0,
            data: {
                egg_id:        eggId,
                status:        'ready',
                progress:      1.0,
                remaining_seconds: 0,
                talent_points: talentPoints,
                quality:       egg.quality
            },
            msg: 'success'
        };
    }

    if (egg.is_hatched === 1) {
        /* 已孵化完成，返回天赋点信息 */
        return {
            code: 0,
            data: {
                egg_id:        eggId,
                status:        'ready',
                progress:      1.0,
                remaining_seconds: 0,
                talent_points: egg.talent_points,
                quality:       egg.quality
            },
            msg: 'success'
        };
    }

    /* 孵化中 */
    const remaining = duration - elapsed;
    const progress  = +(elapsed / duration).toFixed(4);

    return {
        code: 0,
        data: {
            egg_id:            eggId,
            status:            'hatching',
            progress:          Math.min(progress, 0.9999),
            remaining_seconds: remaining
        },
        msg: 'success'
    };
}

/**
 * 服务端随机生成孵化属性点
 * 规则：力量/敏捷/体质各固定1点，其余点数随机分配给智力/感知/魅力
 * @param {number} totalPoints 天赋点总量
 * @returns {object} { str, agi, vit, int, per, cha }
 */
function randomAllocateTalents(totalPoints) {
    const result = { str: 1, agi: 1, vit: 1, int: 0, per: 0, cha: 0 };
    const randomKeys = ['int', 'per', 'cha'];
    const remaining = Math.max(0, totalPoints - 3);

    for (let i = 0; i < remaining; i++) {
        const idx = secureRandom(0, randomKeys.length - 1);
        result[randomKeys[idx]]++;
    }

    return result;
}

/**
 * 计算衍生属性 (docs/03-game-rules.md §3.3)
 * @param {object} a 属性对象 { str, agi, vit, int, per, cha }（总值）
 * @param {number} level 等级
 * @returns {object} 衍生属性
 */
function calcDerived(a, level) {
    return {
        hp_max:     a.vit * 10 + a.str * 3 + level * 5,
        atk:        a.str * 3 + a.agi * 1 + level * 2,
        def:        a.vit * 2 + a.str * 1 + level * 1,
        spd:        a.agi * 2 + a.per * 1,
        crit_rate:  Math.min(a.per * 50 + a.agi * 20, 5000),
        dodge_rate: Math.min(a.agi * 40 + a.per * 15, 4000)
    };
}

/**
 * 完成孵化（命名 + 服务端随机生成属性）
 * 规则：初代蛋忽略客户端 talents，力量/敏捷/体质各固定1点，其余点数随机分配；繁殖蛋仍使用遗传数据覆盖
 * @param {number} uid     用户ID
 * @param {number} eggId   蛋ID
 * @param {string} petName 宠物名称
 * @param {object|null} talents { str, agi, vit, int, per, cha } 或 null（自动分配）
 * @param {string} ip      请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function finishHatch(uid, eggId, petName, talents, ip) {
    const db = getDB();
    const ts = now();

    /* 校验蛋存在且属于当前用户 (S-B02) */
    const egg = db.prepare('SELECT * FROM pet_egg WHERE id = ? AND user_id = ?').get(eggId, uid);
    if (!egg) {
        return { code: 3001, data: null, msg: '蛋不存在' };
    }

    /* 校验孵化已完成 */
    if (egg.is_hatched !== 1) {
        /* 检查是否时间到了但还没标记 */
        if (egg.hatch_start_at > 0 && (ts - egg.hatch_start_at) >= egg.hatch_duration) {
            /* 自动标记完成并生成天赋点 */
            const talentRange = rules.TALENT_RANGE[egg.quality];
            const talentPoints = secureRandom(talentRange.min, talentRange.max);
            db.prepare('UPDATE pet_egg SET is_hatched = 1, talent_points = ?, updated_at = ? WHERE id = ?')
                .run(talentPoints, ts, eggId);
            egg.is_hatched = 1;
            egg.talent_points = talentPoints;
        } else {
            return { code: 4001, data: null, msg: '孵化未完成' };
        }
    }

    /* 校验该蛋是否已创建过宠物（幂等性 S-E02） */
    const existingPet = db.prepare('SELECT id FROM pet WHERE egg_id = ?').get(eggId);
    if (existingPet) {
        return { code: 4001, data: null, msg: '该蛋已孵化出宠物' };
    }

    /* 校验宠物名称 */
    const cleanName = sanitize(petName, 12);
    if (cleanName.length < 1) {
        return { code: 1001, data: null, msg: '宠物名称不能为空' };
    }

    const attrs = rules.ATTR_KEYS;
    let allocMode = 'random';

    /* 初代蛋属性由服务端随机生成，忽略客户端传入的 talents（S-A01/S-A03） */
    talents = randomAllocateTalents(egg.talent_points);

    /* 计算初始属性 */
    const initBase = rules.INIT_ATTR_BASE;
    const attrTotals = {};
    for (const attr of attrs) {
        attrTotals[attr] = initBase + talents[attr];
    }

    /* 计算衍生属性 (level=1) */
    let derived = calcDerived(attrTotals, 1);

    /* 解析外观种子 */
    let patternSeed;
    try { patternSeed = JSON.parse(egg.pattern_seed); }
    catch { patternSeed = {}; }

    /* 服务端随机性别 (S-A03) */
    const gender = secureRandom(1, 2);

    /* P8: 检查是否为繁殖蛋，注入遗传数据 */
    const breedingService = require('./breeding-service');
    const breedRecord = breedingService.getBreedingRecord(eggId);
    let geneSetJson = '';
    let appearanceGeneJson = '';
    let hiddenGene = '';
    let parent1Id = 0;
    let parent2Id = 0;
    let generation = 0;
    let finalGender = gender;

    if (breedRecord) {
        /* 繁殖蛋：使用遗传数据覆盖天赋 */
        if (breedRecord.talents) {
            talents = breedRecord.talents;
            allocMode = 'inherited';
        }
        if (breedRecord.geneSet) {
            geneSetJson = JSON.stringify(breedRecord.geneSet);
        }
        if (breedRecord.appearanceGene) {
            appearanceGeneJson = JSON.stringify(breedRecord.appearanceGene);
        }
        if (breedRecord.hiddenGene) {
            hiddenGene = breedRecord.hiddenGene;
        }
        parent1Id = breedRecord.parent1_id || 0;
        parent2Id = breedRecord.parent2_id || 0;
        generation = breedRecord.generation || 0;
        if (breedRecord.gender) {
            finalGender = breedRecord.gender;
        }
        /* 使用遗传外观种子 */
        if (breedRecord.patternSeed) {
            patternSeed = breedRecord.patternSeed;
        }
    } else {
        /* 初代蛋：生成初始基因组 */
        const initGeneSet = geneEngine.generateInitialGeneSet(talents);
        geneSetJson = JSON.stringify(initGeneSet);
        const initAppGene = geneEngine.generateInitialAppearanceGene(patternSeed);
        appearanceGeneJson = JSON.stringify(initAppGene);
        hiddenGene = geneEngine.rollHiddenGene();
        finalGender = gender;
    }

    /* 重新计算初始属性 */
    for (const attr of attrs) {
        attrTotals[attr] = initBase + talents[attr];
    }
    derived = calcDerived(attrTotals, 1);

    /* 事务：创建宠物 + 创建属性 + 解锁初始技能 */
    const insertPet = db.prepare(`
        INSERT INTO pet (user_id, egg_id, name, quality, gender, level, exp, stage,
                         stamina, stamina_max, satiety, satiety_max, mood,
                         is_active, body_seed, gene_set, appearance_gene, hidden_gene,
                         parent1_id, parent2_id, generation,
                         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 0, 0, 100, 100, 100, 100, 50, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAttr = db.prepare(`
        INSERT INTO pet_attr (pet_id,
                              str_base, str_talent, agi_base, agi_talent,
                              vit_base, vit_talent, int_base, int_talent,
                              per_base, per_talent, cha_base, cha_talent,
                              hp_max, atk, def, spd, crit_rate, dodge_rate,
                              created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSkill = db.prepare(`
        INSERT INTO pet_skill (pet_id, skill_code, skill_level, cooldown,
                               is_equipped, slot_index, unlocked_at, created_at, updated_at)
        VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)
    `);

    const txn = db.transaction(() => {
        /* 1. 创建宠物 */
        const petResult = insertPet.run(
            uid, eggId, cleanName, egg.quality, finalGender,
            JSON.stringify(patternSeed),
            geneSetJson, appearanceGeneJson, hiddenGene,
            parent1Id, parent2Id, generation,
            ts, ts
        );
        const petId = petResult.lastInsertRowid;

        /* 2. 创建属性 */
        insertAttr.run(
            petId,
            initBase, talents.str, initBase, talents.agi,
            initBase, talents.vit, initBase, talents.int,
            initBase, talents.per, initBase, talents.cha,
            derived.hp_max, derived.atk, derived.def,
            derived.spd, derived.crit_rate, derived.dodge_rate,
            ts, ts
        );

        /* 3. 解锁初始技能（繁殖蛋使用遗传技能） */
        const skillList = (breedRecord && breedRecord.skills && breedRecord.skills.length > 0)
            ? breedRecord.skills.map((sk, idx) => ({ ...sk, slot_index: idx }))
            : rules.INITIAL_SKILLS;
        for (const sk of skillList) {
            insertSkill.run(petId, sk.skill_code, sk.skill_level, sk.slot_index || 0, ts, ts, ts);
        }

        /* 注：蛋记录保留（pet.egg_id 外键引用），通过 is_hatched=1 + 关联宠物标识已消耗 */

        return petId;
    });

    const petId = txn();

    /* 审计日志 */
    writeLog(uid, 'hatch_finish', 'pet', petId, {
        egg_id: eggId, pet_id: petId, gender: finalGender, alloc_mode: allocMode,
        talent_points: egg.talent_points, is_bred: !!breedRecord
    }, ip);
    writeLog(uid, 'talent_assign', 'pet', petId, {
        pet_id: petId, mode: allocMode, ...talents
    }, ip);

    /* 构建响应 */
    const attrResponse = {};
    for (const attr of attrs) {
        attrResponse[attr] = {
            base:   initBase,
            talent: talents[attr],
            total:  initBase + talents[attr]
        };
    }

    /* 获取实际技能列表 */
    const skillList2 = (breedRecord && breedRecord.skills && breedRecord.skills.length > 0)
        ? breedRecord.skills.map((sk, idx) => ({
            skill_code: sk.skill_code,
            skill_level: sk.skill_level,
            is_equipped: 1,
            slot_index: idx,
        }))
        : rules.INITIAL_SKILLS.map(sk => ({
            skill_code:  sk.skill_code,
            skill_level: sk.skill_level,
            is_equipped: 1,
            slot_index:  sk.slot_index
        }));

    return {
        code: 0,
        data: {
            pet_id:      petId,
            name:        cleanName,
            quality:     egg.quality,
            gender:      finalGender,
            gender_name: rules.GENDER_NAMES[finalGender],
            level:       1,
            exp:         0,
            stage:       0,
            stage_name:  rules.STAGE_NAMES[0],
            stamina:     100,
            stamina_max: 100,
            satiety:     100,
            satiety_max: 100,
            mood:        50,
            alloc_mode:  allocMode,
            attrs:       attrResponse,
            derived,
            skills:      skillList2,
            body_seed:   patternSeed,
            generation,
            parent1_id:  parent1Id,
            parent2_id:  parent2Id,
            hidden_gene: hiddenGene,
        },
        msg: 'success'
    };
}

module.exports = { startHatch, getHatchStatus, finishHatch, calcDerived, randomAllocateTalents };
