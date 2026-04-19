/**
 * 服务端安全随机数
 * 所有游戏逻辑随机数必须使用本模块，禁止 Math.random() (S-A03)
 */

'use strict';

const crypto = require('crypto');

/**
 * 生成 [min, max] 闭区间的安全随机整数
 * @param {number} min 最小值（含）
 * @param {number} max 最大值（含）
 * @returns {number}
 */
function secureRandom(min, max) {
    const range = max - min + 1;
    const bytes = crypto.randomBytes(4);
    const value = bytes.readUInt32BE(0);
    return min + (value % range);
}

/**
 * 生成 [0, 1) 的安全随机浮点数
 * @returns {number}
 */
function secureRandomFloat() {
    const bytes = crypto.randomBytes(4);
    return bytes.readUInt32BE(0) / 0x100000000;
}

module.exports = { secureRandom, secureRandomFloat };
