/**
 * 统一响应格式封装
 * 所有接口返回 { code, data, msg } 结构 (01-project-spec §4.1)
 */

'use strict';

/**
 * 成功响应
 * @param {object} res Express response
 * @param {*} data 返回数据
 * @param {string} [msg='success'] 消息
 */
function ok(res, data, msg = 'success') {
    res.json({ code: 0, data, msg });
}

/**
 * 失败响应
 * @param {object} res Express response
 * @param {number} code 错误码
 * @param {string} msg  错误消息
 * @param {*} [data=null] 附加数据
 */
function fail(res, code, msg, data = null) {
    res.json({ code, data, msg });
}

module.exports = { ok, fail };
