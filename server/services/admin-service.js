/**
 * 管理员后台业务逻辑
 * - 数据统计（注册量/宠物/活跃/战斗/经济/分布/繁殖）
 * - 玩家管理（搜索/详情/封禁/解封/修改金币）
 * - 宠物管理（查看/修改属性/修改状态）
 * - 战斗记录查询
 * - 数值热更新（game-rules 在线修改，无需重启）
 * - 测试模块（快速生成/加速成长/复制宠物/模拟对战/模拟交配）
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const rules = require('../models/game-rules');
const battleEngine = require('./battle-engine');
const geneEngine = require('./gene-engine');
const { secureRandom } = require('../utils/random');

/* ═══════════════════════════════════════════
 * 1. 数据统计
 * ═══════════════════════════════════════════ */

/** 全局概览统计 */
function getStats() {
    const db = getDB();
    const ts = now();
    const dayAgo = ts - 86400;
    const weekAgo = ts - 604800;

    const totalUsers    = db.prepare('SELECT COUNT(*) AS c FROM user').get().c;
    const totalPets     = db.prepare('SELECT COUNT(*) AS c FROM pet').get().c;
    const totalEggs     = db.prepare('SELECT COUNT(*) AS c FROM pet_egg').get().c;
    const activeDay     = db.prepare('SELECT COUNT(*) AS c FROM user WHERE last_login_at > ?').get(dayAgo).c;
    const activeWeek    = db.prepare('SELECT COUNT(*) AS c FROM user WHERE last_login_at > ?').get(weekAgo).c;
    const newUsersDay   = db.prepare('SELECT COUNT(*) AS c FROM user WHERE created_at > ?').get(dayAgo).c;
    const newUsersWeek  = db.prepare('SELECT COUNT(*) AS c FROM user WHERE created_at > ?').get(weekAgo).c;
    const totalBattles  = db.prepare('SELECT COUNT(*) AS c FROM battle_challenge').get().c;
    const battlesDay    = db.prepare('SELECT COUNT(*) AS c FROM battle_challenge WHERE created_at > ?').get(dayAgo).c;
    const arenaPets     = db.prepare("SELECT COUNT(*) AS c FROM arena_pet WHERE status = 'active'").get().c;

    return {
        totalUsers, totalPets, totalEggs,
        activeDay, activeWeek,
        newUsersDay, newUsersWeek,
        totalBattles, battlesDay,
        arenaPets
    };
}

/** 经济数据统计 */
function getEconomyStats() {
    const db = getDB();
    const r = db.prepare('SELECT SUM(gold) AS total, AVG(gold) AS avg, MAX(gold) AS max, MIN(gold) AS min FROM user').get();
    const treadmillGold = db.prepare('SELECT SUM(collected_today) AS c FROM treadmill').get().c || 0;
    return {
        totalGold:     r.total || 0,
        avgGold:       Math.round(r.avg || 0),
        maxGold:       r.max || 0,
        minGold:       r.min || 0,
        treadmillGoldToday: treadmillGold
    };
}

/** 分布数据（等级/品质/阶段） */
function getDistributions() {
    const db = getDB();
    const levelDist  = db.prepare('SELECT level, COUNT(*) AS count FROM pet GROUP BY level ORDER BY level').all();
    const qualityDist = db.prepare('SELECT quality, COUNT(*) AS count FROM pet GROUP BY quality ORDER BY quality').all();
    const stageDist  = db.prepare('SELECT stage, COUNT(*) AS count FROM pet GROUP BY stage ORDER BY stage').all();
    const genderDist = db.prepare('SELECT gender, COUNT(*) AS count FROM pet GROUP BY gender ORDER BY gender').all();
    return { levelDist, qualityDist, stageDist, genderDist };
}

/** 繁殖统计 */
function getBreedingStats() {
    const db = getDB();
    const ts = now();
    const dayAgo = ts - 86400;

    const marketListings = db.prepare("SELECT COUNT(*) AS c FROM dating_market WHERE status = 'listed'").get().c;
    const totalInvites   = db.prepare('SELECT COUNT(*) AS c FROM breeding_invite').get().c;
    const pendingInvites = db.prepare("SELECT COUNT(*) AS c FROM breeding_invite WHERE status = 'pending'").get().c;
    const totalCages     = db.prepare('SELECT COUNT(*) AS c FROM breeding_cage').get().c;
    const activeCages    = db.prepare("SELECT COUNT(*) AS c FROM breeding_cage WHERE status = 'mating'").get().c;
    const totalOffspring = db.prepare('SELECT COUNT(*) AS c FROM breeding_record').get().c;
    const offspringDay   = db.prepare('SELECT COUNT(*) AS c FROM breeding_record WHERE created_at > ?').get(dayAgo).c;

    return {
        marketListings, totalInvites, pendingInvites,
        totalCages, activeCages,
        totalOffspring, offspringDay
    };
}

/* ═══════════════════════════════════════════
 * 2. 玩家管理
 * ═══════════════════════════════════════════ */

/** 搜索玩家（支持ID/用户名/昵称模糊搜索） */
function searchUsers(keyword, page = 1, pageSize = 20) {
    const db = getDB();
    const offset = (page - 1) * pageSize;
    const like = `%${keyword}%`;

    let rows, total;
    if (/^\d+$/.test(keyword)) {
        /* 纯数字：同时匹配ID和用户名/昵称 */
        rows = db.prepare(`
            SELECT id, username, nickname, gold, diamond, last_login_at, created_at, token_version
            FROM user WHERE id = ? OR username LIKE ? OR nickname LIKE ?
            LIMIT ? OFFSET ?
        `).all(Number(keyword), like, like, pageSize, offset);
        total = db.prepare(`
            SELECT COUNT(*) AS c FROM user WHERE id = ? OR username LIKE ? OR nickname LIKE ?
        `).get(Number(keyword), like, like).c;
    } else {
        rows = db.prepare(`
            SELECT id, username, nickname, gold, diamond, last_login_at, created_at, token_version
            FROM user WHERE username LIKE ? OR nickname LIKE ?
            LIMIT ? OFFSET ?
        `).all(like, like, pageSize, offset);
        total = db.prepare(`
            SELECT COUNT(*) AS c FROM user WHERE username LIKE ? OR nickname LIKE ?
        `).get(like, like).c;
    }
    return { rows, total, page, pageSize };
}

/** 玩家详情（含所有宠物） */
function getUserDetail(uid) {
    const db = getDB();
    const user = db.prepare('SELECT id, username, nickname, gold, diamond, egg_claimed, last_login_at, created_at, token_version FROM user WHERE id = ?').get(uid);
    if (!user) return null;

    const pets = db.prepare(`
        SELECT p.*, pa.str_base, pa.str_talent, pa.agi_base, pa.agi_talent,
               pa.vit_base, pa.vit_talent, pa.int_base, pa.int_talent,
               pa.per_base, pa.per_talent, pa.cha_base, pa.cha_talent,
               pa.hp_max, pa.atk, pa.def, pa.spd, pa.crit_rate, pa.dodge_rate
        FROM pet p LEFT JOIN pet_attr pa ON pa.pet_id = p.id
        WHERE p.user_id = ? ORDER BY p.id
    `).all(uid);

    const eggs = db.prepare('SELECT * FROM pet_egg WHERE user_id = ? ORDER BY id').all(uid);
    const recentLogs = db.prepare('SELECT * FROM log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(uid);

    return { user, pets, eggs, recentLogs };
}

/** 修改用户数据（金币/钻石等） */
function modifyUser(uid, changes) {
    const db = getDB();
    const user = db.prepare('SELECT * FROM user WHERE id = ?').get(uid);
    if (!user) return { code: 8010, msg: '用户不存在' };

    const allowed = ['gold', 'diamond', 'nickname'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
        if (changes[key] !== undefined) {
            sets.push(`${key} = ?`);
            vals.push(changes[key]);
        }
    }
    if (sets.length === 0) return { code: 8011, msg: '无有效修改字段' };

    sets.push('updated_at = ?');
    vals.push(now());
    vals.push(uid);

    db.prepare(`UPDATE user SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return { code: 0, msg: 'ok', data: changes };
}

/** 封禁用户（递增 token_version 使所有 Token 失效） */
function banUser(uid) {
    const db = getDB();
    const user = db.prepare('SELECT * FROM user WHERE id = ?').get(uid);
    if (!user) return { code: 8010, msg: '用户不存在' };

    db.prepare('UPDATE user SET token_version = token_version + 1, updated_at = ? WHERE id = ?').run(now(), uid);
    return { code: 0, msg: '已封禁，Token已全部失效' };
}

/** 解封用户（仅重置 token_version 不影响已失效Token） */
function unbanUser(uid) {
    const db = getDB();
    const user = db.prepare('SELECT * FROM user WHERE id = ?').get(uid);
    if (!user) return { code: 8010, msg: '用户不存在' };
    /* 解封不需要特殊操作，用户重新登录即可获取新Token */
    return { code: 0, msg: '已解封，用户可重新登录' };
}

/* ═══════════════════════════════════════════
 * 3. 宠物管理
 * ═══════════════════════════════════════════ */

/** 宠物完整数据 */
function getPetDetail(petId) {
    const db = getDB();
    const pet = db.prepare('SELECT * FROM pet WHERE id = ?').get(petId);
    if (!pet) return null;

    const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
    const skills = db.prepare('SELECT * FROM pet_skill WHERE pet_id = ?').all(petId);
    const arena = db.prepare('SELECT * FROM arena_pet WHERE pet_id = ?').get(petId);
    const treadmill = db.prepare('SELECT * FROM treadmill WHERE pet_id = ?').get(petId);
    const breedRecords = db.prepare('SELECT * FROM breeding_record WHERE parent1_id = ? OR parent2_id = ? ORDER BY created_at DESC LIMIT 20').all(petId, petId);

    return { pet, attr, skills, arena, treadmill, breedRecords };
}

/** 修改宠物属性/状态 */
function modifyPet(petId, changes) {
    const db = getDB();
    const pet = db.prepare('SELECT * FROM pet WHERE id = ?').get(petId);
    if (!pet) return { code: 8020, msg: '宠物不存在' };

    const ts = now();

    /* pet 表可修改字段 */
    const petFields = ['name', 'quality', 'gender', 'level', 'exp', 'stage',
        'stamina', 'stamina_max', 'satiety', 'satiety_max', 'mood', 'is_active'];
    const petSets = [];
    const petVals = [];
    for (const key of petFields) {
        if (changes[key] !== undefined) {
            petSets.push(`${key} = ?`);
            petVals.push(changes[key]);
        }
    }
    if (petSets.length > 0) {
        petSets.push('updated_at = ?');
        petVals.push(ts);
        petVals.push(petId);
        db.prepare(`UPDATE pet SET ${petSets.join(', ')} WHERE id = ?`).run(...petVals);
    }

    /* pet_attr 表可修改字段 */
    const attrFields = ['str_base', 'str_talent', 'agi_base', 'agi_talent',
        'vit_base', 'vit_talent', 'int_base', 'int_talent',
        'per_base', 'per_talent', 'cha_base', 'cha_talent'];
    const attrSets = [];
    const attrVals = [];
    for (const key of attrFields) {
        if (changes[key] !== undefined) {
            attrSets.push(`${key} = ?`);
            attrVals.push(changes[key]);
        }
    }
    if (attrSets.length > 0) {
        attrSets.push('updated_at = ?');
        attrVals.push(ts);
        attrVals.push(petId);
        db.prepare(`UPDATE pet_attr SET ${attrSets.join(', ')} WHERE pet_id = ?`).run(...attrVals);
    }

    return { code: 0, msg: 'ok' };
}

/* ═══════════════════════════════════════════
 * 4. 战斗记录
 * ═══════════════════════════════════════════ */

/** 查询战斗记录（分页） */
function getBattleRecords(page = 1, pageSize = 20, filters = {}) {
    const db = getDB();
    const offset = (page - 1) * pageSize;

    let where = '1=1';
    const params = [];

    if (filters.uid) {
        where += ' AND (bc.attacker_uid = ? OR bc.defender_uid = ?)';
        params.push(filters.uid, filters.uid);
    }
    if (filters.petId) {
        where += ' AND (bc.attacker_pet_id = ? OR bc.defender_pet_id = ?)';
        params.push(filters.petId, filters.petId);
    }
    if (filters.result) {
        where += ' AND bc.result = ?';
        params.push(filters.result);
    }

    const total = db.prepare(`SELECT COUNT(*) AS c FROM battle_challenge bc WHERE ${where}`).get(...params).c;
    const rows = db.prepare(`
        SELECT bc.*, br.summary
        FROM battle_challenge bc
        LEFT JOIN battle_record br ON br.challenge_id = bc.id
        WHERE ${where}
        ORDER BY bc.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return { rows, total, page, pageSize };
}

/* ═══════════════════════════════════════════
 * 5. 数值热更新
 * ═══════════════════════════════════════════ */

/** 读取当前 game-rules 全部参数 */
function getRules() {
    /* rules 是 module.exports 对象的引用，直接返回即可 */
    const snapshot = {};
    for (const [k, v] of Object.entries(rules)) {
        snapshot[k] = v;
    }
    return snapshot;
}

/** 在线修改 game-rules 参数（热更新，无需重启） */
function updateRules(changes) {
    const modified = [];
    for (const [key, value] of Object.entries(changes)) {
        if (!(key in rules)) continue; /* 忽略不存在的键 */
        rules[key] = value;
        modified.push(key);
    }
    return { modified, count: modified.length };
}

/* ═══════════════════════════════════════════
 * 6. 测试模块
 * ═══════════════════════════════════════════ */

/** 快速生成测试宠物 */
function quickCreatePet(uid, opts = {}) {
    const db = getDB();
    const ts = now();

    const user = db.prepare('SELECT * FROM user WHERE id = ?').get(uid);
    if (!user) return { code: 8010, msg: '用户不存在' };

    const quality = opts.quality || Math.ceil(secureRandom() * 5);
    const gender  = opts.gender  || (secureRandom() < 0.5 ? 1 : 2);
    const level   = opts.level   || 1;
    const stage   = opts.stage   || 0;

    /* 创建蛋记录 */
    const eggResult = db.prepare(`
        INSERT INTO pet_egg (user_id, quality, pattern_seed, is_hatched, talent_points, created_at, updated_at)
        VALUES (?, ?, ?, 1, 0, ?, ?)
    `).run(uid, quality, `test_${ts}`, ts, ts);
    const eggId = eggResult.lastInsertRowid;

    /* 创建宠物 */
    const geneSet = JSON.stringify(geneEngine.generateInitialGeneSet(quality));
    const appearance = JSON.stringify(geneEngine.generateInitialAppearanceGene());
    const petResult = db.prepare(`
        INSERT INTO pet (user_id, egg_id, name, quality, gender, level, exp, stage,
            stamina, stamina_max, satiety, satiety_max, mood, is_active,
            body_seed, gene_set, appearance_gene, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 100, 100, 100, 100, 50, 1, ?, ?, ?, ?, ?)
    `).run(uid, eggId, opts.name || `测试宠物_${ts}`, quality, gender, level, stage,
        `test_${ts}`, geneSet, appearance, ts, ts);
    const petId = Number(petResult.lastInsertRowid);

    /* 创建属性 */
    const talentRange = rules.TALENT_RANGE[quality] || { min: 6, max: 10 };
    const base = rules.INIT_ATTR_BASE + (level - 1) * rules.GROWTH_PER_LEVEL;
    const attrs = {};
    for (const key of rules.ATTR_KEYS) {
        attrs[`${key}_base`] = base;
        attrs[`${key}_talent`] = talentRange.min + Math.floor(secureRandom() * (talentRange.max - talentRange.min + 1));
    }
    db.prepare(`
        INSERT INTO pet_attr (pet_id, str_base, str_talent, agi_base, agi_talent,
            vit_base, vit_talent, int_base, int_talent, per_base, per_talent,
            cha_base, cha_talent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(petId,
        attrs.str_base, attrs.str_talent, attrs.agi_base, attrs.agi_talent,
        attrs.vit_base, attrs.vit_talent, attrs.int_base, attrs.int_talent,
        attrs.per_base, attrs.per_talent, attrs.cha_base, attrs.cha_talent,
        ts, ts);

    /* 初始技能 */
    for (const sk of rules.INITIAL_SKILLS) {
        db.prepare(`
            INSERT INTO pet_skill (pet_id, skill_code, skill_level, is_equipped, slot_index, unlocked_at, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        `).run(petId, sk.skill_code, sk.skill_level, sk.slot_index, ts, ts, ts);
    }

    return { code: 0, data: { petId, eggId, quality, gender, level, stage } };
}

/** 加速成长（直接设置等级/经验/阶段） */
function boostPet(petId, opts = {}) {
    const db = getDB();
    const pet = db.prepare('SELECT * FROM pet WHERE id = ?').get(petId);
    if (!pet) return { code: 8020, msg: '宠物不存在' };

    const ts = now();
    const sets = ['updated_at = ?'];
    const vals = [ts];

    if (opts.level !== undefined)   { sets.push('level = ?');   vals.push(opts.level); }
    if (opts.exp !== undefined)     { sets.push('exp = ?');     vals.push(opts.exp); }
    if (opts.stage !== undefined)   { sets.push('stage = ?');   vals.push(opts.stage); }
    if (opts.stamina !== undefined) { sets.push('stamina = ?'); vals.push(opts.stamina); }
    if (opts.mood !== undefined)    { sets.push('mood = ?');    vals.push(opts.mood); }

    vals.push(petId);
    db.prepare(`UPDATE pet SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    /* 如果设置了等级，同步更新基础属性 */
    if (opts.level !== undefined) {
        const base = rules.INIT_ATTR_BASE + (opts.level - 1) * rules.GROWTH_PER_LEVEL;
        const attrSets = rules.ATTR_KEYS.map(k => `${k}_base = ?`).join(', ');
        const attrVals = rules.ATTR_KEYS.map(() => base);
        attrVals.push(ts, petId);
        db.prepare(`UPDATE pet_attr SET ${attrSets}, updated_at = ? WHERE pet_id = ?`).run(...attrVals);
    }

    return { code: 0, msg: 'ok' };
}

/** 复制指定宠物（创建副本到目标用户名下） */
function clonePet(sourcePetId, targetUid) {
    const db = getDB();
    const ts = now();

    const src = db.prepare('SELECT * FROM pet WHERE id = ?').get(sourcePetId);
    if (!src) return { code: 8020, msg: '源宠物不存在' };

    const targetUser = db.prepare('SELECT * FROM user WHERE id = ?').get(targetUid);
    if (!targetUser) return { code: 8010, msg: '目标用户不存在' };

    /* 复制蛋 */
    const eggResult = db.prepare(`
        INSERT INTO pet_egg (user_id, quality, pattern_seed, is_hatched, talent_points, created_at, updated_at)
        VALUES (?, ?, ?, 1, 0, ?, ?)
    `).run(targetUid, src.quality, `clone_${ts}`, ts, ts);
    const eggId = eggResult.lastInsertRowid;

    /* 复制宠物 */
    const petResult = db.prepare(`
        INSERT INTO pet (user_id, egg_id, name, quality, gender, level, exp, stage,
            stamina, stamina_max, satiety, satiety_max, mood, is_active,
            body_seed, gene_set, appearance_gene, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(targetUid, eggId, `${src.name}(副本)`, src.quality, src.gender,
        src.level, src.exp, src.stage, src.stamina, src.stamina_max,
        src.satiety, src.satiety_max, src.mood,
        src.body_seed, src.gene_set || '', src.appearance_gene || '', ts, ts);
    const newPetId = Number(petResult.lastInsertRowid);

    /* 复制属性 */
    const srcAttr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(sourcePetId);
    if (srcAttr) {
        db.prepare(`
            INSERT INTO pet_attr (pet_id, str_base, str_talent, agi_base, agi_talent,
                vit_base, vit_talent, int_base, int_talent, per_base, per_talent,
                cha_base, cha_talent, hp_max, atk, def, spd, crit_rate, dodge_rate,
                created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newPetId,
            srcAttr.str_base, srcAttr.str_talent, srcAttr.agi_base, srcAttr.agi_talent,
            srcAttr.vit_base, srcAttr.vit_talent, srcAttr.int_base, srcAttr.int_talent,
            srcAttr.per_base, srcAttr.per_talent, srcAttr.cha_base, srcAttr.cha_talent,
            srcAttr.hp_max, srcAttr.atk, srcAttr.def, srcAttr.spd,
            srcAttr.crit_rate, srcAttr.dodge_rate, ts, ts);
    }

    /* 复制技能 */
    const srcSkills = db.prepare('SELECT * FROM pet_skill WHERE pet_id = ?').all(sourcePetId);
    for (const sk of srcSkills) {
        db.prepare(`
            INSERT INTO pet_skill (pet_id, skill_code, skill_level, is_equipped, slot_index, unlocked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newPetId, sk.skill_code, sk.skill_level, sk.is_equipped, sk.slot_index, ts, ts, ts);
    }

    return { code: 0, data: { newPetId, eggId, sourcePetId, targetUid } };
}

/** 模拟对战（两只宠物直接战斗，不影响正式数据） */
function testBattle(pet1Id, pet2Id) {
    const db = getDB();

    const pet1 = db.prepare('SELECT * FROM pet WHERE id = ?').get(pet1Id);
    const pet2 = db.prepare('SELECT * FROM pet WHERE id = ?').get(pet2Id);
    if (!pet1 || !pet2) return { code: 8020, msg: '宠物不存在' };

    const attr1 = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(pet1Id);
    const attr2 = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(pet2Id);
    if (!attr1 || !attr2) return { code: 8021, msg: '宠物属性不存在' };

    const skills1 = db.prepare("SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1").all(pet1Id);
    const skills2 = db.prepare("SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1").all(pet2Id);

    const fighter1 = {
        id: pet1.id, name: pet1.name, quality: pet1.quality,
        level: pet1.level, stage: pet1.stage, stamina: pet1.stamina,
        attr: attr1, skills: skills1
    };
    const fighter2 = {
        id: pet2.id, name: pet2.name, quality: pet2.quality,
        level: pet2.level, stage: pet2.stage, stamina: pet2.stamina,
        attr: attr2, skills: skills2
    };

    const mapIdx = Math.floor(secureRandom() * rules.ARENA_MAPS.length);
    const map = rules.ARENA_MAPS[mapIdx];

    const result = battleEngine.simulate(fighter1, fighter2, map);
    return { code: 0, data: result };
}

/** 模拟交配（两只宠物生成后代，不影响正式数据） */
function testBreeding(pet1Id, pet2Id) {
    const db = getDB();

    const pet1 = db.prepare('SELECT * FROM pet WHERE id = ?').get(pet1Id);
    const pet2 = db.prepare('SELECT * FROM pet WHERE id = ?').get(pet2Id);
    if (!pet1 || !pet2) return { code: 8020, msg: '宠物不存在' };

    const offspring = geneEngine.generateOffspring(pet1, pet2);
    return { code: 0, data: { parent1: { id: pet1.id, name: pet1.name, quality: pet1.quality }, parent2: { id: pet2.id, name: pet2.name, quality: pet2.quality }, offspring } };
}

/* ═══════════════════════════════════════════ */

module.exports = {
    /* 统计 */
    getStats, getEconomyStats, getDistributions, getBreedingStats,
    /* 玩家 */
    searchUsers, getUserDetail, modifyUser, banUser, unbanUser,
    /* 宠物 */
    getPetDetail, modifyPet,
    /* 战斗 */
    getBattleRecords,
    /* 数值 */
    getRules, updateRules,
    /* 测试 */
    quickCreatePet, boostPet, clonePet, testBattle, testBreeding
};
