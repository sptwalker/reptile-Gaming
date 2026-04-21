/**
 * 竞技场前端模块 (P9)
 * - 竞技场入场/状态/对手列表
 * - 挑战发起/战斗执行
 * - 战斗回放渲染（Canvas）
 * - 战斗历史
 */

'use strict';

const Arena = (() => {
    /* ── DOM 引用 ── */
    const arenaSection   = document.getElementById('arenaSection');
    const arenaInfo      = document.getElementById('arenaInfo');
    const arenaActions   = document.getElementById('arenaActions');
    const arenaMsg       = document.getElementById('arenaMsg');
    const arenaPanel     = document.getElementById('arenaPanel');
    const arenaMyPets    = document.getElementById('arenaMyPets');
    const arenaOpponents = document.getElementById('arenaOpponents');
    const arenaPanelMsg  = document.getElementById('arenaPanelMsg');
    const battlePanel    = document.getElementById('battlePanel');
    const battleCanvas   = document.getElementById('battleCanvas');
    const battleNameA    = document.getElementById('battleNameA');
    const battleNameB    = document.getElementById('battleNameB');
    const battleHpA      = document.getElementById('battleHpA');
    const battleHpB      = document.getElementById('battleHpB');
    const battleFearA    = document.getElementById('battleFearA');
    const battleFearB    = document.getElementById('battleFearB');
    const battleTimer    = document.getElementById('battleTimer');
    const battleRage     = document.getElementById('battleRage');
    const battleResult   = document.getElementById('battleResult');
    const battleLog      = document.getElementById('battleLog');
    const battleSeek     = document.getElementById('battleSeek');
    const historyPanel   = document.getElementById('historyPanel');
    const historyList    = document.getElementById('historyList');

    /* ── 状态 ── */
    let _currentPetId = null;
    let _replayFrames = [];
    let _replayIdx = 0;
    let _replayTimer = null;
    let _replaySpeed = 1;
    let _replaySummary = null;
    let _offscreenCanvas = null;
    let _offscreenCtx = null;

    /* ── 竞技场区域渲染（宠物详情页内） ── */
    function renderArenaSection(pet) {
        if (!arenaSection) return;
        if (pet.stage < 2) {
            arenaSection.style.display = 'none';
            return;
        }
        arenaSection.style.display = '';
        _currentPetId = pet.id;

        const status = pet.arena_status || 'none';
        let infoHtml = '';
        let actionsHtml = '';

        if (status === 'in_arena') {
            infoHtml = '<p class="arena-status-active">🏟️ 已在竞技场中</p>';
            actionsHtml = `
                <button class="btn btn-arena" onclick="Arena.openArenaPanel()">进入竞技场</button>
                <button class="btn btn-sm" onclick="Arena.openHistory()">📜 战斗记录</button>
            `;
        } else if (status === 'recovery') {
            infoHtml = '<p class="arena-status-recovery">💤 恢复中...</p>';
            actionsHtml = `<button class="btn btn-sm" onclick="Arena.openHistory()">📜 战斗记录</button>`;
        } else {
            infoHtml = '<p>将宠物送入竞技场，自动累积金币并可挑战其他宠物</p>';
            actionsHtml = `
                <button class="btn btn-arena" onclick="Arena.enterArena()">⚔️ 入场竞技</button>
                <button class="btn btn-sm" onclick="Arena.openHistory()">📜 战斗记录</button>
            `;
        }

        arenaInfo.innerHTML = infoHtml;
        arenaActions.innerHTML = actionsHtml;
        arenaMsg.textContent = '';
    }

    /* ── 入场 ── */
    async function enterArena() {
        const res = await Api.post('/api/arena/enter', { pet_id: _currentPetId });
        if (res.code === 0) {
            _showMsg(arenaMsg, `入场成功！战斗力: ${res.data.fight_power}`, 'success');
            if (typeof Egg !== 'undefined' && Egg.refreshPetPanel) {
                Egg.refreshPetPanel(_currentPetId);
            }
        } else {
            _showMsg(arenaMsg, res.msg, 'error');
        }
    }

    /* ── 竞技场面板 ── */
    async function openArenaPanel() {
        _hideAll();
        arenaPanel.style.display = '';

        // 加载我的竞技场宠物
        const res = await Api.post('/api/arena/my');
        if (res.code === 0 && res.data.length > 0) {
            arenaMyPets.innerHTML = res.data.map(p => `
                <div class="arena-pet-card">
                    <div class="arena-pet-name">${_esc(p.name)} Lv.${p.level}</div>
                    <div class="arena-pet-stats">
                        <span>战力: ${p.fight_power}</span>
                        <span>💰 ${p.accumulated_gold}g</span>
                        ${p.is_recovering ? `<span class="arena-recovering">恢复中 ${_formatTime(p.recovery_remaining)}</span>` : ''}
                    </div>
                    <div class="arena-pet-actions">
                        ${!p.is_recovering ? `<button class="btn btn-sm" onclick="Arena.collectGold(${p.pet_id})">提取金币</button>
                        <button class="btn btn-sm btn-arena" onclick="Arena.loadOpponents(${p.pet_id})">寻找对手</button>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            arenaMyPets.innerHTML = '<p class="arena-empty">暂无竞技场宠物</p>';
        }
        arenaOpponents.innerHTML = '';
    }

    /* ── 提取金币 ── */
    async function collectGold(petId) {
        const res = await Api.post('/api/arena/collect', { pet_id: petId });
        if (res.code === 0) {
            _showMsg(arenaPanelMsg, `提取了 ${res.data.collected} 金币`, 'success');
            openArenaPanel();
        } else {
            _showMsg(arenaPanelMsg, res.msg, 'error');
        }
    }

    /* ── 加载对手 ── */
    async function loadOpponents(petId) {
        _currentPetId = petId;
        const res = await Api.post('/api/arena/opponents', { pet_id: petId });
        if (res.code === 0 && res.data.length > 0) {
            arenaOpponents.innerHTML = `
                <h4>可挑战对手</h4>
                ${res.data.map(o => `
                    <div class="arena-opponent-card">
                        <div class="arena-opp-info">
                            <span class="arena-opp-name">${_esc(o.name)}</span>
                            <span class="arena-opp-owner">@${_esc(o.owner)}</span>
                            <span>Lv.${o.level} 战力:${o.fight_power}</span>
                            <span>💰${o.accumulated_gold}g</span>
                        </div>
                        <button class="btn btn-sm btn-challenge" onclick="Arena.doChallenge(${petId}, ${o.pet_id})">⚔️ 挑战</button>
                    </div>
                `).join('')}
            `;
        } else {
            arenaOpponents.innerHTML = '<p class="arena-empty">暂无匹配对手</p>';
        }
    }

    /* ── 发起挑战并执行战斗 ── */
    async function doChallenge(myPetId, targetPetId) {
        _showMsg(arenaPanelMsg, '发起挑战中...', 'info');

        // 1. 发起挑战
        const chRes = await Api.post('/api/arena/challenge', { pet_id: myPetId, target_pet_id: targetPetId });
        if (chRes.code !== 0) {
            _showMsg(arenaPanelMsg, chRes.msg, 'error');
            return;
        }

        // 2. 执行战斗
        const btRes = await Api.post('/api/arena/battle', { challenge_id: chRes.data.challenge_id });
        if (btRes.code !== 0) {
            _showMsg(arenaPanelMsg, btRes.msg, 'error');
            return;
        }

        // 3. 获取回放数据并播放
        const rpRes = await Api.post('/api/arena/replay', { challenge_id: chRes.data.challenge_id });
        if (rpRes.code === 0) {
            _startReplay(rpRes.data);
        } else {
            // 无回放数据，直接显示结果
            _showBattleResult(btRes.data);
        }
    }

    /* ── 帧数据解压（增量→完整） ── */
    function _decompressFrames(compressed) {
        if (!compressed || compressed.length === 0) return [];
        const result = [compressed[0]]; // 首帧已完整
        for (let i = 1; i < compressed.length; i++) {
            const prev = result[i - 1];
            const delta = compressed[i];
            result.push({
                f: delta.f,
                a: { ...prev.a, ...(delta.a || {}) },
                b: { ...prev.b, ...(delta.b || {}) },
                ev: delta.ev || [],
            });
        }
        return result;
    }

    /* ── 战斗回放 ── */
    function _startReplay(data) {
        _hideAll();
        battlePanel.style.display = '';
        _replayFrames = _decompressFrames(data.frames || []);
        _replaySummary = data.summary || {};
        _replayIdx = 0;
        _replaySpeed = 1;

        // 初始化离屏Canvas
        if (!_offscreenCanvas) {
            _offscreenCanvas = document.createElement('canvas');
            _offscreenCanvas.width = battleCanvas.width;
            _offscreenCanvas.height = battleCanvas.height;
            _offscreenCtx = _offscreenCanvas.getContext('2d');
        }

        battleNameA.textContent = _replaySummary.left ? _replaySummary.left.name : 'Pet A';
        battleNameB.textContent = _replaySummary.right ? _replaySummary.right.name : 'Pet B';
        battleResult.style.display = 'none';
        battleLog.innerHTML = '';
        battleSeek.max = _replayFrames.length - 1;
        battleSeek.value = 0;

        _playReplay();
    }

    function _playReplay() {
        if (_replayTimer) { cancelAnimationFrame(_replayTimer); _replayTimer = null; }
        const msPerFrame = 100 / _replaySpeed;
        let lastTime = 0;

        function tick(timestamp) {
            if (!lastTime) lastTime = timestamp;
            const elapsed = timestamp - lastTime;
            if (elapsed >= msPerFrame) {
                lastTime = timestamp - (elapsed % msPerFrame);
                if (_replayIdx >= _replayFrames.length) {
                    _replayTimer = null;
                    _showReplayResult();
                    return;
                }
                _renderFrame(_replayFrames[_replayIdx]);
                battleSeek.value = _replayIdx;
                _replayIdx++;
            }
            _replayTimer = requestAnimationFrame(tick);
        }
        _replayTimer = requestAnimationFrame(tick);
    }

    function _pauseReplay() {
        if (_replayTimer) {
            cancelAnimationFrame(_replayTimer);
            _replayTimer = null;
        }
    }

    function _renderFrame(frame) {
        if (!frame) return;
        const ctx = _offscreenCtx || battleCanvas.getContext('2d');
        const target = _offscreenCanvas || battleCanvas;
        const W = target.width;
        const H = target.height;

        // 清空 + 背景
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);

        // 地面
        ctx.fillStyle = '#2d4a3e';
        ctx.fillRect(0, H - 60, W, 60);

        // 绘制单位
        const a = frame.a;
        const b = frame.b;

        _drawUnit(ctx, a.x, H - 80, '#55ff55', a.st, 'A');
        _drawUnit(ctx, b.x, H - 80, '#ff5555', b.st, 'B');

        // 离屏Canvas → 主Canvas 一次性拷贝
        if (_offscreenCanvas) {
            const mainCtx = battleCanvas.getContext('2d');
            mainCtx.drawImage(_offscreenCanvas, 0, 0);
        }

        // 更新HUD
        const maxHpA = _replaySummary.left ? _replaySummary.left.hpMax : 100;
        const maxHpB = _replaySummary.right ? _replaySummary.right.hpMax : 100;
        battleHpA.style.width = `${Math.max(0, (a.hp / maxHpA) * 100)}%`;
        battleHpB.style.width = `${Math.max(0, (b.hp / maxHpB) * 100)}%`;
        battleFearA.textContent = `恐惧: ${Math.floor(a.fear)}`;
        battleFearB.textContent = `恐惧: ${Math.floor(b.fear)}`;

        const sec = Math.floor((frame.f || 0) / 30);
        battleTimer.textContent = `${sec}s`;
        if (sec > 60) {
            battleRage.textContent = `🔥 狂暴 x${(1 + (sec - 60) * 0.02).toFixed(2)}`;
        } else {
            battleRage.textContent = '';
        }

        // 事件日志
        if (frame.ev && frame.ev.length > 0) {
            for (const ev of frame.ev) {
                _logEvent(ev);
            }
        }
    }

    function _drawUnit(ctx, x, y, color, state, label) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();

        // 状态指示
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 28);
        ctx.fillText(state, x, y + 35);
        ctx.restore();
    }

    function _logEvent(ev) {
        let text = '';
        const src = ev.src === 'left' ? '🟢' : '🔴';
        switch (ev.type) {
            case 'hit':       text = `${src} 攻击 → ${ev.dmg} 伤害`; break;
            case 'crit':      text = `${src} 暴击！→ ${ev.dmg} 伤害`; break;
            case 'dodge':     text = `${src} 攻击被闪避`; break;
            case 'skill_hit': text = `${src} [${ev.skill}] → ${ev.dmg} 伤害${ev.crit ? ' 暴击!' : ''}`; break;
            case 'heal':      text = `${src} [${ev.skill}] 恢复 ${ev.amt} HP`; break;
            case 'buff':      text = `${src} [${ev.skill}] 增益 ${ev.effect}`; break;
            case 'fear':      text = `${src} [${ev.skill}] 恐惧+${ev.fear}`; break;
            case 'flee':      text = `${src} 恐惧逃跑！`; break;
        }
        if (text) {
            const div = document.createElement('div');
            div.className = 'battle-log-entry';
            div.textContent = text;
            battleLog.prepend(div);
            if (battleLog.children.length > 50) battleLog.lastChild.remove();
        }
    }

    function _showReplayResult() {
        battleResult.style.display = '';
        if (!_replaySummary) return;
        const w = _replaySummary.winner;
        const leftName = _replaySummary.left ? _replaySummary.left.name : 'A';
        const rightName = _replaySummary.right ? _replaySummary.right.name : 'B';
        let resultText = '';
        if (w === 'left') resultText = `🏆 ${leftName} 获胜！`;
        else if (w === 'right') resultText = `🏆 ${rightName} 获胜！`;
        else resultText = '⚖️ 平局';
        battleResult.innerHTML = `<div class="battle-result-text">${resultText}</div>
            <div class="battle-result-stats">
                <span>${leftName}: ${_replaySummary.left?.totalDamage || 0}总伤害 / ${_replaySummary.left?.hits || 0}命中</span>
                <span>${rightName}: ${_replaySummary.right?.totalDamage || 0}总伤害 / ${_replaySummary.right?.hits || 0}命中</span>
            </div>`;
    }

    function _showBattleResult(data) {
        _hideAll();
        battlePanel.style.display = '';
        battleResult.style.display = '';
        const w = data.winner;
        battleResult.innerHTML = `<div class="battle-result-text">${w === 'left' ? '🏆 你的宠物获胜！' : w === 'right' ? '💀 你的宠物战败' : '⚖️ 平局'}</div>`;
    }

    /* ── 战斗历史 ── */
    async function openHistory() {
        _hideAll();
        historyPanel.style.display = '';
        const res = await Api.post('/api/arena/history');
        if (res.code === 0 && res.data.length > 0) {
            historyList.innerHTML = res.data.map(h => {
                const resultIcon = h.result === 'left' ? '🏆' : h.result === 'right' ? '💀' : '⚖️';
                return `
                    <div class="history-card">
                        <span>${resultIcon} ${_esc(h.attacker_name)} vs ${_esc(h.defender_name)}</span>
                        <span>赌注: ${h.bet_amount}g</span>
                        <span>地图: ${h.map_id}</span>
                        <button class="btn btn-sm" onclick="Arena.watchReplay(${h.id})">回放</button>
                    </div>
                `;
            }).join('');
        } else {
            historyList.innerHTML = '<p class="arena-empty">暂无战斗记录</p>';
        }
    }

    async function watchReplay(challengeId) {
        const res = await Api.post('/api/arena/replay', { challenge_id: challengeId });
        if (res.code === 0) {
            _startReplay(res.data);
        } else {
            _showMsg(arenaPanelMsg, res.msg || '回放数据已过期', 'error');
        }
    }

    /* ── 工具函数 ── */
    function _hideAll() {
        if (arenaPanel) arenaPanel.style.display = 'none';
        if (battlePanel) battlePanel.style.display = 'none';
        if (historyPanel) historyPanel.style.display = 'none';
    }

    function _showMsg(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className = `nurture-msg ${type || ''}`;
    }

    function _esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function _formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    /* ── 事件绑定 ── */
    document.getElementById('btnArenaClose')?.addEventListener('click', () => {
        arenaPanel.style.display = 'none';
    });
    document.getElementById('btnBattleClose')?.addEventListener('click', () => {
        _pauseReplay();
        battlePanel.style.display = 'none';
    });
    document.getElementById('btnHistoryClose')?.addEventListener('click', () => {
        historyPanel.style.display = 'none';
    });
    document.getElementById('btnBattlePlay')?.addEventListener('click', () => {
        if (_replayTimer) {
            _pauseReplay();
            document.getElementById('btnBattlePlay').textContent = '▶ 播放';
        } else {
            _playReplay();
            document.getElementById('btnBattlePlay').textContent = '⏸ 暂停';
        }
    });
    document.getElementById('btnBattleSpeed')?.addEventListener('click', () => {
        _replaySpeed = _replaySpeed >= 4 ? 1 : _replaySpeed * 2;
        document.getElementById('btnBattleSpeed').textContent = `${_replaySpeed}x`;
        if (_replayTimer) {
            _pauseReplay();
            _playReplay();
        }
    });
    battleSeek?.addEventListener('input', (e) => {
        _replayIdx = parseInt(e.target.value);
        if (_replayFrames[_replayIdx]) {
            _renderFrame(_replayFrames[_replayIdx]);
        }
    });

    /* ── 公开接口 ── */
    return {
        renderArenaSection,
        enterArena,
        openArenaPanel,
        collectGold,
        loadOpponents,
        doChallenge,
        openHistory,
        watchReplay,
    };
})();
