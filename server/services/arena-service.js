/**
 * 竞技场服务 (P9)
 * - 入场/退场/列表/金币累积
 * - 挑战匹配/发起/结算
 * - 记录清理
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const { secureRandom } = require('../utils/random');
const rules = require('../models/game-rules');

/* ═══════════════════════════════════════════
 * 辅助函数
 * ═══════════════════════════════════════════ */

/** 获取今天日期字符串 YYYY-MM-DD */
function _today() {
    return new Date().toISOString().slice(0, 10);
}

/** 计算战斗力 */
function _calcFightPower(pet, attr) {
    const hp  = attr.vit_base * rules.BATTLE_HP_VIT + attr.str_base * rules.BATTLE_HP_STR + pet.level * rules.BATTLE_HP_LVL;
    const atk = attr.str_base * rules.BATTLE_ATK_STR + attr.agi_base * rules.BATTLE_ATK_AGI + pet.level * rules.BATTLE_ATK_LVL;
    const def = attr.vit_base * rules.BATTLE_DEF_VIT + attr.str_base * rules.BATTLE_DEF_STR + pet.level * rules.BATTLE_DEF_LVL;
    const spd = attr.agi_base * rules.BATTLE_SPD_AGI + attr.per_base * rules.BATTLE_SPD_PER;
    return Math.floor(hp * 0.3 + atk * 1.5 + def * 1.2 + spd * 1.0);
}

/** 累积存钱罐金币（基于入场时间） */
function _accumulateGold(arenaPet, ts) {
    const elapsed = Math.max(0, ts - arenaPet.entered_at);
    const totalGold = Math.floor(elapsed / 60) * rules.ARENA_GOLD_PER_MIN;
    return totalGold;
}

/** 重置每日挑战次数（如果日期变了） */
function _resetDailyIfNeeded(db, arenaPet) {
    const today = _today();
    if (arenaPet.daily_reset_date !== today) {
        db.prepare('UPDATE arena_pet SET daily_challenges = 0, daily_reset_date = ? WHERE id = ?')
          .run(today, arenaPet.id);
        arenaPet.daily_challenges = 0;
        arenaPet.daily_reset_date = today;
    }
}

/* ═══════════════════════════════════════════
 * 入场
 * ═══════════════════════════════════════════ */

/**
 * 宠物入场竞技场
 * 条件：stage≥2, stamina≥1, 未在场内, 非恢复期
 */
function enterArena(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 4041, data: null, msg: '宠物不存在' };
    if (pet.stage < rules.ARENA_MIN_STAGE) return { code: 4001, data: null, msg: `需要阶段≥${rules.ARENA_MIN_STAGE}（成年）` };
    if (pet.stamina < rules.ARENA_ENTRY_STAMINA) return { code: 4002, data: null, msg: '体力不足' };

    // 检查是否已在场内
    const existing = db.prepare('SELECT * FROM arena_pet WHERE pet_id = ?').get(petId);
    if (existing && existing.status === 'active') return { code: 4003, data: null, msg: '宠物已在竞技场中' };
    if (existing && existing.status === 'recovery' && existing.recovery_until > ts) {
        return { code: 4004, data: null, msg: '宠物正在恢复中' };
    }

    // 获取属性计算战斗力
    const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
    if (!attr) return { code: 4005, data: null, msg: '宠物属性异常' };
    const fightPower = _calcFightPower(pet, attr);

    // 扣除体力
    db.prepare('UPDATE pet SET stamina = stamina - ?, updated_at = ? WHERE id = ?')
      .run(rules.ARENA_ENTRY_STAMINA, ts, petId);

    // 更新 pet.arena_status
    db.prepare("UPDATE pet SET arena_status = 'in_arena', updated_at = ? WHERE id = ?").run(ts, petId);

    // 插入或更新 arena_pet
    if (existing) {
        db.prepare(`UPDATE arena_pet SET status = 'active', fight_power = ?, entered_at = ?,
                    recovery_until = 0, consecutive_losses = 0, arena_gold = 0,
                    daily_challenges = 0, daily_reset_date = ? WHERE pet_id = ?`)
          .run(fightPower, ts, _today(), petId);
    } else {
        db.prepare(`INSERT INTO arena_pet (pet_id, user_id, fight_power, entered_at, status, arena_gold, daily_challenges, daily_reset_date)
                    VALUES (?, ?, ?, ?, 'active', 0, 0, ?)`)
          .run(petId, uid, fightPower, ts, _today());
    }

    writeLog(uid, 'arena_enter', 'pet', petId, { fight_power: fightPower }, ip);

    return { code: 0, data: { pet_id: petId, fight_power: fightPower, entered_at: ts }, msg: '入场成功' };
}

/* ═══════════════════════════════════════════
 * 查询竞技场状态
 * ═══════════════════════════════════════════ */

/** 获取自己在竞技场的宠物列表 */
function getMyArena(uid) {
    const db = getDB();
    const ts = now();
    const list = db.prepare(`
        SELECT ap.*, p.name, p.quality, p.stage, p.level, p.stamina
        FROM arena_pet ap
        JOIN pet p ON p.id = ap.pet_id
        WHERE ap.user_id = ? AND ap.status IN ('active', 'recovery')
    `).all(uid);

    return {
        code: 0,
        data: list.map(item => ({
            ...item,
            accumulated_gold: item.status === 'active' ? _accumulateGold(item, ts) : item.arena_gold,
            is_recovering: item.status === 'recovery' && item.recovery_until > ts,
            recovery_remaining: item.status === 'recovery' ? Math.max(0, item.recovery_until - ts) : 0,
        })),
        msg: 'ok'
    };
}

/** 获取竞技场对手列表（同品质+同阶段，排除自己） */
function listOpponents(uid, petId) {
    const db = getDB();
    const ts = now();

    const myPet = db.prepare('SELECT quality, stage FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!myPet) return { code: 4041, data: null, msg: '宠物不存在' };

    const myArena = db.prepare("SELECT * FROM arena_pet WHERE pet_id = ? AND status = 'active'").get(petId);
    if (!myArena) return { code: 4006, data: null, msg: '宠物未在竞技场中' };

    const opponents = db.prepare(`
        SELECT ap.*, p.name, p.quality, p.stage, p.level, u.nickname
        FROM arena_pet ap
        JOIN pet p ON p.id = ap.pet_id
        JOIN user u ON u.id = ap.user_id
        WHERE ap.status = 'active'
          AND ap.user_id != ?
          AND p.quality = ?
          AND p.stage = ?
        ORDER BY ap.fight_power DESC
        LIMIT 20
    `).all(uid, myPet.quality, myPet.stage);

    return {
        code: 0,
        data: opponents.map(o => ({
            pet_id: o.pet_id,
            name: o.name,
            quality: o.quality,
            stage: o.stage,
            level: o.level,
            fight_power: o.fight_power,
            owner: o.nickname,
            accumulated_gold: _accumulateGold(o, ts),
        })),
        msg: 'ok'
    };
}

/* ═══════════════════════════════════════════
 * 提取存钱罐金币
 * ═══════════════════════════════════════════ */

function collectGold(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const arenaPet = db.prepare("SELECT * FROM arena_pet WHERE pet_id = ? AND user_id = ? AND status = 'active'").get(petId, uid);
    if (!arenaPet) return { code: 4006, data: null, msg: '宠物未在竞技场中' };

    const gold = _accumulateGold(arenaPet, ts);
    if (gold <= 0) return { code: 4007, data: null, msg: '暂无可提取金币' };

    const exchanged = Math.floor(gold * rules.ARENA_GOLD_EXCHANGE_RATE);

    db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?').run(exchanged, ts, uid);
    // 重置入场时间（重新开始累积）
    db.prepare('UPDATE arena_pet SET entered_at = ?, arena_gold = 0 WHERE id = ?').run(ts, arenaPet.id);

    writeLog(uid, 'arena_collect', 'pet', petId, { gold: exchanged }, ip);

    return { code: 0, data: { collected: exchanged }, msg: 'ok' };
}

/* ═══════════════════════════════════════════
 * 发起挑战
 * ═══════════════════════════════════════════ */

/**
 * 发起异步挑战
 * 校验：双方在场 + 同品质同阶段 + 每日次数 + 最低赌注
 */
function challenge(uid, myPetId, targetPetId, ip) {
    const db = getDB();
    const ts = now();

    if (myPetId === targetPetId) return { code: 4008, data: null, msg: '不能挑战自己' };

    // 校验攻击方
    const myArena = db.prepare("SELECT * FROM arena_pet WHERE pet_id = ? AND user_id = ? AND status = 'active'").get(myPetId, uid);
    if (!myArena) return { code: 4006, data: null, msg: '你的宠物未在竞技场中' };

    _resetDailyIfNeeded(db, myArena);
    if (myArena.daily_challenges >= rules.ARENA_DAILY_CHALLENGE_LIMIT) {
        return { code: 4009, data: null, msg: '今日挑战次数已用完' };
    }

    // 校验防守方
    const defArena = db.prepare("SELECT * FROM arena_pet WHERE pet_id = ? AND status = 'active'").get(targetPetId);
    if (!defArena) return { code: 4010, data: null, msg: '对手不在竞技场中' };

    // 校验同品质同阶段
    const myPet = db.prepare('SELECT quality, stage FROM pet WHERE id = ?').get(myPetId);
    const defPet = db.prepare('SELECT quality, stage FROM pet WHERE id = ?').get(targetPetId);
    if (myPet.quality !== defPet.quality || myPet.stage !== defPet.stage) {
        return { code: 4011, data: null, msg: '只能挑战同品质同阶段的对手' };
    }

    // 计算赌注 = min(双方存钱罐)，但不低于 ARENA_MIN_BET
    const myGold = _accumulateGold(myArena, ts);
    const defGold = _accumulateGold(defArena, ts);
    const bet = Math.max(rules.ARENA_MIN_BET, Math.min(myGold, defGold));

    // 随机选择地图
    const mapIdx = secureRandom(0, rules.ARENA_MAPS.length - 1);
    const map = rules.ARENA_MAPS[mapIdx];

    // 创建挑战记录
    const result = db.prepare(`
        INSERT INTO battle_challenge (attacker_pet_id, defender_pet_id, attacker_uid, defender_uid, map_id, bet_amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(myPetId, targetPetId, uid, defArena.user_id, map.id, bet, ts);

    // 增加每日挑战次数
    db.prepare('UPDATE arena_pet SET daily_challenges = daily_challenges + 1 WHERE id = ?').run(myArena.id);

    writeLog(uid, 'arena_challenge', 'pet', myPetId, { target: targetPetId, bet, map: map.id }, ip);

    return {
        code: 0,
        data: {
            challenge_id: result.lastInsertRowid,
            attacker_pet_id: myPetId,
            defender_pet_id: targetPetId,
            bet_amount: bet,
            map: map,
        },
        msg: '挑战已发起'
    };
}

/* ═══════════════════════════════════════════
 * 执行战斗（调用 battle-engine）
 * ═══════════════════════════════════════════ */

function executeBattle(challengeId, ip) {
    const db = getDB();
    const ts = now();

    const ch = db.prepare("SELECT * FROM battle_challenge WHERE id = ? AND status = 'pending'").get(challengeId);
    if (!ch) return { code: 4012, data: null, msg: '挑战不存在或已完成' };

    // 获取双方完整数据
    const pet1 = db.prepare('SELECT * FROM pet WHERE id = ?').get(ch.attacker_pet_id);
    const pet2 = db.prepare('SELECT * FROM pet WHERE id = ?').get(ch.defender_pet_id);
    const attr1 = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(ch.attacker_pet_id);
    const attr2 = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(ch.defender_pet_id);
    const skills1 = db.prepare("SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1").all(ch.attacker_pet_id);
    const skills2 = db.prepare("SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1").all(ch.defender_pet_id);

    if (!pet1 || !pet2 || !attr1 || !attr2) {
        db.prepare("UPDATE battle_challenge SET status = 'cancelled', finished_at = ? WHERE id = ?").run(ts, challengeId);
        return { code: 4013, data: null, msg: '战斗数据异常，挑战取消' };
    }

    // 调用战斗引擎
    const battleEngine = require('./battle-engine');
    const battleResult = battleEngine.simulate({
        pet1: { ...pet1, attr: attr1, skills: skills1 },
        pet2: { ...pet2, attr: attr2, skills: skills2 },
        mapId: ch.map_id,
    });

    // 结算
    const reward = _settle(db, ch, battleResult, ts);

    // 更新挑战状态
    db.prepare(`UPDATE battle_challenge SET status = 'finished', result = ?, reward_detail = ?, finished_at = ? WHERE id = ?`)
      .run(battleResult.winner, JSON.stringify(reward), ts, challengeId);

    // 保存战斗记录
    const expireAt = ts + rules.ARENA_RECORD_EXPIRE;
    db.prepare(`INSERT INTO battle_record (challenge_id, frames, summary, expire_at, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(challengeId, JSON.stringify(battleResult.frames), JSON.stringify(battleResult.summary), expireAt, ts);

    writeLog(ch.attacker_uid, 'arena_battle', 'challenge', challengeId, { result: battleResult.winner, bet: ch.bet_amount }, ip);

    return {
        code: 0,
        data: {
            challenge_id: challengeId,
            winner: battleResult.winner,
            summary: battleResult.summary,
            reward,
            frame_count: battleResult.frames.length,
        },
        msg: '战斗完成'
    };
}

/** 结算奖惩 */
function _settle(db, challenge, battleResult, ts) {
    const bet = challenge.bet_amount;
    const atkUid = challenge.attacker_uid;
    const defUid = challenge.defender_uid;
    const atkPetId = challenge.attacker_pet_id;
    const defPetId = challenge.defender_pet_id;

    let reward = {};

    if (battleResult.winner === 'left') {
        // 攻击方(left)胜：+赌注 +5金 -1体力
        const winGold = bet + rules.ARENA_BATTLE_BONUS;
        db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?').run(winGold, ts, atkUid);
        db.prepare('UPDATE pet SET stamina = MAX(0, stamina - ?), updated_at = ? WHERE id = ?').run(rules.ARENA_WIN_STAMINA_COST, ts, atkPetId);
        // 防守方：-赌注 -5金 -10体力
        const losePenalty = bet + rules.ARENA_LOSE_GOLD_PENALTY;
        db.prepare('UPDATE user SET gold = MAX(0, gold - ?), updated_at = ? WHERE id = ?').run(losePenalty, ts, defUid);
        db.prepare('UPDATE pet SET stamina = MAX(0, stamina - ?), updated_at = ? WHERE id = ?').run(rules.ARENA_LOSE_STAMINA_COST, ts, defPetId);
        // 防守方进入恢复期
        db.prepare("UPDATE arena_pet SET status = 'recovery', recovery_until = ?, consecutive_losses = consecutive_losses + 1 WHERE pet_id = ?")
          .run(ts + rules.ARENA_RECOVERY_DURATION, defPetId);
        db.prepare("UPDATE pet SET arena_status = 'recovery', updated_at = ? WHERE id = ?").run(ts, defPetId);
        // 攻击方重置连败
        db.prepare('UPDATE arena_pet SET consecutive_losses = 0 WHERE pet_id = ?').run(atkPetId);

        reward = { attacker: { gold: winGold, stamina: -rules.ARENA_WIN_STAMINA_COST }, defender: { gold: -losePenalty, stamina: -rules.ARENA_LOSE_STAMINA_COST } };

    } else if (battleResult.winner === 'right') {
        // 防守方(right)胜
        const winGold = bet + rules.ARENA_BATTLE_BONUS;
        db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?').run(winGold, ts, defUid);
        db.prepare('UPDATE pet SET stamina = MAX(0, stamina - ?), updated_at = ? WHERE id = ?').run(rules.ARENA_WIN_STAMINA_COST, ts, defPetId);
        // 攻击方败
        const losePenalty = bet + rules.ARENA_LOSE_GOLD_PENALTY;
        db.prepare('UPDATE user SET gold = MAX(0, gold - ?), updated_at = ? WHERE id = ?').run(losePenalty, ts, atkUid);
        db.prepare('UPDATE pet SET stamina = MAX(0, stamina - ?), updated_at = ? WHERE id = ?').run(rules.ARENA_LOSE_STAMINA_COST, ts, atkPetId);
        // 攻击方进入恢复期
        db.prepare("UPDATE arena_pet SET status = 'recovery', recovery_until = ?, consecutive_losses = consecutive_losses + 1 WHERE pet_id = ?")
          .run(ts + rules.ARENA_RECOVERY_DURATION, atkPetId);
        db.prepare("UPDATE pet SET arena_status = 'recovery', updated_at = ? WHERE id = ?").run(ts, atkPetId);
        // 防守方重置连败
        db.prepare('UPDATE arena_pet SET consecutive_losses = 0 WHERE pet_id = ?').run(defPetId);

        reward = { attacker: { gold: -losePenalty, stamina: -rules.ARENA_LOSE_STAMINA_COST }, defender: { gold: winGold, stamina: -rules.ARENA_WIN_STAMINA_COST } };

    } else {
        // 平局：双方 -10体力 +10金
        db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?').run(rules.ARENA_DRAW_BONUS, ts, atkUid);
        db.prepare('UPDATE user SET gold = gold + ?, updated_at = ? WHERE id = ?').run(rules.ARENA_DRAW_BONUS, ts, defUid);
        db.prepare('UPDATE pet SET stamina = MAX(0, stamina - ?), updated_at = ? WHERE id = ?').run(rules.ARENA_DRAW_STAMINA_COST, ts, atkPetId);
        db.prepare('UPDATE pet SET stamina = MAX(0, stamina - ?), updated_at = ? WHERE id = ?').run(rules.ARENA_DRAW_STAMINA_COST, ts, defPetId);

        reward = { attacker: { gold: rules.ARENA_DRAW_BONUS, stamina: -rules.ARENA_DRAW_STAMINA_COST }, defender: { gold: rules.ARENA_DRAW_BONUS, stamina: -rules.ARENA_DRAW_STAMINA_COST } };
    }

    return reward;
}

/* ═══════════════════════════════════════════
 * 战斗记录查询 / 回放
 * ═══════════════════════════════════════════ */

/** 获取战斗记录列表（自己参与的） */
function getBattleHistory(uid, limit = 20) {
    const db = getDB();
    const ts = now();
    const list = db.prepare(`
        SELECT bc.id, bc.attacker_pet_id, bc.defender_pet_id, bc.map_id, bc.bet_amount,
               bc.result, bc.reward_detail, bc.created_at, bc.finished_at,
               p1.name as attacker_name, p2.name as defender_name
        FROM battle_challenge bc
        JOIN pet p1 ON p1.id = bc.attacker_pet_id
        JOIN pet p2 ON p2.id = bc.defender_pet_id
        WHERE bc.status = 'finished'
          AND (bc.attacker_uid = ? OR bc.defender_uid = ?)
        ORDER BY bc.finished_at DESC
        LIMIT ?
    `).all(uid, uid, limit);

    return { code: 0, data: list, msg: 'ok' };
}

/** 获取战斗回放帧数据 */
function getBattleReplay(challengeId) {
    const db = getDB();
    const ts = now();

    const record = db.prepare(`
        SELECT br.*, bc.attacker_pet_id, bc.defender_pet_id, bc.map_id, bc.result
        FROM battle_record br
        JOIN battle_challenge bc ON bc.id = br.challenge_id
        WHERE br.challenge_id = ? AND br.expire_at > ?
    `).get(challengeId, ts);

    if (!record) return { code: 4014, data: null, msg: '记录不存在或已过期' };

    return {
        code: 0,
        data: {
            challenge_id: challengeId,
            attacker_pet_id: record.attacker_pet_id,
            defender_pet_id: record.defender_pet_id,
            map_id: record.map_id,
            result: record.result,
            frames: JSON.parse(record.frames || '[]'),
            summary: JSON.parse(record.summary || '{}'),
        },
        msg: 'ok'
    };
}

/* ═══════════════════════════════════════════
 * 观战（HTTP长轮询模拟）
 * ═══════════════════════════════════════════ */

/** 获取正在进行的战斗列表 */
function getLiveBattles() {
    const db = getDB();
    const list = db.prepare(`
        SELECT bc.id, bc.attacker_pet_id, bc.defender_pet_id, bc.map_id, bc.bet_amount, bc.created_at,
               p1.name as attacker_name, p2.name as defender_name
        FROM battle_challenge bc
        JOIN pet p1 ON p1.id = bc.attacker_pet_id
        JOIN pet p2 ON p2.id = bc.defender_pet_id
        WHERE bc.status = 'pending'
        ORDER BY bc.created_at DESC
        LIMIT 10
    `).all();

    return { code: 0, data: list, msg: 'ok' };
}

/* ═══════════════════════════════════════════
 * 过期记录清理
 * ═══════════════════════════════════════════ */

function cleanExpiredRecords() {
    const db = getDB();
    const ts = now();
    const result = db.prepare('DELETE FROM battle_record WHERE expire_at > 0 AND expire_at < ?').run(ts);
    return { deleted: result.changes };
}

/* ═══════════════════════════════════════════
 * 管理员测试战斗
 * ═══════════════════════════════════════════ */

function adminTestBattle(adminUid, pet1Id, pet2Id, ip) {
    const db = getDB();
    const ts = now();

    const pet1 = db.prepare('SELECT * FROM pet WHERE id = ?').get(pet1Id);
    const pet2 = db.prepare('SELECT * FROM pet WHERE id = ?').get(pet2Id);
    const attr1 = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(pet1Id);
    const attr2 = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(pet2Id);
    const skills1 = db.prepare("SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1").all(pet1Id);
    const skills2 = db.prepare("SELECT * FROM pet_skill WHERE pet_id = ? AND is_equipped = 1").all(pet2Id);

    if (!pet1 || !pet2 || !attr1 || !attr2) {
        return { code: 4013, data: null, msg: '宠物数据异常' };
    }

    const battleEngine = require('./battle-engine');
    const battleResult = battleEngine.simulate({
        pet1: { ...pet1, attr: attr1, skills: skills1 },
        pet2: { ...pet2, attr: attr2, skills: skills2 },
        mapId: 'grassland',
    });

    db.prepare(`INSERT INTO battle_test (admin_uid, pet1_id, pet2_id, result, frames, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(adminUid, pet1Id, pet2Id, battleResult.winner, JSON.stringify(battleResult.frames), ts);

    writeLog(adminUid, 'admin_test_battle', 'pet', pet1Id, { pet2: pet2Id, result: battleResult.winner }, ip);

    return {
        code: 0,
        data: {
            winner: battleResult.winner,
            summary: battleResult.summary,
            frame_count: battleResult.frames.length,
        },
        msg: '测试战斗完成'
    };
}

module.exports = {
    enterArena,
    getMyArena,
    listOpponents,
    collectGold,
    challenge,
    executeBattle,
    getBattleHistory,
    getBattleReplay,
    getLiveBattles,
    cleanExpiredRecords,
    adminTestBattle,
};
