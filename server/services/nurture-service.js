/**
 * 养成业务逻辑 (P5 + P6)
 * - applyTimeDecay：离线时间衰减引擎（饱食度衰减、体力恢复、心情衰减）
 * - syncPet：同步宠物状态（调用衰减引擎后返回最新数据）
 * - feedPet：喂食（扣金币、加饱食/经验/心情、升级检测）
 * - restPet：休息（恢复体力、冷却检测）
 * - evolvePet：蜕变（提升阶段、属性加成、技能解锁）
 *
 * 所有时间计算使用服务端 Unix 秒级时间戳 (S-G05)
 * 所有数值修改在事务中完成 (S-E02)
 * 公式严格对齐 docs/03-game-rules.md
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const rules                    = require('../models/game-rules');
const { calcDerived }          = require('./hatch-service');
const { secureRandom, secureRandomFloat } = require('../utils/random');

/* ═══════════════════════════════════════════
 * 时间衰减引擎
 * 根据 pet.updated_at 与当前时间的差值，
 * 计算饱食度衰减、体力自然恢复、心情衰减
 * ═══════════════════════════════════════════ */

/**
 * 计算并应用离线时间衰减，更新 pet 行
 * @param {object} pet  pet 表行（需含 id, stamina, stamina_max, satiety, satiety_max, mood, updated_at）
 * @returns {object} { satietyDecay, staminaRegen, moodDecay, changed } 变化量摘要
 */
function applyTimeDecay(pet) {
    const ts = now();
    const elapsed = ts - pet.updated_at;
    if (elapsed <= 0) return { satietyDecay: 0, staminaRegen: 0, moodDecay: 0, changed: false };

    /* ── 饱食度衰减 ── */
    const satietyTicks = Math.floor(elapsed / rules.SATIETY_DECAY_INTERVAL);
    let satietyDecay = satietyTicks * rules.SATIETY_DECAY_AMOUNT;
    const oldSatiety = pet.satiety;
    let newSatiety = Math.max(0, pet.satiety - satietyDecay);
    satietyDecay = oldSatiety - newSatiety;

    /* ── 体力自然恢复 ── */
    const staminaTicks = Math.floor(elapsed / rules.STAMINA_REGEN_INTERVAL);
    let staminaRegen = staminaTicks * rules.STAMINA_REGEN_AMOUNT;
    const oldStamina = pet.stamina;
    let newStamina = Math.min(pet.stamina_max, pet.stamina + staminaRegen);
    staminaRegen = newStamina - oldStamina;

    /* ── 心情衰减（饱食度为0时触发） ── */
    let moodDecay = 0;
    if (newSatiety <= 0) {
        /*
         * 计算饱食度降至0的时刻，从该时刻起计算心情衰减
         * 饱食度从 oldSatiety 降到 0 需要 ceil(oldSatiety / SATIETY_DECAY_AMOUNT) 个 tick
         * 即 zeroTime = updated_at + ceil(oldSatiety / SATIETY_DECAY_AMOUNT) * SATIETY_DECAY_INTERVAL
         */
        const ticksToZero = oldSatiety > 0
            ? Math.ceil(oldSatiety / rules.SATIETY_DECAY_AMOUNT)
            : 0;
        const satietyZeroTime = pet.updated_at + ticksToZero * rules.SATIETY_DECAY_INTERVAL;
        const hungryDuration = Math.max(0, ts - satietyZeroTime);
        const moodTicks = Math.floor(hungryDuration / 300); // 每5分钟心情-10
        moodDecay = moodTicks * 10;
    }
    const oldMood = pet.mood;
    let newMood = Math.max(0, Math.min(100, pet.mood - moodDecay));
    moodDecay = oldMood - newMood;

    const changed = satietyDecay > 0 || staminaRegen > 0 || moodDecay > 0;

    if (changed) {
        const db = getDB();
        db.prepare(`
            UPDATE pet SET satiety = ?, stamina = ?, mood = ?, updated_at = ?
            WHERE id = ?
        `).run(newSatiety, newStamina, newMood, ts, pet.id);

        /* 更新传入的 pet 对象，后续逻辑可直接使用 */
        pet.satiety    = newSatiety;
        pet.stamina    = newStamina;
        pet.mood       = newMood;
        pet.updated_at = ts;
    }

    return { satietyDecay, staminaRegen, moodDecay, changed };
}

/* ═══════════════════════════════════════════
 * 同步宠物状态
 * ═══════════════════════════════════════════ */

/**
 * 同步宠物状态：应用时间衰减后返回最新数值
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function syncPet(uid, petId) {
    const db = getDB();
    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) {
        return { code: 3001, data: null, msg: '宠物不存在' };
    }

    /* 应用离线时间衰减 */
    applyTimeDecay(pet);

    /* 查询用户金币 */
    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);

    return {
        code: 0,
        data: {
            pet_id:      pet.id,
            stamina:     pet.stamina,
            stamina_max: pet.stamina_max,
            satiety:     pet.satiety,
            satiety_max: pet.satiety_max,
            mood:        pet.mood,
            exp:         pet.exp,
            level:       pet.level,
            gold:        user ? user.gold : 0,
            server_time: now()
        },
        msg: 'success'
    };
}

/* ═══════════════════════════════════════════
 * 喂食
 * ═══════════════════════════════════════════ */

/**
 * 喂食宠物
 * @param {number} uid      用户ID
 * @param {number} petId    宠物ID
 * @param {string} foodCode 食物代码
 * @param {string} ip       请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function feedPet(uid, petId, foodCode, ip) {
    const db = getDB();
    const ts = now();

    /* 校验食物代码 */
    const food = rules.FOOD_TABLE[foodCode];
    if (!food) {
        return { code: 1001, data: null, msg: '无效的食物代码' };
    }

    /* 查询宠物 */
    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) {
        return { code: 3001, data: null, msg: '宠物不存在' };
    }

    /* 先应用时间衰减，确保数据为最新 */
    applyTimeDecay(pet);

    /* 喂食冷却检测（30秒） */
    if (pet.last_feed_at && (ts - pet.last_feed_at) < rules.FEED_COOLDOWN) {
        const wait = rules.FEED_COOLDOWN - (ts - pet.last_feed_at);
        return { code: 9001, data: { retry_after: wait }, msg: `喂食冷却中，${wait}秒后可再次喂食` };
    }

    /* 饱食度已满不可喂食 */
    if (pet.satiety >= pet.satiety_max) {
        return { code: 4001, data: null, msg: '宠物已经吃饱了' };
    }

    /* 灵虫需要体力≥10 */
    if (foodCode === 'spirit_bug' && pet.stamina < 10) {
        return { code: 5001, data: null, msg: '体力不足，灵虫需要体力≥10' };
    }

    /* 查询用户金币 */
    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);
    if (!user || user.gold < food.cost) {
        return { code: 5002, data: null, msg: '金币不足' };
    }

    /* 计算变化量 */
    const satietyBefore = pet.satiety;
    const satietyAfter  = Math.min(pet.satiety_max, pet.satiety + food.satiety);
    const expBefore     = pet.exp;
    let   expAfter      = pet.exp + food.exp;
    const moodDelta     = food.mood || 0;
    const newMood       = Math.min(100, pet.mood + moodDelta);
    const goldRemain    = user.gold - food.cost;

    /* 等级上限检测 */
    const levelCap = rules.LEVEL_CAP[pet.stage] || 10;
    let   level    = pet.level;
    let   levelUp  = false;
    let   attrGrowth = null;

    /* 升级循环 */
    while (level < levelCap) {
        const expNeeded = Math.floor(rules.BASE_EXP * level * (1 + level * 0.1));
        if (expAfter >= expNeeded) {
            expAfter -= expNeeded;
            level++;
            levelUp = true;
        } else {
            break;
        }
    }

    /* 如果升级了，计算属性成长 */
    const levelsGained = level - pet.level;
    if (levelsGained > 0) {
        const growthPerLevel = Math.floor(rules.GROWTH_PER_LEVEL * (rules.QUALITY_GROWTH[pet.quality] || 1.0));
        const totalGrowth = growthPerLevel * levelsGained;
        attrGrowth = totalGrowth;
    }

    /* 事务：扣金币 + 更新宠物 + 更新属性（如升级） */
    const txn = db.transaction(() => {
        /* 扣金币 */
        db.prepare('UPDATE user SET gold = ?, updated_at = ? WHERE id = ?')
            .run(goldRemain, ts, uid);

        /* 更新宠物主表 */
        db.prepare(`
            UPDATE pet SET satiety = ?, mood = ?, exp = ?, level = ?,
                           last_feed_at = ?, updated_at = ?
            WHERE id = ?
        `).run(satietyAfter, newMood, expAfter, level, ts, ts, petId);

        /* 如果升级了，增加六维 base 属性 */
        if (levelsGained > 0) {
            const growthPerLevel = Math.floor(rules.GROWTH_PER_LEVEL * (rules.QUALITY_GROWTH[pet.quality] || 1.0));
            const totalGrowth = growthPerLevel * levelsGained;

            db.prepare(`
                UPDATE pet_attr SET
                    str_base = str_base + ?, agi_base = agi_base + ?,
                    vit_base = vit_base + ?, int_base = int_base + ?,
                    per_base = per_base + ?, cha_base = cha_base + ?,
                    updated_at = ?
                WHERE pet_id = ?
            `).run(totalGrowth, totalGrowth, totalGrowth, totalGrowth, totalGrowth, totalGrowth, ts, petId);

            /* 重新计算衍生属性 */
            const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
            const attrTotals = {};
            for (const key of rules.ATTR_KEYS) {
                attrTotals[key] = attr[key + '_base'] + attr[key + '_talent'];
            }
            const derived = calcDerived(attrTotals, level);
            db.prepare(`
                UPDATE pet_attr SET hp_max = ?, atk = ?, def = ?, spd = ?,
                                    crit_rate = ?, dodge_rate = ?
                WHERE pet_id = ?
            `).run(derived.hp_max, derived.atk, derived.def, derived.spd,
                   derived.crit_rate, derived.dodge_rate, petId);
        }

        /* 灵虫特殊效果：随机属性永久+1 */
        if (foodCode === 'spirit_bug') {
            const randAttr = rules.ATTR_KEYS[secureRandom(0, rules.ATTR_KEYS.length - 1)];
            db.prepare(`UPDATE pet_attr SET ${randAttr}_base = ${randAttr}_base + 1, updated_at = ? WHERE pet_id = ?`)
                .run(ts, petId);
        }
    });

    txn();

    /* 审计日志 */
    writeLog(uid, 'feed', 'pet', petId, {
        food: foodCode, gold_cost: food.cost,
        satiety_delta: satietyAfter - satietyBefore,
        exp_delta: food.exp, levels_gained: levelsGained
    }, ip);

    return {
        code: 0,
        data: {
            pet_id:      petId,
            food:        foodCode,
            gold_cost:   food.cost,
            gold_remain: goldRemain,
            satiety:     { before: satietyBefore, after: satietyAfter },
            exp:         { before: expBefore, after: expAfter },
            mood_delta:  moodDelta,
            level_up:    levelUp,
            level:       level,
            next_feed_at: ts + rules.FEED_COOLDOWN
        },
        msg: 'success'
    };
}

/* ═══════════════════════════════════════════
 * 休息
 * ═══════════════════════════════════════════ */

/**
 * 宠物休息，恢复体力
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function restPet(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) {
        return { code: 3001, data: null, msg: '宠物不存在' };
    }

    /* 先应用时间衰减 */
    applyTimeDecay(pet);

    /* 休息冷却检测（30分钟） */
    if (pet.last_rest_at && (ts - pet.last_rest_at) < rules.REST_COOLDOWN) {
        const wait = rules.REST_COOLDOWN - (ts - pet.last_rest_at);
        return { code: 9001, data: { retry_after: wait }, msg: `休息冷却中，${wait}秒后可再次休息` };
    }

    /* 体力已满无需休息 */
    if (pet.stamina >= pet.stamina_max) {
        return { code: 4001, data: null, msg: '体力已满，无需休息' };
    }

    /* 计算恢复量 */
    const staminaBefore = pet.stamina;
    const staminaAfter  = Math.min(pet.stamina_max, pet.stamina + rules.REST_AMOUNT);

    /* 更新数据库 */
    db.prepare(`
        UPDATE pet SET stamina = ?, last_rest_at = ?, updated_at = ?
        WHERE id = ?
    `).run(staminaAfter, ts, ts, petId);

    /* 审计日志 */
    writeLog(uid, 'rest', 'pet', petId, {
        stamina_before: staminaBefore, stamina_after: staminaAfter
    }, ip);

    return {
        code: 0,
        data: {
            pet_id:       petId,
            stamina:      { before: staminaBefore, after: staminaAfter },
            next_rest_at: ts + rules.REST_COOLDOWN
        },
        msg: 'success'
    };
}

/* ═══════════════════════════════════════════
 * 蜕变 (P6)
 * docs/03-game-rules.md §6 / docs/04-api.md §5.2
 * ═══════════════════════════════════════════ */

/**
 * 触发宠物蜕变
 * 校验链：阶段上限 → 等级 → 品质(stage3) → 属性条件 → 体力 → 金币
 * 效果：stage+1, stamina_max+20, satiety_max+10, 六维base+3, 技能解锁
 *
 * @param {number} uid   用户ID
 * @param {number} petId 宠物ID
 * @param {string} ip    请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function evolvePet(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    /* ── 查询宠物 ── */
    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) {
        return { code: 3001, data: null, msg: '宠物不存在' };
    }

    /* 先应用时间衰减，确保数据为最新 */
    applyTimeDecay(pet);

    const targetStage = pet.stage + 1;

    /* ── 阶段上限检测 ── */
    const maxStage = rules.MAX_STAGE[pet.quality] || 2;
    if (targetStage > maxStage) {
        return { code: 5003, data: null, msg: '已达该品质最高阶段' };
    }

    /* ── 等级检测 ── */
    const levelReq = rules.EVOLVE_LEVEL[targetStage];
    if (!levelReq || pet.level < levelReq) {
        return { code: 5003, data: null, msg: `蜕变需要等级≥${levelReq}` };
    }

    /* ── 查询属性（用于条件判断） ── */
    const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
    if (!attr) {
        return { code: 9999, data: null, msg: '宠物属性数据异常' };
    }

    /* 计算六维总和 */
    const attrTotals = {};
    let maxAttrTotal = 0;
    for (const key of rules.ATTR_KEYS) {
        const total = attr[key + '_base'] + attr[key + '_talent'];
        attrTotals[key] = total;
        if (total > maxAttrTotal) maxAttrTotal = total;
    }

    /* ── 阶段2→3：品质检测 ── */
    if (targetStage === 3 && pet.quality < rules.EVOLVE_QUALITY_REQ_STAGE3) {
        return { code: 5003, data: null, msg: `蜕变至完全体需要品质≥${rules.QUALITY_NAMES[rules.EVOLVE_QUALITY_REQ_STAGE3]}` };
    }

    /* ── 属性条件检测 ── */
    const attrReq = rules.EVOLVE_ATTR_REQ[targetStage];
    if (attrReq && maxAttrTotal < attrReq) {
        return { code: 5003, data: null, msg: `蜕变需要任意属性总和≥${attrReq}，当前最高 ${maxAttrTotal}` };
    }

    /* ── 体力检测 ── */
    if (pet.stamina < rules.EVOLVE_STAMINA_REQ) {
        return { code: 5001, data: null, msg: `体力不足，蜕变需要体力≥${rules.EVOLVE_STAMINA_REQ}` };
    }

    /* ── 金币检测 ── */
    const goldCost = rules.EVOLVE_COST[targetStage];
    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);
    if (!user || user.gold < goldCost) {
        return { code: 5002, data: null, msg: `金币不足，蜕变需要${goldCost}金币` };
    }

    /* ── 技能解锁逻辑 ── */
    const pool = rules.EVOLVE_SKILL_POOL[targetStage] || [];
    const existingSkills = db.prepare('SELECT skill_code FROM pet_skill WHERE pet_id = ?').all(petId);
    const ownedSet = new Set(existingSkills.map(s => s.skill_code));

    /* 过滤已拥有的技能 */
    const candidates = pool.filter(s => !ownedSet.has(s.skill_code));
    let unlockedSkill = null;

    if (candidates.length > 0) {
        /* 品质≥3(稀有)保底必定解锁 */
        const guaranteed = pet.quality >= rules.QUALITY_RARE;
        const roll = secureRandomFloat();

        if (guaranteed || roll < rules.EVOLVE_SKILL_CHANCE) {
            /* 随机选一个 */
            const idx = secureRandom(0, candidates.length - 1);
            unlockedSkill = candidates[idx];
        }
    }

    /* ── 计算新值 ── */
    const newStaminaMax = pet.stamina_max + rules.EVOLVE_STAMINA_MAX_BONUS;
    const newSatietyMax = pet.satiety_max + rules.EVOLVE_SATIETY_MAX_BONUS;
    const newStamina    = pet.stamina - rules.EVOLVE_STAMINA_REQ;
    const newGold       = user.gold - goldCost;
    const attrBonus     = rules.EVOLVE_ATTR_BONUS;
    const newLevelCap   = rules.LEVEL_CAP[targetStage] || 100;
    const newSkillSlots = rules.SKILL_SLOTS[pet.quality] || 2;

    /* ── 事务执行 ── */
    const txn = db.transaction(() => {
        /* 扣金币 */
        db.prepare('UPDATE user SET gold = ?, updated_at = ? WHERE id = ?')
            .run(newGold, ts, uid);

        /* 更新宠物主表：阶段+1, 体力扣除, 上限提升 */
        db.prepare(`
            UPDATE pet SET stage = ?, stamina = ?, stamina_max = ?,
                           satiety_max = ?, updated_at = ?
            WHERE id = ?
        `).run(targetStage, newStamina, newStaminaMax, newSatietyMax, ts, petId);

        /* 六维 base 各+3 */
        db.prepare(`
            UPDATE pet_attr SET
                str_base = str_base + ?, agi_base = agi_base + ?,
                vit_base = vit_base + ?, int_base = int_base + ?,
                per_base = per_base + ?, cha_base = cha_base + ?,
                updated_at = ?
            WHERE pet_id = ?
        `).run(attrBonus, attrBonus, attrBonus, attrBonus, attrBonus, attrBonus, ts, petId);

        /* 重新计算衍生属性 */
        const updatedAttr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
        const newAttrTotals = {};
        for (const key of rules.ATTR_KEYS) {
            newAttrTotals[key] = updatedAttr[key + '_base'] + updatedAttr[key + '_talent'];
        }
        const derived = calcDerived(newAttrTotals, pet.level);
        db.prepare(`
            UPDATE pet_attr SET hp_max = ?, atk = ?, def = ?, spd = ?,
                                crit_rate = ?, dodge_rate = ?
            WHERE pet_id = ?
        `).run(derived.hp_max, derived.atk, derived.def, derived.spd,
               derived.crit_rate, derived.dodge_rate, petId);

        /* 解锁技能（如有） */
        if (unlockedSkill) {
            /* 找到下一个可用的 slot_index */
            const maxSlot = db.prepare('SELECT MAX(slot_index) AS ms FROM pet_skill WHERE pet_id = ?').get(petId);
            const nextSlot = (maxSlot && maxSlot.ms !== null) ? maxSlot.ms + 1 : 0;

            db.prepare(`
                INSERT INTO pet_skill (pet_id, skill_code, skill_level, is_equipped, slot_index, created_at)
                VALUES (?, ?, ?, 1, ?, ?)
            `).run(petId, unlockedSkill.skill_code, unlockedSkill.skill_level, nextSlot, ts);
        }
    });

    txn();

    /* ── 审计日志 ── */
    writeLog(uid, 'evolve', 'pet', petId, {
        stage_before: pet.stage,
        stage_after: targetStage,
        gold_cost: goldCost,
        stamina_cost: rules.EVOLVE_STAMINA_REQ,
        attr_bonus: attrBonus,
        skill_unlocked: unlockedSkill ? unlockedSkill.skill_code : null
    }, ip);

    return {
        code: 0,
        data: {
            pet_id:          petId,
            stage_before:    pet.stage,
            stage_after:     targetStage,
            stage_name:      rules.STAGE_NAMES[targetStage] || '未知',
            gold_cost:       goldCost,
            gold_remain:     newGold,
            stamina_cost:    rules.EVOLVE_STAMINA_REQ,
            level_cap_new:   newLevelCap,
            stamina_max_new: newStaminaMax,
            satiety_max_new: newSatietyMax,
            attr_bonus:      attrBonus,
            new_skill_slots: newSkillSlots,
            skill_unlocked:  unlockedSkill ? unlockedSkill.skill_code : null
        },
        msg: 'success'
    };
}

module.exports = { applyTimeDecay, syncPet, feedPet, restPet, evolvePet };
