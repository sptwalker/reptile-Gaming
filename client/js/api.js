/**
 * 统一 HTTP 请求封装
 * - 自动附带 Authorization + X-Request-Seq (S-G02)
 * - 仅发送操作意图，不发送计算结果 (S-A02)
 * - 失败自动重试（递增延迟）
 * - Token 过期自动清除并跳转登录
 */

'use strict';

const Api = (() => {
    let _token = localStorage.getItem('rg_token') || '';
    let _seq = 0;

    /** 存储 Token */
    function setToken(token) {
        _token = token;
        localStorage.setItem('rg_token', token);
    }

    /** 获取当前 Token */
    function getToken() {
        return _token;
    }

    /** 清除 Token */
    function clearToken() {
        _token = '';
        localStorage.removeItem('rg_token');
    }

    /** 是否已登录 */
    function isLoggedIn() {
        return _token.length > 0;
    }

    /**
     * 发送 POST 请求
     * @param {string} url 接口路径（如 /api/user/login）
     * @param {object} data 请求体
     * @param {number} retries 重试次数
     * @returns {Promise<{code:number, data:*, msg:string}>}
     */
    async function post(url, data = {}, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': _token ? `Bearer ${_token}` : '',
                        'X-Request-Seq': String(++_seq)
                    },
                    body: JSON.stringify(data)
                });
                const json = await resp.json();

                /* Token 过期：自动清除并触发回调 */
                if (json.code === 1002) {
                    clearToken();
                    if (typeof Api.onAuthExpired === 'function') {
                        Api.onAuthExpired();
                    }
                }

                return json;
            } catch (err) {
                if (i === retries) {
                    return { code: 9999, data: null, msg: '网络请求失败' };
                }
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }
    }

    return { setToken, getToken, clearToken, isLoggedIn, post, onAuthExpired: null };
})();
