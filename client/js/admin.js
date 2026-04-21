'use strict';

/* ═══════════════════════════════════════════
 * 管理后台前端逻辑
 * ═══════════════════════════════════════════ */

const Admin = (() => {
    let _key = localStorage.getItem('rg_admin_key') || '';
    const API = '/api/admin';

    /* ── 通用请求 ── */
    async function _fetch(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': _key }
        };
        if (body) opts.body = JSON.stringify(body);
        try {
            const r = await fetch(API + path, opts);
            return await r.json();
        } catch (e) {
            return { code: 9999, data: null, msg: e.message };
        }
    }
    const GET  = (p) => _fetch('GET', p);
    const POST = (p, b) => _fetch('POST', p, b);

    /* ── Toast ── */
    function toast(msg, ok) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.className = 'toast show ' + (ok ? 'ok' : 'err');
        setTimeout(() => el.className = 'toast', 2500);
    }

    /* ── 登录 ── */
    function initLogin() {
        const form = document.getElementById('loginForm');
        const errEl = document.getElementById('loginErr');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const key = document.getElementById('adminKey').value.trim();
            if (!key) { errEl.textContent = '请输入管理员密钥'; return; }
            _key = key;
            localStorage.setItem('rg_admin_key', key);
            const r = await GET('/stats');
            if (r.code !== 0) {
                errEl.textContent = '密钥无效';
                _key = '';
                localStorage.removeItem('rg_admin_key');
                return;
            }
            showApp();
        };
    }

    function showApp() {
        document.getElementById('loginPanel').style.display = 'none';
        document.getElementById('appPanel').style.display = 'block';
        navigate('dashboard');
    }

    function logout() {
        _key = '';
        localStorage.removeItem('rg_admin_key');
        document.getElementById('appPanel').style.display = 'none';
        document.getElementById('loginPanel').style.display = 'flex';
    }

    /* ── 导航 ── */
    function navigate(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const el = document.getElementById('page-' + page);
        if (el) el.classList.add('active');
        const nav = document.querySelector(`[data-page="${page}"]`);
        if (nav) nav.classList.add('active');
        if (page === 'dashboard') loadDashboard();
        if (page === 'rules') loadRules();
    }

    /* ── 仪表盘 ── */
    async function loadDashboard() {
        const [stats, eco, dist, breed] = await Promise.all([
            GET('/stats'), GET('/stats/economy'), GET('/stats/distributions'), GET('/stats/breeding')
        ]);
        if (stats.code !== 0) { toast(stats.msg, false); return; }
        const s = stats.data, e = eco.data, d = dist.data, b = breed.data;
        document.getElementById('dashCards').innerHTML = [
            card('注册用户', s.totalUsers, ''),
            card('宠物总数', s.totalPets, 'green'),
            card('今日活跃', s.activeDay, 'orange'),
            card('本周活跃', s.activeWeek, ''),
            card('今日新增', s.newUsersDay, 'purple'),
            card('本周新增', s.newUsersWeek, ''),
            card('战斗总场次', s.totalBattles, ''),
            card('今日战斗', s.battlesDay, 'orange'),
            card('竞技场宠物', s.arenaPets, 'green'),
            card('金币总存量', e.totalGold, 'orange'),
            card('平均金币', e.avgGold, ''),
            card('今日跑道产出', e.treadmillGoldToday, 'green'),
            card('交友市场挂牌', b.marketListings, 'purple'),
            card('交配笼进行中', b.activeCages, 'orange'),
            card('今日产卵', b.offspringDay, 'green'),
            card('累计后代', b.totalOffspring, ''),
        ].join('');

        /* 分布表 */
        let distHtml = '<h4>品质分布</h4><div class="tbl-wrap"><table><tr><th>品质</th><th>数量</th></tr>';
        const qNames = {1:'普通',2:'优秀',3:'稀有',4:'史诗',5:'传说'};
        for (const r of d.qualityDist) distHtml += `<tr><td>${qNames[r.quality]||r.quality}</td><td>${r.count}</td></tr>`;
        distHtml += '</table></div>';
        distHtml += '<h4>阶段分布</h4><div class="tbl-wrap"><table><tr><th>阶段</th><th>数量</th></tr>';
        const sNames = {0:'幼体',1:'少年',2:'成年',3:'完全体'};
        for (const r of d.stageDist) distHtml += `<tr><td>${sNames[r.stage]||r.stage}</td><td>${r.count}</td></tr>`;
        distHtml += '</table></div>';
        document.getElementById('dashDist').innerHTML = distHtml;
    }

    function card(label, value, cls) {
        return `<div class="card"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
    }

    /* ── 玩家管理 ── */
    let _userPage = 1;
    async function searchUsers(page) {
        const q = document.getElementById('userSearch').value.trim();
        if (!q) { toast('请输入搜索关键词', false); return; }
        _userPage = page || 1;
        const r = await GET(`/users?q=${encodeURIComponent(q)}&page=${_userPage}`);
        if (r.code !== 0) { toast(r.msg, false); return; }
        const d = r.data;
        let html = '<table><tr><th>ID</th><th>用户名</th><th>昵称</th><th>金币</th><th>最后登录</th><th>操作</th></tr>';
        for (const u of d.rows) {
            html += `<tr>
                <td>${u.id}</td><td>${u.username}</td><td>${u.nickname}</td><td>${u.gold}</td>
                <td>${fmtTime(u.last_login_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="Admin.viewUser(${u.id})">详情</button>
                    <button class="btn btn-sm btn-danger" onclick="Admin.banUser(${u.id})">封禁</button>
                </td>
            </tr>`;
        }
        html += '</table>';
        document.getElementById('userTable').innerHTML = html;
        document.getElementById('userPager').innerHTML = pager(d.page, Math.ceil(d.total / d.pageSize), 'Admin.searchUsers');
    }

    async function viewUser(uid) {
        const r = await GET(`/users/${uid}`);
        if (r.code !== 0) { toast(r.msg, false); return; }
        const d = r.data, u = d.user;
        let html = `<div class="detail-panel"><h4>用户 #${u.id} ${u.username} (${u.nickname})</h4>
            <div class="detail-grid">
                <div class="di"><span>金币:</span> ${u.gold}</div>
                <div class="di"><span>钻石:</span> ${u.diamond}</div>
                <div class="di"><span>已领蛋:</span> ${u.egg_claimed}</div>
                <div class="di"><span>注册:</span> ${fmtTime(u.created_at)}</div>
                <div class="di"><span>最后登录:</span> ${fmtTime(u.last_login_at)}</div>
                <div class="di"><span>Token版本:</span> ${u.token_version}</div>
            </div>
            <div class="form-row" style="margin-top:12px">
                <label>修改金币</label><input type="number" id="modGold" value="${u.gold}" style="width:100px">
                <button class="btn btn-sm btn-success" onclick="Admin.modifyUser(${u.id})">保存</button>
                <button class="btn btn-sm btn-danger" onclick="Admin.banUser(${u.id})">封禁</button>
                <button class="btn btn-sm btn-primary" onclick="Admin.unbanUser(${u.id})">解封</button>
            </div>
        </div>`;
        html += '<h4>宠物列表</h4><div class="tbl-wrap"><table><tr><th>ID</th><th>名称</th><th>品质</th><th>等级</th><th>阶段</th><th>操作</th></tr>';
        for (const p of d.pets) {
            html += `<tr><td>${p.id}</td><td>${p.name}</td><td>${p.quality}</td><td>${p.level}</td><td>${p.stage}</td>
                <td><button class="btn btn-sm btn-primary" onclick="Admin.viewPet(${p.id})">详情</button></td></tr>`;
        }
        html += '</table></div>';
        document.getElementById('userDetail').innerHTML = html;
    }

    async function modifyUser(uid) {
        const gold = parseInt(document.getElementById('modGold').value);
        const r = await POST(`/users/${uid}/modify`, { gold });
        toast(r.code === 0 ? '修改成功' : r.msg, r.code === 0);
    }

    async function banUser(uid) {
        if (!confirm('确认封禁该用户？')) return;
        const r = await POST(`/users/${uid}/ban`);
        toast(r.code === 0 ? '已封禁' : r.msg, r.code === 0);
    }

    async function unbanUser(uid) {
        const r = await POST(`/users/${uid}/unban`);
        toast(r.code === 0 ? '已解封' : r.msg, r.code === 0);
    }

    /* ── 宠物管理 ── */
    async function viewPet(petId) {
        navigate('pets');
        const r = await GET(`/pets/${petId}`);
        if (r.code !== 0) { toast(r.msg, false); return; }
        const d = r.data, p = d.pet, a = d.attr || {};
        let html = `<div class="detail-panel"><h4>宠物 #${p.id} ${p.name}</h4>
            <div class="detail-grid">
                <div class="di"><span>品质:</span> ${p.quality}</div>
                <div class="di"><span>等级:</span> ${p.level}</div>
                <div class="di"><span>阶段:</span> ${p.stage}</div>
                <div class="di"><span>经验:</span> ${p.exp}</div>
                <div class="di"><span>性别:</span> ${p.gender===1?'雄':'雌'}</div>
                <div class="di"><span>体力:</span> ${p.stamina}/${p.stamina_max}</div>
                <div class="di"><span>饱食:</span> ${p.satiety}/${p.satiety_max}</div>
                <div class="di"><span>心情:</span> ${p.mood}</div>
                <div class="di"><span>所属用户:</span> ${p.user_id}</div>
            </div></div>`;
        html += `<div class="detail-panel"><h4>六维属性</h4><div class="detail-grid">`;
        const keys = ['str','agi','vit','int','per','cha'];
        const kn = {str:'力量',agi:'敏捷',vit:'体质',int:'智力',per:'感知',cha:'魅力'};
        for (const k of keys) {
            html += `<div class="di"><span>${kn[k]}:</span> base=<input type="number" id="mod_${k}_base" value="${a[k+'_base']||0}" style="width:60px"> talent=${a[k+'_talent']||0}</div>`;
        }
        html += `</div>
            <div class="form-row" style="margin-top:12px">
                <label>等级</label><input type="number" id="modPetLevel" value="${p.level}" style="width:80px">
                <label>阶段</label><input type="number" id="modPetStage" value="${p.stage}" style="width:60px">
                <label>心情</label><input type="number" id="modPetMood" value="${p.mood}" style="width:60px">
                <button class="btn btn-sm btn-success" onclick="Admin.modifyPet(${p.id})">保存修改</button>
                <button class="btn btn-sm btn-primary" onclick="Admin.boostPet(${p.id})">加速成长</button>
            </div></div>`;
        if (d.skills && d.skills.length) {
            html += '<div class="detail-panel"><h4>技能</h4><div class="tbl-wrap"><table><tr><th>技能</th><th>等级</th><th>装备</th><th>槽位</th></tr>';
            for (const sk of d.skills) html += `<tr><td>${sk.skill_code}</td><td>${sk.skill_level}</td><td>${sk.is_equipped?'是':'否'}</td><td>${sk.slot_index}</td></tr>`;
            html += '</table></div></div>';
        }
        document.getElementById('petDetail').innerHTML = html;
    }

    async function modifyPet(petId) {
        const changes = {
            level: parseInt(document.getElementById('modPetLevel').value),
            stage: parseInt(document.getElementById('modPetStage').value),
            mood:  parseInt(document.getElementById('modPetMood').value)
        };
        const keys = ['str','agi','vit','int','per','cha'];
        for (const k of keys) {
            const el = document.getElementById(`mod_${k}_base`);
            if (el) changes[k + '_base'] = parseInt(el.value);
        }
        const r = await POST(`/pets/${petId}/modify`, changes);
        toast(r.code === 0 ? '修改成功' : r.msg, r.code === 0);
    }

    async function boostPet(petId) {
        const level = parseInt(document.getElementById('modPetLevel').value);
        const stage = parseInt(document.getElementById('modPetStage').value);
        const r = await POST('/test/boost-pet', { petId, level, stage, stamina: 100, mood: 100 });
        toast(r.code === 0 ? '加速成功' : r.msg, r.code === 0);
        if (r.code === 0) viewPet(petId);
    }

    /* ── 战斗记录 ── */
    let _battlePage = 1;
    async function loadBattles(page) {
        _battlePage = page || 1;
        const uid = document.getElementById('battleUid').value.trim();
        let qs = `?page=${_battlePage}`;
        if (uid) qs += `&uid=${uid}`;
        const r = await GET('/battles' + qs);
        if (r.code !== 0) { toast(r.msg, false); return; }
        const d = r.data;
        let html = '<table><tr><th>ID</th><th>攻方</th><th>守方</th><th>结果</th><th>赌注</th><th>时间</th></tr>';
        for (const b of d.rows) {
            html += `<tr><td>${b.id}</td><td>Pet#${b.attacker_pet_id}(U${b.attacker_uid})</td>
                <td>Pet#${b.defender_pet_id}(U${b.defender_uid})</td><td>${b.result}</td>
                <td>${b.bet_amount}</td><td>${fmtTime(b.created_at)}</td></tr>`;
        }
        html += '</table>';
        document.getElementById('battleTable').innerHTML = html;
        document.getElementById('battlePager').innerHTML = pager(d.page, Math.ceil(d.total / d.pageSize), 'Admin.loadBattles');
    }

    /* ── 数值调控 ── */
    let _rulesData = {};
    async function loadRules() {
        const r = await GET('/rules');
        if (r.code !== 0) { toast(r.msg, false); return; }
        _rulesData = r.data;
        let html = '';
        for (const [k, v] of Object.entries(_rulesData)) {
            if (typeof v === 'object') continue;
            html += `<div class="rule-item"><span class="rk">${k}</span><input id="rule_${k}" value="${v}"></div>`;
        }
        document.getElementById('rulesGrid').innerHTML = html;
    }

    async function saveRules() {
        const changes = {};
        for (const [k, v] of Object.entries(_rulesData)) {
            if (typeof v === 'object') continue;
            const el = document.getElementById('rule_' + k);
            if (!el) continue;
            const nv = typeof v === 'number' ? Number(el.value) : el.value;
            if (nv !== v) changes[k] = nv;
        }
        if (Object.keys(changes).length === 0) { toast('无修改', false); return; }
        const r = await POST('/rules', changes);
        toast(r.code === 0 ? `已更新 ${r.data.count} 个参数` : r.msg, r.code === 0);
        if (r.code === 0) loadRules();
    }

    /* ── 测试模块 ── */
    async function testCreatePet() {
        const uid = parseInt(document.getElementById('testUid').value);
        const quality = parseInt(document.getElementById('testQuality').value) || undefined;
        const level = parseInt(document.getElementById('testLevel').value) || undefined;
        if (!uid) { toast('请输入用户ID', false); return; }
        const r = await POST('/test/create-pet', { uid, quality, level });
        if (r.code === 0) {
            toast(`创建成功 Pet#${r.data.petId}`, true);
            document.getElementById('testResult').textContent = JSON.stringify(r.data, null, 2);
        } else toast(r.msg, false);
    }

    async function testClonePet() {
        const sourcePetId = parseInt(document.getElementById('cloneSource').value);
        const targetUid = parseInt(document.getElementById('cloneTarget').value);
        if (!sourcePetId || !targetUid) { toast('请填写完整', false); return; }
        const r = await POST('/test/clone-pet', { sourcePetId, targetUid });
        if (r.code === 0) {
            toast(`克隆成功 Pet#${r.data.newPetId}`, true);
            document.getElementById('testResult').textContent = JSON.stringify(r.data, null, 2);
        } else toast(r.msg, false);
    }

    async function testBattle() {
        const pet1Id = parseInt(document.getElementById('battlePet1').value);
        const pet2Id = parseInt(document.getElementById('battlePet2').value);
        if (!pet1Id || !pet2Id) { toast('请填写两只宠物ID', false); return; }
        const r = await POST('/test/battle', { pet1Id, pet2Id });
        if (r.code === 0) {
            const s = r.data.summary || r.data;
            toast(`战斗完成: ${s.winner || '平局'}`, true);
            document.getElementById('testResult').textContent = JSON.stringify(s, null, 2);
        } else toast(r.msg, false);
    }

    async function testBreeding() {
        const pet1Id = parseInt(document.getElementById('breedPet1').value);
        const pet2Id = parseInt(document.getElementById('breedPet2').value);
        if (!pet1Id || !pet2Id) { toast('请填写两只宠物ID', false); return; }
        const r = await POST('/test/breeding', { pet1Id, pet2Id });
        if (r.code === 0) {
            toast('交配模拟完成', true);
            document.getElementById('testResult').textContent = JSON.stringify(r.data, null, 2);
        } else toast(r.msg, false);
    }

    /* ── 工具 ── */
    function fmtTime(ts) {
        if (!ts) return '-';
        return new Date(ts * 1000).toLocaleString('zh-CN');
    }

    function pager(cur, total, fn) {
        if (total <= 1) return '';
        return `<button ${cur<=1?'disabled':''} onclick="${fn}(${cur-1})">上一页</button>
                <span>${cur}/${total}</span>
                <button ${cur>=total?'disabled':''} onclick="${fn}(${cur+1})">下一页</button>`;
    }

    /* ── 初始化 ── */
    function init() {
        initLogin();
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', () => navigate(el.dataset.page));
        });
        document.getElementById('logoutBtn').addEventListener('click', logout);

        /* 自动登录 */
        if (_key) {
            GET('/stats').then(r => {
                if (r.code === 0) showApp();
            });
        }
    }

    return {
        init, navigate, searchUsers, viewUser, modifyUser, banUser, unbanUser,
        viewPet, modifyPet, boostPet, loadBattles, saveRules,
        testCreatePet, testClonePet, testBattle, testBreeding
    };
})();

document.addEventListener('DOMContentLoaded', Admin.init);
