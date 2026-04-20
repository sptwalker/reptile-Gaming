/**
 * 请求参数校验工具
 * 所有接口入参必须经过校验后才能进入业务逻辑 (S-C01~S-C04)
 */

'use strict';

/**
 * 去除首尾空白 + 过滤HTML标签 + 截断长度 (S-C02)
 * @param {*} str 输入值
 * @param {number} maxLen 最大长度
 * @returns {string}
 */
function sanitize(str, maxLen) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/<[^>]*>/g, '').slice(0, maxLen);
}

/**
 * 校验整数是否在合理范围内，拒绝 NaN/Infinity/负数/超大数 (S-C03)
 * @param {*} val 待校验值
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {boolean}
 */
function isValidInt(val, min, max) {
    return Number.isInteger(val) && val >= min && val <= max;
}

/**
 * 校验字符串长度是否在范围内
 * @param {*} val 待校验值
 * @param {number} minLen 最小长度
 * @param {number} maxLen 最大长度
 * @returns {boolean}
 */
function isValidString(val, minLen, maxLen) {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return trimmed.length >= minLen && trimmed.length <= maxLen;
}

/**
 * 校验注册参数
 * @param {object} body 请求体
 * @returns {string[]} 错误列表，空数组表示通过
 */
function validateRegister(body) {
    const errors = [];
    if (!body || typeof body !== 'object') {
        errors.push('请求体格式错误');
        return errors;
    }

    /* 用户名：3~16字符，字母数字下划线 */
    if (!isValidString(body.username, 3, 16)) {
        errors.push('用户名长度须为3~16字符');
    } else if (!/^[a-zA-Z0-9_]+$/.test(body.username.trim())) {
        errors.push('用户名仅允许字母、数字、下划线');
    }

    /* 密码：6~32字符 */
    if (!isValidString(body.password, 6, 32)) {
        errors.push('密码长度须为6~32字符');
    }

    /* 昵称：可选，最长16字符 */
    if (body.nickname !== undefined && body.nickname !== null) {
        if (typeof body.nickname !== 'string' || body.nickname.trim().length > 16) {
            errors.push('昵称最长16字符');
        }
    }

    return errors;
}

/**
 * 校验登录参数
 * @param {object} body 请求体
 * @returns {string[]} 错误列表
 */
function validateLogin(body) {
    const errors = [];
    if (!body || typeof body !== 'object') {
        errors.push('请求体格式错误');
        return errors;
    }
    if (!isValidString(body.username, 1, 16)) {
        errors.push('用户名不能为空');
    }
    if (!isValidString(body.password, 1, 32)) {
        errors.push('密码不能为空');
    }
    return errors;
}

/**
 * 要求参数为合法整数，否则抛出错误（供 P8/P9 路由使用）
 * @param {*} val 待校验值
 * @param {string} name 参数名（用于错误提示）
 * @param {number} [min=1] 最小值
 * @param {number} [max=Number.MAX_SAFE_INTEGER] 最大值
 * @returns {number} 校验通过后的整数值
 * @throws {{ code: number, msg: string }} 校验失败时抛出
 */
function requireInt(val, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
    const n = Number(val);
    if (!Number.isInteger(n) || n < min || n > max) {
        const err = new Error(`${name} 参数错误`);
        err.code = 1001;
        throw err;
    }
    return n;
}

module.exports = {
    sanitize,
    isValidInt,
    isValidString,
    requireInt,
    validateRegister,
    validateLogin
};
