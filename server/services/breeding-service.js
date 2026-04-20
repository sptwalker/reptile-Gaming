/**
 * P8 繁殖业务逻辑
 * - 交友市场：注册/下架/浏览
 * - 配对邀请：发送/接受/拒绝
 * - 交配笼：开始/查询/完成
 * - 后代生成：遗传管线 + 蛋创建
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const { secureRandom }         = require('../utils/random');
const rules                    = require('../models/game-rules');
const geneEngine               = require('./gene-engine');

/* ═══════════════════════════════════════════
 * 交友市场
 * ═══════════════════════════════════════════ */

/**
 * 注册宠物到交友市场
 */
function listPetOnMarket(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const pet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(petId, uid);
    if (!pet) return { code: 3001, data: null, msg: '宠物不存在' };
    if (pet.stage < rules.BREED_MIN_STAGE) {
        return { code: 4001, data: null, msg: `宠物需达到${rules.STAGE_NAMES[rules.BREED_MIN_STAGE]}阶段才能上架` };
    }
    if (pet.arena_status === 'in_arena') {
        return { code: 4001, data: null, msg: '竞技场中的宠物无法上架' };
    }

    /* 检查是否已上架 */
    const existing = db.prepare(
        "SELECT id FROM dating_market WHERE pet_id = ? AND status = 'listed'"
    ).get(petId);
    if (existing) return { code: 4001, data: null, msg: '该宠物已在交友市场' };

    db.prepare(
        'INSERT INTO dating_market (pet_id, user_id, status, listed_at) VALUES (?, ?, ?, ?)'
    ).run(petId, uid, 'listed', ts);

    writeLog(uid, 'market_list', 'pet', petId, { pet_id: petId }, ip);
    return { code: 0, data: { pet_id: petId }, msg: 'success' };
}

/**
 * 从交友市场下架
 */
function unlistPet(uid, petId, ip) {
    const db = getDB();
    const ts = now();

    const listing = db.prepare(
        "SELECT id FROM dating_market WHERE pet_id = ? AND user_id = ? AND status = 'listed'"
    ).get(petId, uid);
    if (!listing) return { code: 3001, data: null, msg: '未找到上架记录' };

    db.prepare(
        "UPDATE dating_market SET status = 'unlisted', unlisted_at = ? WHERE id = ?"
    ).run(ts, listing.id);

    writeLog(uid, 'market_unlist', 'pet', petId, { pet_id: petId }, ip);
    return { code: 0, data: { pet_id: petId }, msg: 'success' };
}

/**
 * 浏览交友市场（按性别过滤）
 */
function browseMarket(uid, gender) {
    const db = getDB();

    let sql = `
        SELECT dm.id as listing_id, dm.pet_id, dm.user_id,
               p.name, p.quality, p.gender, p.level, p.stage, p.mood,
               u.nickname as owner_name
        FROM dating_market dm
        JOIN pet p ON p.id = dm.pet_id
        JOIN user u ON u.id = dm.user_id
        WHERE dm.status = 'listed' AND dm.user_id != ?
    `;
    const params = [uid];

    if (gender && (gender === 1 || gender === 2)) {
        sql += ' AND p.gender = ?';
        params.push(gender);
    }

    sql += ' ORDER BY dm.listed_at DESC LIMIT 50';

    const listings = db.prepare(sql).all(...params);
    const result = listings.map(l => ({
        ...l,
        quality_name: rules.QUALITY_NAMES[l.quality] || '未知',
        gender_name: rules.GENDER_NAMES[l.gender] || '未知',
        stage_name: rules.STAGE_NAMES[l.stage] || '未知',
    }));

    return { code: 0, data: { listings: result }, msg: 'success' };
}

/* ═══════════════════════════════════════════
 * 配对邀请
 * ═══════════════════════════════════════════ */

/**
 * 发送配对邀请
 * @param {string} eggProtocol 蛋分配协议: 'single'(单蛋归发起方) | 'split'(双蛋各一)
 */
function sendInvite(uid, myPetId, targetPetId, eggProtocol, ip) {
    const db = getDB();
    const ts = now();

    /* 校验自己的宠物 */
    const myPet = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(myPetId, uid);
    if (!myPet) return { code: 3001, data: null, msg: '你的宠物不存在' };
    if (myPet.stage < rules.BREED_MIN_STAGE) {
        return { code: 4001, data: null, msg: '你的宠物未达到繁殖阶段' };
    }

    /* 校验目标宠物在市场上 */
    const listing = db.prepare(
        "SELECT * FROM dating_market WHERE pet_id = ? AND status = 'listed'"
    ).get(targetPetId);
    if (!listing) return { code: 3001, data: null, msg: '目标宠物不在交友市场' };

    const targetPet = db.prepare('SELECT * FROM pet WHERE id = ?').get(targetPetId);
    if (!targetPet) return { code: 3001, data: null, msg: '目标宠物不存在' };

    /* 性别校验：必须异性 */
    if (myPet.gender === targetPet.gender) {
        return { code: 4001, data: null, msg: '配对需要异性宠物' };
    }

    /* 繁殖冷却检查 */
    if (myPet.last_breed_at > 0 && (ts - myPet.last_breed_at) < rules.BREED_COOLDOWN) {
        const remain = rules.BREED_COOLDOWN - (ts - myPet.last_breed_at);
        return { code: 4001, data: null, msg: `繁殖冷却中，剩余 ${Math.ceil(remain / 60)} 分钟` };
    }

    /* 体力/心情检查 */
    if (myPet.stamina < rules.BREED_STAMINA_COST) {
        return { code: 4001, data: null, msg: `体力不足，需要 ${rules.BREED_STAMINA_COST}` };
    }
    if (myPet.mood < rules.BREED_MOOD_COST) {
        return { code: 4001, data: null, msg: `心情不足，需要 ${rules.BREED_MOOD_COST}` };
    }

    /* 金币检查 */
    const user = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);
    if (user.gold < rules.BREED_GOLD_COST) {
        return { code: 4001, data: null, msg: `金币不足，需要 ${rules.BREED_GOLD_COST}` };
    }

    /* 检查是否已有待处理邀请 */
    const pending = db.prepare(
        "SELECT id FROM breeding_invite WHERE from_uid = ? AND pet1_id = ? AND status = 'pending' AND expire_at > ?"
    ).get(uid, myPetId, ts);
    if (pending) return { code: 4001, data: null, msg: '该宠物已有待处理的邀请' };

    const protocol = eggProtocol === 'split' ? 'split' : 'single';

    const result = db.prepare(`
        INSERT INTO breeding_invite (from_uid, to_uid, pet1_id, pet2_id, status, egg_protocol, expire_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(uid, listing.user_id, myPetId, targetPetId, protocol, ts + rules.BREED_INVITE_EXPIRE, ts, ts);

    writeLog(uid, 'breed_invite_send', 'pet', myPetId, {
        invite_id: result.lastInsertRowid, target_pet: targetPetId, protocol
    }, ip);

    return {
        code: 0,
        data: { invite_id: result.lastInsertRowid, expire_at: ts + rules.BREED_INVITE_EXPIRE },
        msg: 'success'
    };
}

/**
 * 查看收到的邀请
 */
function listInvites(uid) {
    const db = getDB();
    const ts = now();

    const invites = db.prepare(`
        SELECT bi.*, p1.name as pet1_name, p1.quality as pet1_quality, p1.gender as pet1_gender,
               p2.name as pet2_name, p2.quality as pet2_quality, p2.gender as pet2_gender,
               u.nickname as from_name
        FROM breeding_invite bi
        JOIN pet p1 ON p1.id = bi.pet1_id
        JOIN pet p2 ON p2.id = bi.pet2_id
        JOIN user u ON u.id = bi.from_uid
        WHERE bi.to_uid = ? AND bi.status = 'pending' AND bi.expire_at > ?
        ORDER BY bi.created_at DESC
    `).all(uid, ts);

    return { code: 0, data: { invites }, msg: 'success' };
}

/**
 * 接受配对邀请 → 进入交配笼
 */
function acceptInvite(uid, inviteId, ip) {
    const db = getDB();
    const ts = now();

    const invite = db.prepare(
        "SELECT * FROM breeding_invite WHERE id = ? AND to_uid = ? AND status = 'pending'"
    ).get(inviteId, uid);
    if (!invite) return { code: 3001, data: null, msg: '邀请不存在或已过期' };
    if (invite.expire_at <= ts) {
        db.prepare("UPDATE breeding_invite SET status = 'expired', updated_at = ? WHERE id = ?").run(ts, inviteId);
        return { code: 4001, data: null, msg: '邀请已过期' };
    }

    /* 校验双方宠物状态 */
    const pet1 = db.prepare('SELECT * FROM pet WHERE id = ?').get(invite.pet1_id);
    const pet2 = db.prepare('SELECT * FROM pet WHERE id = ? AND user_id = ?').get(invite.pet2_id, uid);
    if (!pet1 || !pet2) return { code: 3001, data: null, msg: '宠物状态异常' };

    /* 校验接受方体力/心情/金币 */
    if (pet2.stamina < rules.BREED_STAMINA_COST) {
        return { code: 4001, data: null, msg: `你的宠物体力不足，需要 ${rules.BREED_STAMINA_COST}` };
    }
    const user2 = db.prepare('SELECT gold FROM user WHERE id = ?').get(uid);
    if (user2.gold < rules.BREED_GOLD_COST) {
        return { code: 4001, data: null, msg: `金币不足，需要 ${rules.BREED_GOLD_COST}` };
    }

    const finishAt = ts + rules.BREED_CAGE_DURATION;

    const txn = db.transaction(() => {
        /* 更新邀请状态 */
        db.prepare("UPDATE breeding_invite SET status = 'accepted', updated_at = ? WHERE id = ?").run(ts, inviteId);

        /* 创建交配笼 */
        db.prepare(`
            INSERT INTO breeding_cage (invite_id, pet1_id, pet2_id, user1_id, user2_id, started_at, finish_at, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'mating', ?)
        `).run(inviteId, invite.pet1_id, invite.pet2_id, invite.from_uid, uid, ts, finishAt, ts);

        /* 扣除双方体力/心情/金币 */
        db.prepare('UPDATE pet SET stamina = stamina - ?, mood = mood - ?, updated_at = ? WHERE id = ?')
            .run(rules.BREED_STAMINA_COST, rules.BREED_MOOD_COST, ts, invite.pet1_id);
        db.prepare('UPDATE pet SET stamina = stamina - ?, mood = mood - ?, updated_at = ? WHERE id = ?')
            .run(rules.BREED_STAMINA_COST, rules.BREED_MOOD_COST, ts, invite.pet2_id);
        db.prepare('UPDATE user SET gold = gold - ?, updated_at = ? WHERE id = ?')
            .run(rules.BREED_GOLD_COST, ts, invite.from_uid);
        db.prepare('UPDATE user SET gold = gold - ?, updated_at = ? WHERE id = ?')
            .run(rules.BREED_GOLD_COST, ts, uid);

        /* 下架双方宠物 */
        db.prepare("UPDATE dating_market SET status = 'unlisted', unlisted_at = ? WHERE pet_id = ? AND status = 'listed'")
            .run(ts, invite.pet1_id);
        db.prepare("UPDATE dating_market SET status = 'unlisted', unlisted_at = ? WHERE pet_id = ? AND status = 'listed'")
            .run(ts, invite.pet2_id);
    });
    txn();

    writeLog(uid, 'breed_invite_accept', 'pet', invite.pet2_id, { invite_id: inviteId }, ip);

    return {
        code: 0,
        data: { invite_id: inviteId, finish_at: finishAt },
        msg: 'success'
    };
}

/**
 * 拒绝邀请
 */
function rejectInvite(uid, inviteId, ip) {
    const db = getDB();
    const ts = now();

    const invite = db.prepare(
        "SELECT * FROM breeding_invite WHERE id = ? AND to_uid = ? AND status = 'pending'"
    ).get(inviteId, uid);
    if (!invite) return { code: 3001, data: null, msg: '邀请不存在' };

    db.prepare("UPDATE breeding_invite SET status = 'rejected', updated_at = ? WHERE id = ?").run(ts, inviteId);
    writeLog(uid, 'breed_invite_reject', 'pet', invite.pet2_id, { invite_id: inviteId }, ip);

    return { code: 0, data: null, msg: 'success' };
}

/* ═══════════════════════════════════════════
 * 交配笼
 * ═══════════════════════════════════════════ */

/**
 * 查询交配笼状态
 */
function getCageStatus(uid) {
    const db = getDB();
    const ts = now();

    const cages = db.prepare(`
        SELECT bc.*, p1.name as pet1_name, p2.name as pet2_name
        FROM breeding_cage bc
        JOIN pet p1 ON p1.id = bc.pet1_id
        JOIN pet p2 ON p2.id = bc.pet2_id
        WHERE (bc.user1_id = ? OR bc.user2_id = ?) AND bc.status = 'mating'
        ORDER BY bc.created_at DESC
    `).all(uid, uid);

    const result = cages.map(c => ({
        ...c,
        remaining: Math.max(0, c.finish_at - ts),
        progress: Math.min(1, (ts - c.started_at) / (c.finish_at - c.started_at)),
        ready: ts >= c.finish_at,
    }));

    return { code: 0, data: { cages: result }, msg: 'success' };
}

/**
 * 完成交配 → 计算成功率 → 生成后代蛋
 */
function finishBreeding(uid, cageId, ip) {
    const db = getDB();
    const ts = now();

    const cage = db.prepare(
        "SELECT * FROM breeding_cage WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND status = 'mating'"
    ).get(cageId, uid, uid);
    if (!cage) return { code: 3001, data: null, msg: '交配笼不存在' };
    if (ts < cage.finish_at) {
        return { code: 4001, data: null, msg: '交配尚未完成' };
    }

    /* 获取双亲完整数据 */
    const parent1 = _getFullPetData(cage.pet1_id);
    const parent2 = _getFullPetData(cage.pet2_id);
    if (!parent1 || !parent2) return { code: 9999, data: null, msg: '宠物数据异常' };

    /* 计算繁殖成功概率 */
    const prob = _calcBreedProb(parent1, parent2, ts);
    const success = secureRandom(1, 100) <= Math.round(prob * 100);

    if (!success) {
        const txn = db.transaction(() => {
            db.prepare("UPDATE breeding_cage SET status = 'failed', result = 'fail' WHERE id = ?")
                .run(cageId);
            /* 更新繁殖时间 */
            db.prepare('UPDATE pet SET last_breed_at = ?, breed_count = breed_count + 1, updated_at = ? WHERE id = ?')
                .run(ts, ts, cage.pet1_id);
            db.prepare('UPDATE pet SET last_breed_at = ?, breed_count = breed_count + 1, updated_at = ? WHERE id = ?')
                .run(ts, ts, cage.pet2_id);
        });
        txn();

        writeLog(uid, 'breed_fail', 'pet', cage.pet1_id, { cage_id: cageId, prob }, ip);
        return { code: 0, data: { success: false, prob }, msg: '繁殖失败' };
    }

    /* 成功：生成后代蛋 */
    const eggCount = secureRandom(rules.BREED_EGG_MIN, rules.BREED_EGG_MAX);
    const invite = db.prepare('SELECT * FROM breeding_invite WHERE id = ?').get(cage.invite_id);
    const protocol = invite ? invite.egg_protocol : 'single';

    const eggs = [];
    const txn = db.transaction(() => {
        for (let i = 0; i < eggCount; i++) {
            const offspring = geneEngine.generateOffspring(parent1, parent2);

            /* 确定蛋归属 */
            let eggOwner;
            if (protocol === 'split' && eggCount >= 2) {
                eggOwner = i === 0 ? cage.user1_id : cage.user2_id;
            } else {
                eggOwner = cage.user1_id;
            }

            /* 创建蛋 */
            const eggResult = db.prepare(`
                INSERT INTO pet_egg (user_id, quality, pattern_seed, is_hatched, hatch_start_at, hatch_duration, talent_points, created_at, updated_at)
                VALUES (?, ?, ?, 0, 0, ?, 0, ?, ?)
            `).run(
                eggOwner,
                offspring.quality,
                JSON.stringify(offspring.patternSeed),
                rules.HATCH_DURATION[offspring.quality],
                ts, ts
            );
            const eggId = eggResult.lastInsertRowid;

            /* 将遗传信息存入 breeding_record */
            db.prepare(`
                INSERT INTO breeding_record (parent1_id, parent2_id, child_id, user1_id, user2_id, inherit_detail, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                cage.pet1_id, cage.pet2_id, eggId,
                cage.user1_id, cage.user2_id,
                JSON.stringify({
                    quality: offspring.quality,
                    gender: offspring.gender,
                    generation: offspring.generation,
                    geneSet: offspring.geneSet,
                    talents: offspring.talents,
                    expression: offspring.expression,
                    appearanceGene: offspring.appearanceGene,
                    patternSeed: offspring.patternSeed,
                    skills: offspring.skills,
                    hiddenGene: offspring.hiddenGene,
                    hiddenUnlocked: offspring.hiddenUnlocked,
                    parent1_id: cage.pet1_id,
                    parent2_id: cage.pet2_id,
                }),
                ts
            );

            /* 隐藏基因解锁记录 */
            if (offspring.hiddenUnlocked) {
                db.prepare(`
                    INSERT INTO hidden_gene_log (gene_type, pet_id, parent1_id, parent2_id, unlocked_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(offspring.hiddenGene, eggId, cage.pet1_id, cage.pet2_id, ts);
            }

            eggs.push({
                egg_id: eggId,
                owner_uid: eggOwner,
                quality: offspring.quality,
                quality_name: rules.QUALITY_NAMES[offspring.quality],
                gender: offspring.gender,
                hidden_unlocked: offspring.hiddenUnlocked,
                hidden_name: offspring.hiddenUnlocked ? offspring.hiddenEffects.name : null,
            });
        }

        /* 更新交配笼状态 */
        db.prepare("UPDATE breeding_cage SET status = 'done', result = 'success' WHERE id = ?")
            .run(cageId);

        /* 更新双亲繁殖记录 */
        db.prepare('UPDATE pet SET last_breed_at = ?, breed_count = breed_count + 1, updated_at = ? WHERE id = ?')
            .run(ts, ts, cage.pet1_id);
        db.prepare('UPDATE pet SET last_breed_at = ?, breed_count = breed_count + 1, updated_at = ? WHERE id = ?')
            .run(ts, ts, cage.pet2_id);
    });
    txn();

    writeLog(uid, 'breed_success', 'pet', cage.pet1_id, {
        cage_id: cageId, prob, egg_count: eggCount, eggs
    }, ip);

    return {
        code: 0,
        data: { success: true, prob, eggs },
        msg: '繁殖成功'
    };
}

/* ═══════════════════════════════════════════
 * 孵化繁殖蛋时的遗传数据注入
 * ═══════════════════════════════════════════ */

/**
 * 获取蛋的遗传记录（如果是繁殖蛋）
 * @param {number} eggId
 * @returns {object|null} inherit_detail
 */
function getBreedingRecord(eggId) {
    const db = getDB();
    const record = db.prepare(
        'SELECT inherit_detail FROM breeding_record WHERE child_id = ?'
    ).get(eggId);
    if (!record) return null;
    try { return JSON.parse(record.inherit_detail); } catch { return null; }
}

/* ═══════════════════════════════════════════
 * 内部工具函数
 * ═══════════════════════════════════════════ */

function _getFullPetData(petId) {
    const db = getDB();
    const pet = db.prepare('SELECT * FROM pet WHERE id = ?').get(petId);
    if (!pet) return null;

    const attr = db.prepare('SELECT * FROM pet_attr WHERE pet_id = ?').get(petId);
    const skills = db.prepare('SELECT skill_code, skill_level FROM pet_skill WHERE pet_id = ?').all(petId);

    return {
        ...pet,
        attr,
        skills,
        gene_set: pet.gene_set || '',
        appearance_gene: pet.appearance_gene || '',
        hidden_gene: pet.hidden_gene || '',
    };
}

function _calcBreedProb(parent1, parent2, ts) {
    let prob = rules.BREED_BASE_PROB;

    /* 心情加成 */
    if (parent1.mood >= rules.BREED_MOOD_THRESHOLD && parent2.mood >= rules.BREED_MOOD_THRESHOLD) {
        prob += rules.BREED_MOOD_BONUS;
    }

    /* 休息加成 */
    if (parent1.last_rest_at && (ts - parent1.last_rest_at) < rules.BREED_REST_WINDOW) {
        prob += rules.BREED_REST_BONUS / 2;
    }
    if (parent2.last_rest_at && (ts - parent2.last_rest_at) < rules.BREED_REST_WINDOW) {
        prob += rules.BREED_REST_BONUS / 2;
    }

    /* 近期繁殖惩罚 */
    if (parent1.last_breed_at && (ts - parent1.last_breed_at) < rules.BREED_RECENT_WINDOW) {
        prob -= rules.BREED_RECENT_PENALTY / 2;
    }
    if (parent2.last_breed_at && (ts - parent2.last_breed_at) < rules.BREED_RECENT_WINDOW) {
        prob -= rules.BREED_RECENT_PENALTY / 2;
    }

    return Math.max(0.1, Math.min(0.95, prob));
}

module.exports = {
    listPetOnMarket,
    unlistPet,
    browseMarket,
    sendInvite,
    listInvites,
    acceptInvite,
    rejectInvite,
    getCageStatus,
    finishBreeding,
    getBreedingRecord,
};
