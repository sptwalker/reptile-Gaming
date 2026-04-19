/**
 * 登录/注册 UI 逻辑
 * 纯交互层 → 调用 Api.post → 根据响应切换页面状态
 */

'use strict';

(() => {
    /* ── DOM 引用 ── */
    const authPanel    = document.getElementById('authPanel');
    const mainPanel    = document.getElementById('mainPanel');
    const loginForm    = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authMsg      = document.getElementById('authMsg');
    const toRegister   = document.getElementById('toRegister');
    const toLogin      = document.getElementById('toLogin');
    const btnLogout    = document.getElementById('btnLogout');
    const userNickname = document.getElementById('userNickname');
    const userGold     = document.getElementById('userGold');

    /* ── 消息提示 ── */
    function showMsg(text, type = 'error') {
        authMsg.textContent = text;
        authMsg.className = `msg ${type}`;
    }
    function hideMsg() {
        authMsg.className = 'msg';
    }

    /* ── 表单切换 ── */
    toRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        hideMsg();
    });
    toLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        hideMsg();
    });

    /* ── 注册 ── */
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMsg();

        const username = document.getElementById('regUser').value.trim();
        const password = document.getElementById('regPass').value;
        const nickname = document.getElementById('regNick').value.trim() || undefined;

        const res = await Api.post('/api/user/register', { username, password, nickname });
        if (res.code !== 0) {
            return showMsg(res.msg, 'error');
        }

        showMsg('注册成功，请登录', 'success');
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        document.getElementById('loginUser').value = username;
    });

    /* ── 登录 ── */
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMsg();

        const username = document.getElementById('loginUser').value.trim();
        const password = document.getElementById('loginPass').value;

        const res = await Api.post('/api/user/login', { username, password });
        if (res.code !== 0) {
            return showMsg(res.msg, 'error');
        }

        Api.setToken(res.data.token);
        enterMain(res.data.user);
    });

    /* ── 进入主界面 ── */
    function enterMain(user) {
        authPanel.style.display = 'none';
        mainPanel.style.display = 'block';
        userNickname.textContent = user.nickname || user.username;
        userGold.textContent = `💰 ${user.gold}`;

        /* 初始化宠物蛋模块 */
        if (typeof Egg !== 'undefined') {
            Egg.init(user);
        }
    }

    /* ── 退出 ── */
    btnLogout.addEventListener('click', () => {
        Api.clearToken();
        mainPanel.style.display = 'none';
        authPanel.style.display = 'block';
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        hideMsg();
    });

    /* ── Token 过期回调 ── */
    Api.onAuthExpired = () => {
        mainPanel.style.display = 'none';
        authPanel.style.display = 'block';
        showMsg('登录已过期，请重新登录', 'error');
    };

    /* ── 页面加载：检查已有 Token ── */
    async function checkAuth() {
        if (!Api.isLoggedIn()) return;

        const res = await Api.post('/api/user/info');
        if (res.code === 0) {
            enterMain(res.data);
        } else {
            Api.clearToken();
        }
    }

    checkAuth();
})();
