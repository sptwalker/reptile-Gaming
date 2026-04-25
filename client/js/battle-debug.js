(function () {
    'use strict';

    var API = '/api/battle-debug';
    var canvas = document.getElementById('battleCanvas');
    var ctx = canvas.getContext('2d');
    var adminKey = document.getElementById('adminKey');
    var pet1Id = document.getElementById('pet1Id');
    var pet2Id = document.getElementById('pet2Id');
    var mapId = document.getElementById('mapId');
    var speed = document.getElementById('speed');
    var battleMetrics = document.getElementById('battleMetrics');
    var leftState = document.getElementById('leftState');
    var rightState = document.getElementById('rightState');
    var eventLog = document.getElementById('eventLog');
    var winnerBadge = document.getElementById('winnerBadge');
    var batchResult = document.getElementById('batchResult');

    var sessionId = '';
    var state = null;
    var running = false;
    var raf = 0;
    var lastTick = 0;
    var bodyPartNames = {};
    var flashEvents = [];

    adminKey.value = localStorage.getItem('rg_admin_key') || '';
    var params = new URLSearchParams(location.search);
    var queryLeft = params.get('left') || params.get('pet1Id') || params.get('petId') || localStorage.getItem('rg_battle_left_pet_id');
    var queryRight = params.get('right') || params.get('pet2Id') || localStorage.getItem('rg_battle_right_pet_id');
    if (queryLeft) pet1Id.value = queryLeft;
    if (queryRight) pet2Id.value = queryRight;

    function headers() {
        var key = adminKey.value.trim();
        if (key) localStorage.setItem('rg_admin_key', key);
        return { 'Content-Type': 'application/json', 'X-Admin-Key': key };
    }

    async function request(path, body) {
        var options = { method: body ? 'POST' : 'GET', headers: headers() };
        if (body) options.body = JSON.stringify(body);
        var resp = await fetch(API + path, options);
        var data = await resp.json();
        if (data.code !== 0) throw new Error(data.msg || '接口错误');
        return data.data;
    }

    function pct(v, max) {
        return max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
    }

    function fmt(n) {
        return typeof n === 'number' ? (Math.round(n * 10) / 10) : n;
    }

    function renderMetrics() {
        if (!state) {
            battleMetrics.innerHTML = '<div class="muted">未开始</div>';
            return;
        }
        var sec = (state.frame / state.fps).toFixed(1);
        battleMetrics.innerHTML = [
            metric('帧 / 秒', state.frame + ' / ' + sec + 's'),
            metric('地图', state.map),
            metric('左伤害', state.stats.left.totalDamage),
            metric('右伤害', state.stats.right.totalDamage),
            metric('左技能', state.stats.left.skillsUsed),
            metric('右技能', state.stats.right.skillsUsed)
        ].join('');
    }

    function metric(k, v) {
        return '<div class="metric"><span>' + k + '</span><strong>' + v + '</strong></div>';
    }

    function renderUnit(el, unit) {
        if (!unit) { el.innerHTML = '<div class="muted">无数据</div>'; return; }
        var skills = unit.skills && unit.skills.length ? unit.skills.map(function (s) { return s.code + ':' + s.cooldownLeft; }).join(' / ') : '无';
        var html = '';
        html += line('HP', fmt(unit.hp) + ' / ' + fmt(unit.maxHp));
        html += '<div class="bar"><i style="width:' + pct(unit.hp, unit.maxHp) + '%"></i></div>';
        html += line('恐惧 / 体力', fmt(unit.fear) + ' / ' + fmt(unit.sta));
        html += line('AI / 技能', unit.st + ' / ' + (unit.canSkill ? '可用' : '禁用'));
        html += line('攻 / 防 / 速', fmt(unit.atk) + ' / ' + fmt(unit.def) + ' / ' + fmt(unit.effectiveSpd));
        html += line('视野 / 转头', fmt(unit.vision) + ' / ' + fmt(unit.headTurn));
        html += line('步幅 / 肢体', fmt(unit.step) + ' / ' + fmt(unit.limbMove));
        html += line('控制 / 转圈', fmt(unit.moveControl) + ' / ' + fmt(unit.spin));
        html += line('断尾诱饵', unit.decoy ? unit.tailDecoyFrames + '帧' : '无');
        html += line('技能CD', skills);
        html += '<div class="parts">' + Object.keys(unit.body || {}).map(function (key) {
            var p = unit.body[key];
            return '<div class="part ' + (p.detached ? 'detached' : '') + '"><strong>' + (bodyPartNames[key] || key) + '</strong> HP ' + p.hp + '/' + p.max + ' DEF ' + p.def + ' REG ' + p.regen + (p.detached ? ' 已脱落' : '') + '<div class="bar"><i style="width:' + pct(p.hp, p.max) + '%"></i></div></div>';
        }).join('') + '</div>';
        el.innerHTML = html;
    }

    function line(k, v) {
        return '<div class="state-line"><span>' + k + '</span><strong>' + v + '</strong></div>';
    }

    function pushEvents(events) {
        if (!events || !events.length) return;
        flashEvents = events.concat(flashEvents).slice(0, 10);
        var rows = events.map(function (e) {
            var text = '[' + (state ? state.frame : 0) + '] ' + e.type + ' ' + (e.src || '') + '→' + (e.tgt || '') + (e.dmg ? ' dmg=' + e.dmg : '') + (e.part ? ' part=' + e.part : '') + (e.skill ? ' skill=' + e.skill : '');
            return '<div class="event">' + text + '</div>';
        }).join('');
        eventLog.innerHTML = rows + eventLog.innerHTML;
    }

    function updateAll(nextState) {
        state = nextState;
        pushEvents(state.events);
        renderMetrics();
        renderUnit(leftState, state.units.left);
        renderUnit(rightState, state.units.right);
        if (state.finished) {
            running = false;
            winnerBadge.textContent = '战斗结束：' + state.winner;
            winnerBadge.classList.remove('hidden');
        } else {
            winnerBadge.classList.add('hidden');
        }
        draw();
    }

    function resizeCanvas() {
        var rect = canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(640, Math.floor(rect.width * dpr));
        canvas.height = Math.max(360, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    function draw() {
        var w = canvas.clientWidth || 960;
        var h = canvas.clientHeight || 560;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#070a12';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#26364f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(40, h * .72);
        ctx.lineTo(w - 40, h * .72);
        ctx.stroke();
        if (!state) {
            ctx.fillStyle = '#8b949e';
            ctx.font = '18px sans-serif';
            ctx.fillText('输入宠物ID并点击开始', 40, 60);
            return;
        }
        drawUnit(state.units.left, '#3fb950', w, h, true);
        drawUnit(state.units.right, '#f85149', w, h, false);
        drawFlashes(w, h);
    }

    function drawUnit(unit, color, w, h, faceRight) {
        var x = 40 + unit.x / 800 * (w - 80);
        var y = h * .72;
        var hpRatio = unit.hp / unit.maxHp;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(faceRight ? 1 : -1, 1);
        ctx.globalAlpha = unit.hp <= 0 ? .35 : 1;
        ctx.fillStyle = color;
        ctx.strokeStyle = '#e6edf3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -34, 44, 23, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.arc(48, -42, 18, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        if (!unit.body.tail || !unit.body.tail.detached) {
            ctx.beginPath();
            ctx.moveTo(-42, -35); ctx.quadraticCurveTo(-75, -58, -96, -30);
            ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.stroke();
        }
        [['foreLeft', 24], ['foreRight', 8], ['hindLeft', -22], ['hindRight', -36]].forEach(function (item) {
            var p = unit.body[item[0]];
            if (p && p.detached) return;
            ctx.strokeStyle = color; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(item[1], -16); ctx.lineTo(item[1] + (unit.spin ? Math.sin(Date.now()/120)*8 : 0), 6); ctx.stroke();
        });
        if (unit.decoy) {
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.arc(-90, -30, 18, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.restore();
        ctx.fillStyle = '#21262d'; ctx.fillRect(x - 52, y - 86, 104, 8);
        ctx.fillStyle = hpRatio > .45 ? '#3fb950' : hpRatio > .2 ? '#f59e0b' : '#f85149';
        ctx.fillRect(x - 52, y - 86, Math.max(0, 104 * hpRatio), 8);
        ctx.fillStyle = '#c9d1d9'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(unit.st + ' HP ' + Math.round(unit.hp), x, y - 94);
    }

    function drawFlashes(w, h) {
        flashEvents = flashEvents.filter(function (e) { e.life = (e.life || 18) - 1; return e.life > 0; });
        flashEvents.forEach(function (e, i) {
            ctx.fillStyle = e.type === 'crit' || e.crit ? '#f85149' : e.type === 'heal' ? '#3fb950' : '#f59e0b';
            ctx.font = 'bold 15px sans-serif';
            ctx.fillText(e.type + (e.dmg ? ' -' + e.dmg : ''), w / 2 - 80 + i * 18, 80 + i * 18);
        });
    }

    function rememberPetIds() {
        if (Number(pet1Id.value) > 0) localStorage.setItem('rg_battle_left_pet_id', String(Number(pet1Id.value)));
        if (Number(pet2Id.value) > 0) localStorage.setItem('rg_battle_right_pet_id', String(Number(pet2Id.value)));
    }

    async function start() {
        eventLog.innerHTML = '';
        rememberPetIds();
        var data = await request('/start', { pet1Id: Number(pet1Id.value), pet2Id: Number(pet2Id.value), mapId: mapId.value });
        sessionId = data.sessionId;
        updateAll(data.state);
        running = true;
        loop();
    }

    async function step(frames) {
        if (!sessionId) return;
        var data = await request('/step', { sessionId: sessionId, frames: frames || 1 });
        updateAll(data.state);
    }

    function loop(ts) {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        if (!lastTick || (ts || 0) - lastTick >= 80) {
            lastTick = ts || 0;
            step(Math.max(1, Number(speed.value || 1) * 3)).catch(showError);
        }
    }

    function showError(err) {
        running = false;
        alert(err.message || err);
    }

    async function loadMeta() {
        var data = await request('/meta');
        bodyPartNames = {};
        Object.keys(data.bodyParts || {}).forEach(function (key) { bodyPartNames[key] = data.bodyParts[key].name || key; });
        mapId.innerHTML = (data.maps || []).map(function (m) { return '<option value="' + m.id + '">' + m.name + ' (' + m.id + ')</option>'; }).join('');
    }

    document.getElementById('btnStart').onclick = function () { start().catch(showError); };
    document.getElementById('btnPause').onclick = function () { running = !running; if (running) loop(); };
    document.getElementById('btnStep').onclick = function () { running = false; step(1).catch(showError); };
    document.getElementById('btnReset').onclick = async function () {
        if (!sessionId) return start().catch(showError);
        var data = await request('/reset', { sessionId: sessionId });
        sessionId = data.sessionId;
        eventLog.innerHTML = '';
        updateAll(data.state);
    };
    document.getElementById('btnEnd').onclick = async function () {
        running = false;
        if (sessionId) await request('/end', { sessionId: sessionId });
        sessionId = '';
    };
    document.getElementById('btnBatch').onclick = async function () {
        batchResult.textContent = '运行中...';
        rememberPetIds();
        var data = await request('/batch', { pet1Id: Number(pet1Id.value), pet2Id: Number(pet2Id.value), mapId: mapId.value, count: Number(document.getElementById('batchCount').value || 20) });
        batchResult.innerHTML = '总场次：' + data.count + '<br>左胜率：' + data.leftRate + '% (' + data.left + ')<br>右胜率：' + data.rightRate + '% (' + data.right + ')<br>平局率：' + data.drawRate + '% (' + data.draw + ')<br>平均时长：' + data.avgDuration + 's<br>左/右均伤：' + data.avgDamageLeft + ' / ' + data.avgDamageRight + '<br>左/右均闪避：' + data.avgDodgesLeft + ' / ' + data.avgDodgesRight;
    };

    window.addEventListener('resize', resizeCanvas);
    loadMeta().then(function () { resizeCanvas(); renderMetrics(); }).catch(showError);
}());
