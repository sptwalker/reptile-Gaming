/**
 * 用户业务逻辑
 * - 每次操作从数据库读取最新状态校验 (S-A04)
 * - 所有关键操作写入 log 表 (S-E04)
 * - 金币变动记录审计日志 (S-G04)
 * - 使用服务端时间 (S-G05)
 */

'use strict';

const { getDB, now, writeLog } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../utils/crypto');
const { sanitize } = require('../utils/validator');
const { DAILY_LOGIN_GOLD } = require('../models/game-rules');
const config = require('../config');

/**
 * 用户注册
 * @param {object} params { username, password, nickname }
 * @param {string} ip 请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function register({ username, password, nickname }, ip) {
    const db = getDB();
    const ts = now();

    const cleanUsername = sanitize(username, 16);
    const cleanNickname = nickname ? sanitize(nickname, 16) : cleanUsername;

    /* 查重 (S-E02: 幂等性) */
    const existing = db.prepare('SELECT id FROM user WHERE username = ?').get(cleanUsername);
    if (existing) {
        return { code: 2001, data: null, msg: '用户已存在' };
    }

    /* bcrypt 哈希 (S-B03) */
    const hash = hashPassword(password);

    /* 插入用户 */
    const result = db.prepare(`
        INSERT INTO user (username, password_hash, nickname, gold, diamond, egg_claimed, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)
    `).run(cleanUsername, hash, cleanNickname, ts, ts);

    const userId = result.lastInsertRowid;

    /* 写注册日志 (S-E04) */
    writeLog(userId, 'register', 'user', userId, {}, ip);

    return {
        code: 0,
        data: { user_id: userId, username: cleanUsername, nickname: cleanNickname },
        msg: 'success'
    };
}

/**
 * 用户登录
 * @param {object} params { username, password }
 * @param {string} ip 请求IP
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function login({ username, password }, ip) {
    const db = getDB();
    const ts = now();

    const cleanUsername = sanitize(username, 16);

    /* 查询用户 */
    const user = db.prepare('SELECT * FROM user WHERE username = ?').get(cleanUsername);
    if (!user) {
        return { code: 2002, data: null, msg: '用户名或密码错误' };
    }

    /* 验证密码 (S-B03) */
    if (!verifyPassword(password, user.password_hash)) {
        return { code: 2002, data: null, msg: '用户名或密码错误' };
    }

    /* 签发 Token (S-B04 + SEC-04: 含 token_version) */
    const token = signToken(user.id, user.token_version || 1);

    /* 每日首次登录发放金币 (game-rules: DAILY_LOGIN_GOLD) */
    let goldDelta = 0;
    const todayStart = _getTodayStart();
    if (user.last_login_at < todayStart) {
        goldDelta = DAILY_LOGIN_GOLD;
        db.prepare('UPDATE user SET gold = gold + ?, last_login_at = ?, updated_at = ? WHERE id = ?')
            .run(goldDelta, ts, ts, user.id);

        /* 金币变动审计日志 (S-G04) */
        writeLog(user.id, 'gold_change', 'user', user.id, {
            delta: goldDelta, reason: 'daily_login', balance: user.gold + goldDelta
        }, ip);
    } else {
        db.prepare('UPDATE user SET last_login_at = ?, updated_at = ? WHERE id = ?')
            .run(ts, ts, user.id);
    }

    /* 登录日志 (S-E04) */
    writeLog(user.id, 'login', 'user', user.id, { ip }, ip);

    return {
        code: 0,
        data: {
            token,
            expires_in: config.JWT_EXPIRES_IN,
            user: {
                id:          user.id,
                username:    user.username,
                nickname:    user.nickname,
                gold:        user.gold + goldDelta,
                diamond:     user.diamond,
                egg_claimed: user.egg_claimed
            }
        },
        msg: 'success'
    };
}

/**
 * 获取用户信息
 * @param {number} uid 用户ID
 * @returns {{ code: number, data: object|null, msg: string }}
 */
function getUserInfo(uid) {
    const db = getDB();
    const user = db.prepare(
        'SELECT id, username, nickname, gold, diamond, egg_claimed, last_login_at, created_at FROM user WHERE id = ?'
    ).get(uid);

    if (!user) {
        return { code: 1002, data: null, msg: '用户不存在' };
    }

    return { code: 0, data: user, msg: 'success' };
}

/**
 * 获取今日 0 点的 Unix 时间戳 (UTC+8)
 * 使用显式 UTC+8 偏移，不依赖系统时区设置
 * @returns {number}
 */
function _getTodayStart() {
    const nowMs = Date.now();
    /* UTC 毫秒 + 8h 偏移 = UTC+8 的"本地"毫秒 */
    const utc8Ms = nowMs + 8 * 3600_000;
    /* 取 UTC+8 的当天零点（对齐到天） */
    const dayMs = utc8Ms - (utc8Ms % 86400_000);
    /* 转回 UTC 毫秒再转秒 */
    return Math.floor((dayMs - 8 * 3600_000) / 1000);
}

module.exports = { register, login, getUserInfo };
