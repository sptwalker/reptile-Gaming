/**
 * 密码哈希与 Token 管理
 * - 密码使用 bcrypt 哈希，cost factor ≥ 10 (S-B03)
 * - JWT Payload 仅含 uid/iat/exp，不含敏感信息 (S-B04)
 * - 禁止明文存储、日志输出、接口返回密码 (S-B03)
 */

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const config = require('../config');

/**
 * 对明文密码进行 bcrypt 哈希
 * @param {string} plain 明文密码
 * @returns {string} 哈希值
 */
function hashPassword(plain) {
    return bcrypt.hashSync(plain, config.BCRYPT_ROUNDS);
}

/**
 * 验证明文密码与哈希值是否匹配
 * @param {string} plain 明文密码
 * @param {string} hash  哈希值
 * @returns {boolean}
 */
function verifyPassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
}

/**
 * 签发 JWT Token
 * @param {number} uid 用户ID
 * @param {number} [tv=1] token版本号（用于吊销支持）
 * @returns {string} JWT字符串
 */
function signToken(uid, tv = 1) {
    return jwt.sign({ uid, tv }, config.JWT_SECRET, {
        expiresIn: config.JWT_EXPIRES_IN
    });
}

/**
 * 验证 JWT Token
 * @param {string} token JWT字符串
 * @returns {{ uid: number, tv: number } | null} 解码后的payload，失败返回null
 */
function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        return { uid: decoded.uid, tv: decoded.tv || 1 };
    } catch (_err) {
        return null;
    }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
