/**
 * SQLite 数据库连接与初始化
 * - 使用 better-sqlite3（同步API，适合单进程游戏服务器）
 * - 启动时自动创建 data/ 目录和6张数据表
 * - 开启外键约束 (S-E05)
 * - 表结构严格对齐 docs/02-database.md
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');
const config  = require('./config');

/** @type {import('better-sqlite3').Database} */
let _db = null;

/**
 * 返回当前 Unix 秒级时间戳
 * 所有时间判断使用服务端时间，禁止客户端时间 (S-G05)
 * @returns {number}
 */
function now() {
    return Math.floor(Date.now() / 1000);
}

/**
 * 初始化数据库：创建目录、连接、开启外键、建表
 * @returns {import('better-sqlite3').Database}
 */
function initDB() {
    if (_db) return _db;

    /* 确保 data/ 目录存在 */
    const dbDir = path.dirname(path.resolve(config.DB_PATH));
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    _db = new Database(path.resolve(config.DB_PATH));

    /* 开启外键约束 (S-E05) */
    _db.pragma('foreign_keys = ON');

    /* 开启 WAL 模式，提升并发读性能 */
    _db.pragma('journal_mode = WAL');

    /* 创建全部数据表 */
    _createTables();

    /* 数据库迁移：为已有表增加新字段 */
    _migrate();

    console.log(`[DB] SQLite 已连接: ${config.DB_PATH}`);
    return _db;
}

/**
 * 获取数据库实例（单例）
 * @returns {import('better-sqlite3').Database}
 */
function getDB() {
    if (!_db) throw new Error('[DB] 数据库未初始化，请先调用 initDB()');
    return _db;
}

/**
 * 创建全部数据表和索引
 * 严格对齐 docs/02-database.md 的 DDL
 */
function _createTables() {
    _db.exec(`
        /* ═══════════════════════════════════════════
         * 1. 用户表 (user)
         * ═══════════════════════════════════════════ */
        CREATE TABLE IF NOT EXISTS user (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    NOT NULL UNIQUE,
            password_hash   TEXT    NOT NULL,
            nickname        TEXT    NOT NULL DEFAULT '',
            gold            INTEGER NOT NULL DEFAULT 0,
            diamond         INTEGER NOT NULL DEFAULT 0,
            egg_claimed     INTEGER NOT NULL DEFAULT 0,
            last_login_at   INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON user(username);

        /* ═══════════════════════════════════════════
         * 2. 宠物蛋表 (pet_egg)
         * ═══════════════════════════════════════════ */
        CREATE TABLE IF NOT EXISTS pet_egg (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL,
            quality         INTEGER NOT NULL DEFAULT 1,
            pattern_seed    TEXT    NOT NULL DEFAULT '',
            is_hatched      INTEGER NOT NULL DEFAULT 0,
            hatch_start_at  INTEGER NOT NULL DEFAULT 0,
            hatch_duration  INTEGER NOT NULL DEFAULT 0,
            talent_points   INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES user(id)
        );
        CREATE INDEX IF NOT EXISTS idx_egg_user    ON pet_egg(user_id);
        CREATE INDEX IF NOT EXISTS idx_egg_hatched ON pet_egg(is_hatched);

        /* ═══════════════════════════════════════════
         * 3. 宠物主表 (pet)
         * ═══════════════════════════════════════════ */
        CREATE TABLE IF NOT EXISTS pet (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL,
            egg_id          INTEGER NOT NULL,
            name            TEXT    NOT NULL DEFAULT '',
            quality         INTEGER NOT NULL DEFAULT 1,
            gender          INTEGER NOT NULL DEFAULT 1,
            level           INTEGER NOT NULL DEFAULT 1,
            exp             INTEGER NOT NULL DEFAULT 0,
            stage           INTEGER NOT NULL DEFAULT 0,
            stamina         INTEGER NOT NULL DEFAULT 100,
            stamina_max     INTEGER NOT NULL DEFAULT 100,
            satiety         INTEGER NOT NULL DEFAULT 100,
            satiety_max     INTEGER NOT NULL DEFAULT 100,
            mood            INTEGER NOT NULL DEFAULT 50,
            is_active       INTEGER NOT NULL DEFAULT 1,
            body_seed       TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES user(id),
            FOREIGN KEY (egg_id)  REFERENCES pet_egg(id)
        );
        CREATE INDEX IF NOT EXISTS idx_pet_user   ON pet(user_id);
        CREATE INDEX IF NOT EXISTS idx_pet_active ON pet(user_id, is_active);

        /* ═══════════════════════════════════════════
         * 4. 宠物属性表 (pet_attr)
         * ═══════════════════════════════════════════ */
        CREATE TABLE IF NOT EXISTS pet_attr (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id          INTEGER NOT NULL UNIQUE,
            str_base        INTEGER NOT NULL DEFAULT 0,
            str_talent      INTEGER NOT NULL DEFAULT 0,
            agi_base        INTEGER NOT NULL DEFAULT 0,
            agi_talent      INTEGER NOT NULL DEFAULT 0,
            vit_base        INTEGER NOT NULL DEFAULT 0,
            vit_talent      INTEGER NOT NULL DEFAULT 0,
            int_base        INTEGER NOT NULL DEFAULT 0,
            int_talent      INTEGER NOT NULL DEFAULT 0,
            per_base        INTEGER NOT NULL DEFAULT 0,
            per_talent      INTEGER NOT NULL DEFAULT 0,
            cha_base        INTEGER NOT NULL DEFAULT 0,
            cha_talent      INTEGER NOT NULL DEFAULT 0,
            hp_max          INTEGER NOT NULL DEFAULT 0,
            atk             INTEGER NOT NULL DEFAULT 0,
            def             INTEGER NOT NULL DEFAULT 0,
            spd             INTEGER NOT NULL DEFAULT 0,
            crit_rate       INTEGER NOT NULL DEFAULT 0,
            dodge_rate      INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (pet_id) REFERENCES pet(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_attr_pet ON pet_attr(pet_id);

        /* ═══════════════════════════════════════════
         * 5. 宠物技能表 (pet_skill)
         * ═══════════════════════════════════════════ */
        CREATE TABLE IF NOT EXISTS pet_skill (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id          INTEGER NOT NULL,
            skill_code      TEXT    NOT NULL,
            skill_level     INTEGER NOT NULL DEFAULT 1,
            cooldown        INTEGER NOT NULL DEFAULT 0,
            is_equipped     INTEGER NOT NULL DEFAULT 0,
            slot_index      INTEGER NOT NULL DEFAULT -1,
            unlocked_at     INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (pet_id) REFERENCES pet(id)
        );
        CREATE INDEX  IF NOT EXISTS idx_skill_pet    ON pet_skill(pet_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_unique ON pet_skill(pet_id, skill_code);

        /* ═══════════════════════════════════════════
         * 6. 玩家日志表 (log)
         * ═══════════════════════════════════════════ */
        CREATE TABLE IF NOT EXISTS log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL,
            action          TEXT    NOT NULL,
            target_type     TEXT    NOT NULL DEFAULT '',
            target_id       INTEGER NOT NULL DEFAULT 0,
            detail          TEXT    NOT NULL DEFAULT '',
            ip              TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES user(id)
        );
        CREATE INDEX IF NOT EXISTS idx_log_user   ON log(user_id);
        CREATE INDEX IF NOT EXISTS idx_log_action ON log(action);
        CREATE INDEX IF NOT EXISTS idx_log_time   ON log(created_at);
    `);

    console.log('[DB] 6张数据表初始化完成');
}

/**
 * 数据库迁移：为已有表增加新字段
 * 使用 PRAGMA table_info 检测字段是否存在，不存在则 ALTER TABLE 添加
 */
function _migrate() {
    const cols = _db.pragma('table_info(pet)');

    /* pet 表增加 gender 字段 */
    const hasGender = cols.some(c => c.name === 'gender');
    if (!hasGender) {
        _db.exec('ALTER TABLE pet ADD COLUMN gender INTEGER NOT NULL DEFAULT 1');
        console.log('[DB] 迁移: pet 表新增 gender 字段');
    }

    /* P5: pet 表增加 last_feed_at（上次喂食时间） */
    const hasLastFeed = cols.some(c => c.name === 'last_feed_at');
    if (!hasLastFeed) {
        _db.exec('ALTER TABLE pet ADD COLUMN last_feed_at INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 last_feed_at 字段');
    }

    /* P5: pet 表增加 last_rest_at（上次休息时间） */
    const hasLastRest = cols.some(c => c.name === 'last_rest_at');
    if (!hasLastRest) {
        _db.exec('ALTER TABLE pet ADD COLUMN last_rest_at INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 last_rest_at 字段');
    }

    /* P8: pet 表增加遗传繁殖相关字段 */
    const hasGeneSet = cols.some(c => c.name === 'gene_set');
    if (!hasGeneSet) {
        _db.exec("ALTER TABLE pet ADD COLUMN gene_set TEXT NOT NULL DEFAULT ''");
        console.log('[DB] 迁移: pet 表新增 gene_set 字段');
    }
    const hasAppearanceGene = cols.some(c => c.name === 'appearance_gene');
    if (!hasAppearanceGene) {
        _db.exec("ALTER TABLE pet ADD COLUMN appearance_gene TEXT NOT NULL DEFAULT ''");
        console.log('[DB] 迁移: pet 表新增 appearance_gene 字段');
    }
    const hasParent1 = cols.some(c => c.name === 'parent1_id');
    if (!hasParent1) {
        _db.exec('ALTER TABLE pet ADD COLUMN parent1_id INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 parent1_id 字段');
    }
    const hasParent2 = cols.some(c => c.name === 'parent2_id');
    if (!hasParent2) {
        _db.exec('ALTER TABLE pet ADD COLUMN parent2_id INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 parent2_id 字段');
    }
    const hasGeneration = cols.some(c => c.name === 'generation');
    if (!hasGeneration) {
        _db.exec('ALTER TABLE pet ADD COLUMN generation INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 generation 字段');
    }
    const hasBreedCount = cols.some(c => c.name === 'breed_count');
    if (!hasBreedCount) {
        _db.exec('ALTER TABLE pet ADD COLUMN breed_count INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 breed_count 字段');
    }
    const hasLastBreedAt = cols.some(c => c.name === 'last_breed_at');
    if (!hasLastBreedAt) {
        _db.exec('ALTER TABLE pet ADD COLUMN last_breed_at INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: pet 表新增 last_breed_at 字段');
    }

    /* P8: pet 表增加隐藏基因字段 */
    const hasHiddenGene = cols.some(c => c.name === 'hidden_gene');
    if (!hasHiddenGene) {
        _db.exec("ALTER TABLE pet ADD COLUMN hidden_gene TEXT NOT NULL DEFAULT ''");
        console.log('[DB] 迁移: pet 表新增 hidden_gene 字段');
    }

    /* P9: pet 表增加竞技场状态字段 */
    const hasArenaStatus = cols.some(c => c.name === 'arena_status');
    if (!hasArenaStatus) {
        _db.exec("ALTER TABLE pet ADD COLUMN arena_status TEXT NOT NULL DEFAULT 'none'");
        console.log('[DB] 迁移: pet 表新增 arena_status 字段');
    }

    /* P8: 繁殖记录表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS breeding_record (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            parent1_id      INTEGER NOT NULL,
            parent2_id      INTEGER NOT NULL,
            child_id        INTEGER NOT NULL,
            user1_id        INTEGER NOT NULL,
            user2_id        INTEGER NOT NULL,
            inherit_detail  TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (parent1_id) REFERENCES pet(id),
            FOREIGN KEY (parent2_id) REFERENCES pet(id),
            FOREIGN KEY (child_id)   REFERENCES pet(id)
        );
        CREATE INDEX IF NOT EXISTS idx_breed_parent1 ON breeding_record(parent1_id);
        CREATE INDEX IF NOT EXISTS idx_breed_parent2 ON breeding_record(parent2_id);
        CREATE INDEX IF NOT EXISTS idx_breed_child   ON breeding_record(child_id);
    `);

    /* P8: 繁殖邀请表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS breeding_invite (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            from_uid        INTEGER NOT NULL,
            to_uid          INTEGER NOT NULL,
            pet1_id         INTEGER NOT NULL,
            pet2_id         INTEGER NOT NULL,
            status          TEXT    NOT NULL DEFAULT 'pending',
            egg_protocol    TEXT    NOT NULL DEFAULT 'single',
            expire_at       INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (from_uid) REFERENCES user(id),
            FOREIGN KEY (to_uid)   REFERENCES user(id)
        );
        CREATE INDEX IF NOT EXISTS idx_invite_to ON breeding_invite(to_uid, status);
    `);

    /* P8: 交友市场注册表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS dating_market (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id          INTEGER NOT NULL,
            user_id         INTEGER NOT NULL,
            status          TEXT    NOT NULL DEFAULT 'listed',
            listed_at       INTEGER NOT NULL DEFAULT 0,
            unlisted_at     INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (pet_id)  REFERENCES pet(id),
            FOREIGN KEY (user_id) REFERENCES user(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_dating_pet  ON dating_market(pet_id);
        CREATE INDEX IF NOT EXISTS idx_dating_user ON dating_market(user_id);
        CREATE INDEX IF NOT EXISTS idx_dating_status ON dating_market(status);
    `);

    /* P8: 交配笼表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS breeding_cage (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invite_id       INTEGER NOT NULL,
            pet1_id         INTEGER NOT NULL,
            pet2_id         INTEGER NOT NULL,
            user1_id        INTEGER NOT NULL,
            user2_id        INTEGER NOT NULL,
            started_at      INTEGER NOT NULL DEFAULT 0,
            finish_at       INTEGER NOT NULL DEFAULT 0,
            status          TEXT    NOT NULL DEFAULT 'mating',
            result          TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (invite_id) REFERENCES breeding_invite(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cage_status ON breeding_cage(status);
    `);

    /* P8: 全局统计表（传说上限等） */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS global_stats (
            key             TEXT    PRIMARY KEY,
            value           TEXT    NOT NULL DEFAULT '0',
            updated_at      INTEGER NOT NULL DEFAULT 0
        );
    `);

    /* P8: 隐藏基因解锁记录表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS hidden_gene_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            gene_type       TEXT    NOT NULL,
            pet_id          INTEGER NOT NULL,
            parent1_id      INTEGER NOT NULL,
            parent2_id      INTEGER NOT NULL,
            unlocked_at     INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (pet_id) REFERENCES pet(id)
        );
        CREATE INDEX IF NOT EXISTS idx_hglog_type ON hidden_gene_log(gene_type);
    `);

    /* P8: 技能池表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS skill_pool (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_code      TEXT    NOT NULL UNIQUE,
            skill_name      TEXT    NOT NULL DEFAULT '',
            quality_min     INTEGER NOT NULL DEFAULT 1,
            description     TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0
        );
    `);

    /* P9: 竞技场宠物表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS arena_pet (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id          INTEGER NOT NULL,
            user_id         INTEGER NOT NULL,
            fight_power     INTEGER NOT NULL DEFAULT 0,
            entered_at      INTEGER NOT NULL DEFAULT 0,
            status          TEXT    NOT NULL DEFAULT 'active',
            recovery_until  INTEGER NOT NULL DEFAULT 0,
            consecutive_losses INTEGER NOT NULL DEFAULT 0,
            arena_gold      INTEGER NOT NULL DEFAULT 0,
            daily_challenges INTEGER NOT NULL DEFAULT 0,
            daily_reset_date TEXT   NOT NULL DEFAULT '',
            FOREIGN KEY (pet_id)  REFERENCES pet(id),
            FOREIGN KEY (user_id) REFERENCES user(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_pet ON arena_pet(pet_id);
        CREATE INDEX IF NOT EXISTS idx_arena_user ON arena_pet(user_id);
    `);

    /* P9: 战斗挑战表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS battle_challenge (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            attacker_pet_id INTEGER NOT NULL,
            defender_pet_id INTEGER NOT NULL,
            attacker_uid    INTEGER NOT NULL,
            defender_uid    INTEGER NOT NULL,
            map_id          TEXT    NOT NULL DEFAULT '',
            bet_amount      INTEGER NOT NULL DEFAULT 0,
            status          TEXT    NOT NULL DEFAULT 'pending',
            result          TEXT    NOT NULL DEFAULT '',
            reward_detail   TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0,
            finished_at     INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (attacker_pet_id) REFERENCES pet(id),
            FOREIGN KEY (defender_pet_id) REFERENCES pet(id)
        );
        CREATE INDEX IF NOT EXISTS idx_challenge_attacker ON battle_challenge(attacker_uid, created_at);
        CREATE INDEX IF NOT EXISTS idx_challenge_status   ON battle_challenge(status);
    `);

    /* P9: 战斗记录表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS battle_record (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id    INTEGER NOT NULL,
            frames          TEXT    NOT NULL DEFAULT '',
            summary         TEXT    NOT NULL DEFAULT '',
            expire_at       INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (challenge_id) REFERENCES battle_challenge(id)
        );
        CREATE INDEX IF NOT EXISTS idx_record_challenge ON battle_record(challenge_id);
        CREATE INDEX IF NOT EXISTS idx_record_expire    ON battle_record(expire_at);
    `);

    /* P9: 管理员测试战斗表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS battle_test (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_uid       INTEGER NOT NULL,
            pet1_id         INTEGER NOT NULL,
            pet2_id         INTEGER NOT NULL,
            result          TEXT    NOT NULL DEFAULT '',
            frames          TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0
        );
    `);

    /* P7: 跑道表 */
    _db.exec(`
        CREATE TABLE IF NOT EXISTS treadmill (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id          INTEGER NOT NULL,
            user_id         INTEGER NOT NULL,
            tier            INTEGER NOT NULL DEFAULT 1,
            is_running      INTEGER NOT NULL DEFAULT 0,
            started_at      INTEGER NOT NULL DEFAULT 0,
            collected_today INTEGER NOT NULL DEFAULT 0,
            last_collect_at INTEGER NOT NULL DEFAULT 0,
            last_reset_date TEXT    NOT NULL DEFAULT '',
            created_at      INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (pet_id)  REFERENCES pet(id),
            FOREIGN KEY (user_id) REFERENCES user(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_treadmill_pet  ON treadmill(pet_id);
        CREATE INDEX IF NOT EXISTS idx_treadmill_user ON treadmill(user_id);
    `);

    /* SEC-04: user 表增加 token_version 字段（Token吊销支持） */
    const userCols = _db.pragma('table_info(user)');
    const hasTokenVersion = userCols.some(c => c.name === 'token_version');
    if (!hasTokenVersion) {
        _db.exec('ALTER TABLE user ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1');
        console.log('[DB] 迁移: user 表新增 token_version 字段');
    }

    console.log('[DB] P8/P9 数据表迁移完成');

    /* P9: arena_pet 表增加新字段（兼容旧表） */
    const arenaCols = _db.pragma('table_info(arena_pet)');
    const hasArenaGold = arenaCols.some(c => c.name === 'arena_gold');
    if (!hasArenaGold) {
        _db.exec('ALTER TABLE arena_pet ADD COLUMN arena_gold INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: arena_pet 表新增 arena_gold 字段');
    }
    const hasDailyChallenges = arenaCols.some(c => c.name === 'daily_challenges');
    if (!hasDailyChallenges) {
        _db.exec('ALTER TABLE arena_pet ADD COLUMN daily_challenges INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: arena_pet 表新增 daily_challenges 字段');
    }
    const hasDailyResetDate = arenaCols.some(c => c.name === 'daily_reset_date');
    if (!hasDailyResetDate) {
        _db.exec("ALTER TABLE arena_pet ADD COLUMN daily_reset_date TEXT NOT NULL DEFAULT ''");
        console.log('[DB] 迁移: arena_pet 表新增 daily_reset_date 字段');
    }

    /* P9: battle_challenge 表增加新字段（兼容旧表） */
    const challengeCols = _db.pragma('table_info(battle_challenge)');
    const hasBetAmount = challengeCols.some(c => c.name === 'bet_amount');
    if (!hasBetAmount) {
        _db.exec('ALTER TABLE battle_challenge ADD COLUMN bet_amount INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] 迁移: battle_challenge 表新增 bet_amount 字段');
    }
    const hasRewardDetail = challengeCols.some(c => c.name === 'reward_detail');
    if (!hasRewardDetail) {
        _db.exec("ALTER TABLE battle_challenge ADD COLUMN reward_detail TEXT NOT NULL DEFAULT ''");
        console.log('[DB] 迁移: battle_challenge 表新增 reward_detail 字段');
    }

    console.log('[DB] P9 竞技场表迁移完成');
}

/**
 * 向 log 表写入一条操作日志 (S-E04)
 * @param {number} userId  用户ID
 * @param {string} action  操作类型
 * @param {string} targetType 目标类型
 * @param {number} targetId   目标ID
 * @param {object} detail  详情对象（将序列化为JSON）
 * @param {string} ip      请求IP
 */
function writeLog(userId, action, targetType, targetId, detail, ip) {
    const db = getDB();
    db.prepare(`
        INSERT INTO log (user_id, action, target_type, target_id, detail, ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, action, targetType, targetId, JSON.stringify(detail), ip, now());
}

module.exports = { initDB, getDB, now, writeLog };
