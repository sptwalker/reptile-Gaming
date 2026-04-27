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
    var toggleMotionDebug = document.getElementById('toggleMotionDebug');
    var leftPersonality = document.getElementById('leftPersonality');
    var rightPersonality = document.getElementById('rightPersonality');
    var randomPersonality = document.getElementById('randomPersonality');
    var leftCustomPersonality = document.getElementById('leftCustomPersonality');
    var rightCustomPersonality = document.getElementById('rightCustomPersonality');
    var personalityEditors = document.getElementById('personalityEditors');
    var audioEnabled = document.getElementById('audioEnabled');
    var audioVolume = document.getElementById('audioVolume');
    var audioStatus = document.getElementById('audioStatus');
    var audioRequirements = document.getElementById('audioRequirements');
    var battleReport = document.getElementById('battleReport');
    var battleTopHud = document.getElementById('battleTopHud');
    var hudLeftName = document.getElementById('hudLeftName');
    var hudRightName = document.getElementById('hudRightName');
    var hudLeftHpText = document.getElementById('hudLeftHpText');
    var hudRightHpText = document.getElementById('hudRightHpText');
    var hudLeftHpBar = document.getElementById('hudLeftHpBar');
    var hudRightHpBar = document.getElementById('hudRightHpBar');
    var hudLeftFearText = document.getElementById('hudLeftFearText');
    var hudRightFearText = document.getElementById('hudRightFearText');
    var hudLeftFearBar = document.getElementById('hudLeftFearBar');
    var hudRightFearBar = document.getElementById('hudRightFearBar');

    var sessionId = '';
    var state = null;
    var running = false;
    var raf = 0;
    var lastTick = 0;
    var bodyPartNames = {};
    var flashEvents = [];
    var cameraShake = { power: 0, frames: 0, seed: 0 };
    var screenImpact = { power: 0, life: 0 };
    var edgeHints = [];
    var mapConfigs = {};
    var mapList = [];
    var personalityPresets = {};
    var lastBatchReport = null;
    var battleAppearance = { left: null, right: null };
    var previewActive = false;
    var previewFrame = 0;
    var previewKey = '';
    var idleRaf = 0;
    var stepping = false;
    var stepBacklog = 0;
    var stepStartedAt = 0;
    var stepWatchdogShown = false;
    var sameFrameResponses = 0;
    var eventLogRows = [];
    var summaryShownKey = '';
    var renderDegradedUntil = 0;
    var animator = window.BattleAnimator ? new window.BattleAnimator({ contracts: window.BattleActionContracts }) : null;

    var battleAdapter = window.LizardBattleAdapter ? new window.LizardBattleAdapter(canvas, { animator: animator }) : null;

    var PERSONALITY_DIMS = [
        ['aggression', '攻击倾向'], ['risk', '风险偏好'], ['caution', '谨慎度'], ['mobility', '机动性'],
        ['cunning', '狡猾度'], ['ferocity', '凶猛度'], ['skill', '技能偏好'], ['hearing', '听觉敏感']
    ];
    var BATTLE_AUDIO_BASE = 'assets/audio/battle/';
    var BATTLE_AUDIO_REQUIREMENTS = [
        { id: 'footstep_grass', type: '脚步', event: 'sound:footstep surface=grass', file: 'footstep/footstep_grass_01.ogg', variants: 3, loop: false, volume: 0.42, spatial: true, fallback: 'WebAudio短噪声' },
        { id: 'footstep_sand', type: '脚步', event: 'sound:footstep surface=sand', file: 'footstep/footstep_sand_01.ogg', variants: 3, loop: false, volume: 0.32, spatial: true, fallback: 'WebAudio短噪声' },
        { id: 'footstep_stone', type: '脚步', event: 'sound:footstep surface=stone', file: 'footstep/footstep_stone_01.ogg', variants: 3, loop: false, volume: 0.52, spatial: true, fallback: 'WebAudio短噪声' },
        { id: 'footstep_water', type: '脚步', event: 'sound:footstep surface=water', file: 'footstep/footstep_water_01.ogg', variants: 3, loop: false, volume: 0.72, spatial: true, fallback: 'WebAudio短噪声' },
        { id: 'scramble', type: '失衡/转圈', event: 'sound:scramble', file: 'movement/scramble_01.ogg', variants: 2, loop: false, volume: 0.64, spatial: true, fallback: 'WebAudio噪声扫频' },
        { id: 'fake_skill_sound', type: '假声诱导', event: 'sound:fake_skill_sound', file: 'skill/fake_sound_01.ogg', variants: 2, loop: false, volume: 0.56, spatial: true, fallback: 'WebAudio高频脉冲' },
        { id: 'hit', type: '命中', event: 'combat_action hit', file: 'combat/hit_01.ogg', variants: 3, loop: false, volume: 0.7, spatial: true, fallback: 'WebAudio低频冲击' },
        { id: 'dodge', type: '闪避', event: 'dodge/tail_decoy', file: 'combat/dodge_01.ogg', variants: 2, loop: false, volume: 0.45, spatial: true, fallback: 'WebAudio短滑音' },
        { id: 'crit', type: '暴击', event: 'crit or combat_action crit', file: 'combat/crit_01.ogg', variants: 2, loop: false, volume: 0.9, spatial: true, fallback: 'WebAudio重击' },
        { id: 'skill', type: '技能释放', event: 'visual_fx:skill_glow or skill event', file: 'skill/skill_cast_01.ogg', variants: 2, loop: false, volume: 0.68, spatial: true, fallback: 'WebAudio上扬音' },
        { id: 'perception', type: '听觉捕获', event: 'perception', file: 'ui/perception_ping_01.ogg', variants: 1, loop: false, volume: 0.36, spatial: false, fallback: 'WebAudio提示音' }
    ];
    var battleAudio = { ctx: null, buffers: {}, missing: {}, cooldown: {}, lastFrame: -1 };

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

    async function request(path, body, options) {
        options = options || {};
        var headersObj = headers();
        var fetchOptions = { method: body ? 'POST' : 'GET', headers: headersObj };
        if (body) fetchOptions.body = JSON.stringify(body);
        var controller = null;
        var timeoutId = 0;
        var timedOut = false;
        if (options.timeoutMs && window.AbortController) {
            controller = new AbortController();
            fetchOptions.signal = controller.signal;
        }
        var timeoutPromise = options.timeoutMs ? new Promise(function (_resolve, reject) {
            timeoutId = setTimeout(function () {
                timedOut = true;
                if (controller) controller.abort();
                reject(new Error('战斗步进请求超时，请重新开始或降低倍速'));
            }, options.timeoutMs);
        }) : null;
        try {
            var fetchPromise = fetch(API + path, fetchOptions);
            var resp = await (timeoutPromise ? Promise.race([fetchPromise, timeoutPromise]) : fetchPromise);
            var jsonPromise = resp.json();
            var data = await (timeoutPromise ? Promise.race([jsonPromise, timeoutPromise]) : jsonPromise);
            if (timedOut) throw new Error('战斗步进请求超时，请重新开始或降低倍速');
            if (data.code !== 0) throw new Error(data.msg || '接口错误');
            return data.data;
        } catch (err) {
            if (timedOut || (err && err.name === 'AbortError')) throw new Error('战斗步进请求超时，请重新开始或降低倍速');
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    function pct(v, max) {
        return max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
    }

    function fmt(n) {
        return typeof n === 'number' ? (Math.round(n * 10) / 10) : n;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }

    function clamp01(v) {
        var n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
    }

    function setPanelCollapsed(panel, collapsed) {
        if (!panel) return;
        panel.classList.toggle('collapsed', !!collapsed);
    }

    function bindPanelToggle(buttonId, panelId, storageKey) {
        var btn = document.getElementById(buttonId);
        var panel = document.getElementById(panelId);
        if (!btn || !panel) return;
        setPanelCollapsed(panel, localStorage.getItem(storageKey) === '1');
        btn.onclick = function () {
            var collapsed = !panel.classList.contains('collapsed');
            setPanelCollapsed(panel, collapsed);
            localStorage.setItem(storageKey, collapsed ? '1' : '0');
            resizeCanvas();
        };
    }

    function ensureIdleLoop() {
        if (idleRaf || running) return;
        var tick = function () {
            idleRaf = requestAnimationFrame(tick);
            draw();
        };
        idleRaf = requestAnimationFrame(tick);
    }

    function stopIdleLoop() {
        if (idleRaf) cancelAnimationFrame(idleRaf);
        idleRaf = 0;
    }

    function previewPayloadKey() {
        return Number(pet1Id.value || 0) + ':' + Number(pet2Id.value || 0);
    }

    async function loadPreview() {
        var key = previewPayloadKey();
        if (key === previewKey || Number(pet1Id.value) <= 0 || Number(pet2Id.value) <= 0) return;
        previewKey = key;
        rememberPetIds();
        var data = await request('/preview', { pet1Id: Number(pet1Id.value), pet2Id: Number(pet2Id.value) });
        if (state || running) return;
        applyAppearance(data.appearance);
        previewActive = true;
        ensureIdleLoop();
        draw();
    }

    function renderAudioRequirements() {
        if (!audioRequirements) return;
        audioRequirements.classList.remove('muted');
        audioRequirements.innerHTML = '<div class="report-title">音效需求表 · 存储目录 client/assets/audio/battle/</div>' +
            '<table><thead><tr><th>ID</th><th>类型</th><th>触发</th><th>文件</th><th>变体</th><th>音量</th><th>Fallback</th></tr></thead><tbody>' +
            BATTLE_AUDIO_REQUIREMENTS.map(function (r) {
                return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.event) + '</td><td>' + esc(r.file) + '</td><td>' + r.variants + '</td><td>' + r.volume + '</td><td>' + esc(r.fallback) + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    function audioKeyForEvent(e) {
        if (!e) return null;
        if (e.type === 'action_phase') return prefix + sideName(src) + '进入动作阶段：' + skillName(e.actionId) + '，起手/命中/恢复帧 ' + e.startFrame + '/' + e.impactFrame + '/' + e.endFrame + '。';
        if (e.type === 'strategy_intent') return prefix + sideName(src) + '策略意图切换为' + strategyName(e.intent) + '（' + (e.reason || '-') + '）。';
        if (e.type === 'guard_block') return prefix + sideName(tgt) + '使用' + skillName(e.defenseAction) + '格挡' + sideName(src) + '，减免 ' + fmt(e.blockedDamage || 0) + ' 点伤害。';
        if (e.type === 'counter') return prefix + sideName(tgt) + '抓住反制窗口，反制' + sideName(src) + '。';
        if (e.type === 'sound') {
            if (e.soundType === 'footstep') return 'footstep_' + (e.surface || 'grass');
            return e.soundType;
        }
        if (e.type === 'combat_action') {
            if (e.result && e.result.crit) return 'crit';
            if (e.result && e.result.hit) return 'hit';
        }
        if (e.type === 'dodge' || e.type === 'tail_decoy') return 'dodge';
        if (e.type === 'crit' || e.crit) return 'crit';
        if (e.type === 'visual_fx' && e.fxId === 'skill_glow') return 'skill';
        if (e.type === 'perception') return 'perception';
        return null;
    }

    function ensureAudio() {
        if (!audioEnabled || !audioEnabled.checked) return null;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!battleAudio.ctx) battleAudio.ctx = new AC();
        if (battleAudio.ctx.state === 'suspended') battleAudio.ctx.resume();
        return battleAudio.ctx;
    }

    function anchorCanvasPoint(side) {
        if (!side) return null;
        if (battleAdapter && battleAdapter.lastAnchors && battleAdapter.lastAnchors[side] && battleAdapter.lastAnchors[side].head) {
            return battleAdapter.lastAnchors[side].head;
        }
        var unit = null;
        if (animator && state && state.units && animator.getUnitVisual) unit = animator.getUnitVisual(side, state.units[side]);
        else if (state && state.units) unit = state.units[side];
        return unit ? worldToCanvas(unit, canvas.clientWidth || 960, canvas.clientHeight || 560, currentMapConfig()) : null;
    }

    function eventCanvasPoint(e) {
        var w = canvas.clientWidth || 960;
        var h = canvas.clientHeight || 560;
        var map = currentMapConfig();
        if (!e) return { x: w / 2, y: h / 2 };
        if (e.type === 'sound' && e.fake && Number.isFinite(Number(e.x))) return worldToCanvas(e, w, h, map);
        var side = null;
        if (e.type === 'hit' || e.type === 'crit' || e.type === 'skill_hit') side = e.tgt || e.target;
        else if (e.type === 'combat_action') side = e.result && e.result.hit ? (e.target || e.tgt) : (e.actor || e.src);
        else if (e.type === 'visual_fx') side = e.target || e.actor || e.tgt || e.src;
        else side = e.src || e.actor || e.realSource;
        var anchored = anchorCanvasPoint(side);
        if (anchored) return anchored;
        if (Number.isFinite(Number(e.x)) || Number.isFinite(Number(e.y))) return worldToCanvas(e, w, h, map);
        return { x: w / 2, y: h / 2 };
    }

    function soundPan(e) {
        var w = canvas.clientWidth || 960;
        var p = eventCanvasPoint(e);
        var x = p && Number.isFinite(Number(p.x)) ? Number(p.x) : w / 2;
        return Math.max(-1, Math.min(1, (x - w / 2) / (w / 2)));
    }

    function audioVariantFile(req) {
        if (!req) return '';
        var count = Math.max(1, Number(req.variants || 1));
        var n = Math.floor(Math.random() * count) + 1;
        return req.file.replace(/_01\./, '_' + String(n).padStart(2, '0') + '.');
    }

    function playBuffer(buffer, req, e) {
        var ac = ensureAudio();
        if (!ac || !buffer) return false;
        var src = ac.createBufferSource();
        var master = ac.createGain();
        var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
        src.buffer = buffer;
        master.gain.value = (Number(audioVolume && audioVolume.value) || 0.65) * (req && req.volume || 0.45) * Math.min(1.35, Math.max(0.35, (e.volume || 20) / 30));
        if (pan) { pan.pan.value = req && req.spatial === false ? 0 : soundPan(e); src.connect(master); master.connect(pan); pan.connect(ac.destination); }
        else { src.connect(master); master.connect(ac.destination); }
        src.start();
        return true;
    }

    function playAudioKey(key, e, req) {
        var ac = ensureAudio();
        if (!ac) return;
        if (!req) return synthSound(key, e, req);
        var file = audioVariantFile(req);
        var url = BATTLE_AUDIO_BASE + file;
        if (battleAudio.buffers[url]) return playBuffer(battleAudio.buffers[url], req, e);
        if (battleAudio.missing[url]) return synthSound(key, e, req);
        fetch(url).then(function (resp) {
            if (!resp.ok) throw new Error('missing audio');
            return resp.arrayBuffer();
        }).then(function (buf) { return ac.decodeAudioData(buf); }).then(function (buffer) {
            battleAudio.buffers[url] = buffer;
            playBuffer(buffer, req, e);
        }).catch(function () {
            battleAudio.missing[url] = true;
            synthSound(key, e, req);
            if (audioStatus) audioStatus.textContent = '真实音效缺失，已使用 WebAudio fallback：' + url;
        });
    }

    function synthSound(key, e, req) {
        var ac = ensureAudio();
        if (!ac) return;
        var now = ac.currentTime;
        var master = ac.createGain();
        var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
        master.gain.value = (Number(audioVolume && audioVolume.value) || 0.65) * (req && req.volume || 0.45) * Math.min(1.35, Math.max(0.35, (e.volume || 20) / 30));
        if (pan) { pan.pan.value = req && req.spatial === false ? 0 : soundPan(e); master.connect(pan); pan.connect(ac.destination); }
        else master.connect(ac.destination);
        var osc = ac.createOscillator();
        var noiseGain = ac.createGain();
        var freq = key === 'crit' ? 92 : key === 'hit' ? 130 : key === 'perception' ? 780 : key === 'skill' ? 420 : key === 'fake_skill_sound' ? 560 : 180;
        osc.type = key && key.indexOf('footstep') === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq * 0.55), now + 0.12);
        noiseGain.gain.setValueAtTime(1, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(noiseGain); noiseGain.connect(master);
        osc.start(now); osc.stop(now + 0.16);
    }

    function playBattleSounds(events) {
        if (!audioEnabled || !audioEnabled.checked) return;
        (events || []).forEach(function (e) {
            var key = audioKeyForEvent(e);
            if (!key) return;
            var frame = e.frame || (state && state.frame) || 0;
            var cdKey = key + ':' + Math.floor(frame / 4);
            if (battleAudio.cooldown[cdKey]) return;
            battleAudio.cooldown[cdKey] = true;
            var req = BATTLE_AUDIO_REQUIREMENTS.find(function (r) { return r.id === key; });
            playAudioKey(key, e, req);
        });
        if (audioStatus) audioStatus.textContent = '音效开启；缺失真实资源时使用 WebAudio fallback；资源目录：client/assets/audio/battle/';
    }

    function getBasePersonality(side) {
        var select = side === 'left' ? leftPersonality : rightPersonality;
        var code = select && select.value || 'balanced';
        return personalityPresets[code] || personalityPresets.balanced || {};
    }

    function readCustomPersonality(side) {
        var useCustom = side === 'left' ? leftCustomPersonality : rightCustomPersonality;
        if (!useCustom || !useCustom.checked) return side === 'left' ? (leftPersonality && leftPersonality.value || 'balanced') : (rightPersonality && rightPersonality.value || 'balanced');
        var base = getBasePersonality(side);
        var out = { code: 'custom', name: (side === 'left' ? '左方' : '右方') + '自定义性格' };
        PERSONALITY_DIMS.forEach(function (d) {
            var el = document.getElementById(side + '_ai_' + d[0]);
            out[d[0]] = el ? clamp01(el.value) : clamp01(base[d[0]]);
        });
        return out;
    }

    function saveCustomPersonalities() {
        var data = { leftEnabled: !!(leftCustomPersonality && leftCustomPersonality.checked), rightEnabled: !!(rightCustomPersonality && rightCustomPersonality.checked), left: {}, right: {} };
        ['left', 'right'].forEach(function (side) {
            PERSONALITY_DIMS.forEach(function (d) {
                var el = document.getElementById(side + '_ai_' + d[0]);
                data[side][d[0]] = el ? clamp01(el.value) : 0.5;
            });
        });
        localStorage.setItem('rg_battle_custom_personality', JSON.stringify(data));
    }

    function renderPersonalityEditors() {
        if (!personalityEditors) return;
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem('rg_battle_custom_personality') || '{}'); } catch (e) { saved = {}; }
        if (leftCustomPersonality) leftCustomPersonality.checked = !!saved.leftEnabled;
        if (rightCustomPersonality) rightCustomPersonality.checked = !!saved.rightEnabled;
        personalityEditors.innerHTML = ['left', 'right'].map(function (side) {
            var base = getBasePersonality(side);
            return '<div class="personality-editor"><h3>' + (side === 'left' ? '左方参数' : '右方参数') + '</h3>' + PERSONALITY_DIMS.map(function (d) {
                var val = saved[side] && saved[side][d[0]] != null ? saved[side][d[0]] : clamp01(base[d[0]]);
                return '<label>' + d[1] + '<span id="' + side + '_ai_' + d[0] + '_v">' + Number(val).toFixed(2) + '</span><input id="' + side + '_ai_' + d[0] + '" data-side="' + side + '" data-dim="' + d[0] + '" type="range" min="0" max="1" step="0.01" value="' + val + '"></label>';
            }).join('') + '</div>';
        }).join('');
        PERSONALITY_DIMS.forEach(function (d) {
            ['left', 'right'].forEach(function (side) {
                var el = document.getElementById(side + '_ai_' + d[0]);
                var val = document.getElementById(side + '_ai_' + d[0] + '_v');
                if (el) el.oninput = function () { if (val) val.textContent = Number(el.value).toFixed(2); saveCustomPersonalities(); };
            });
        });
    }

    function downloadText(filename, text, type) {
        var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
    }

    function reportTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-');
    }

    function exportReportJson() {
        if (!lastBatchReport) return alert('请先运行批量测试');
        downloadText('battle-report-' + reportTimestamp() + '.json', JSON.stringify(lastBatchReport, null, 2), 'application/json;charset=utf-8');
    }

    function csvCell(v) {
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    }

    function exportReportCsv() {
        if (!lastBatchReport) return alert('请先运行批量测试');
        var d = lastBatchReport;
        var rows = [
            ['metric', 'value'], ['count', d.count], ['leftRate', d.leftRate], ['rightRate', d.rightRate], ['drawRate', d.drawRate], ['avgDuration', d.avgDuration], ['avgDamageLeft', d.avgDamageLeft], ['avgDamageRight', d.avgDamageRight],
            [], ['side', 'avgDamage', 'avgHits', 'avgCrits', 'avgDodges', 'avgSkills', 'avgHpLeft', 'front', 'sideZone', 'rear', 'avgFlank'], ['left', d.detail.left.avgDamage, d.detail.left.avgHits, d.detail.left.avgCrits, d.detail.left.avgDodges, d.detail.left.avgSkills, d.detail.left.avgHpLeft, d.detail.left.angle && d.detail.left.angle.front, d.detail.left.angle && d.detail.left.angle.side, d.detail.left.angle && d.detail.left.angle.rear, d.detail.left.angle && d.detail.left.angle.avgFlankScore], ['right', d.detail.right.avgDamage, d.detail.right.avgHits, d.detail.right.avgCrits, d.detail.right.avgDodges, d.detail.right.avgSkills, d.detail.right.avgHpLeft, d.detail.right.angle && d.detail.right.angle.front, d.detail.right.angle && d.detail.right.angle.side, d.detail.right.angle && d.detail.right.angle.rear, d.detail.right.angle && d.detail.right.angle.avgFlankScore],
            [], ['sample', 'winner', 'duration', 'leftDamage', 'rightDamage', 'leftAi', 'rightAi']
        ];
        (d.detail.samples || []).forEach(function (s) { rows.push([s.index, s.winner, s.duration, s.leftDamage, s.rightDamage, s.leftAi, s.rightAi]); });
        downloadText('battle-report-' + reportTimestamp() + '.csv', rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'), 'text/csv;charset=utf-8');
    }

    function renderMetrics() {
        if (!state) {
            battleMetrics.innerHTML = '<div class="muted">未开始</div>';
            return;
        }
        var sec = (state.frame / state.fps).toFixed(1);
        var left = state.units && state.units.left || {};
        var right = state.units && state.units.right || {};
        var ls = state.stats && state.stats.left || {};
        var rs = state.stats && state.stats.right || {};
        battleMetrics.innerHTML = [
            metric('帧 / 秒', state.frame + ' / ' + sec + 's'),
            metric('地图', state.map),
            metric('左伤害 / 技能', (ls.totalDamage || 0) + ' / ' + (ls.skillsUsed || 0)),
            metric('右伤害 / 技能', (rs.totalDamage || 0) + ' / ' + (rs.skillsUsed || 0)),
            metric('左体力经济', economyText(left.actionEconomy)),
            metric('右体力经济', economyText(right.actionEconomy)),
            metric('左防御/反制', (left.defenseStats && left.defenseStats.blocks || 0) + ' / ' + (left.defenseStats && left.defenseStats.counters || 0)),
            metric('右防御/反制', (right.defenseStats && right.defenseStats.blocks || 0) + ' / ' + (right.defenseStats && right.defenseStats.counters || 0)),
            metric('左策略', strategyName(left.strategy && left.strategy.intent)),
            metric('右策略', strategyName(right.strategy && right.strategy.intent))
        ].join('');
    }

    function metric(k, v) {
        return '<div class="metric"><span>' + k + '</span><strong>' + v + '</strong></div>';
    }

    function updateTopHud() {
        if (!battleTopHud) return;
        if (!state || !state.units) {
            battleTopHud.classList.add('hidden');
            return;
        }
        var left = state.units.left || {};
        var right = state.units.right || {};
        battleTopHud.classList.remove('hidden');
        hudLeftName.textContent = left.name || '左方宠物';
        hudRightName.textContent = right.name || '右方宠物';
        hudLeftHpText.textContent = fmt(left.hp) + ' / ' + fmt(left.maxHp);
        hudRightHpText.textContent = fmt(right.hp) + ' / ' + fmt(right.maxHp);
        hudLeftHpBar.style.width = pct(left.hp, left.maxHp) + '%';
        hudRightHpBar.style.width = pct(right.hp, right.maxHp) + '%';
        hudLeftFearText.textContent = fmt(left.fear || 0);
        hudRightFearText.textContent = fmt(right.fear || 0);
        hudLeftFearBar.style.width = Math.max(0, Math.min(100, Number(left.fear || 0))) + '%';
        hudRightFearBar.style.width = Math.max(0, Math.min(100, Number(right.fear || 0))) + '%';
    }

    function renderUnit(el, unit) {
        if (!unit) { el.innerHTML = '<div class="muted">无数据</div>'; return; }
        var skills = unit.skills && unit.skills.length ? unit.skills.map(function (s) { return s.code + ':' + s.cooldownLeft + '/' + s.cooldown + ' STA' + s.staminaCost + (s.ready ? '✓' : '×'); }).join(' / ') : '无';
        var active = unit.activeAction;
        var html = '';
        html += line('HP', fmt(unit.hp) + ' / ' + fmt(unit.maxHp));
        html += '<div class="bar"><i style="width:' + pct(unit.hp, unit.maxHp) + '%"></i></div>';
        html += line('恐惧 / 体力', fmt(unit.fear) + ' / ' + fmt(unit.sta) + ' / ' + fmt(unit.maxSta || 0));
        html += line('动作阶段', active ? (skillName(active.actionId) + ' · ' + active.phase + ' · ' + active.startFrame + '-' + active.endFrame) : '空闲');
        if (active) html += line('护甲 / 反制窗', fmt(active.armor || 0) + ' / ' + (active.counterWindow ? active.counterWindow.start + '-' + active.counterWindow.end : '-'));
        html += line('体力经济', economyText(unit.actionEconomy));
        html += line('防御统计', '格挡' + (unit.defenseStats && unit.defenseStats.blocks || 0) + ' / 减伤' + fmt(unit.defenseStats && unit.defenseStats.blockedDamage || 0) + ' / 反制' + (unit.defenseStats && unit.defenseStats.counters || 0));
        html += line('策略意图', strategyName(unit.strategy && unit.strategy.intent) + ' / ' + (unit.strategy && unit.strategy.reason || '-'));
        html += line('策略分布', traceText(unit.strategyTrace));
        html += line('对手模型', modelText(unit.opponentModel));
        html += line('对手意图', traceText(unit.opponentModel && unit.opponentModel.intentTrace));
        html += line('信息统计', keyedText(unit.infoStats));
        html += line('AI / 子状态', unit.st + ' / ' + (unit.aiSubState || '-'));
        html += line('朝向 / 角速', fmt(unit.facing) + ' / ' + fmt(unit.angularVelocity || 0));
        if (unit.flankTarget) html += line('绕后目标', 'x=' + unit.flankTarget.x + ' y=' + unit.flankTarget.y);
        if (unit.protectTarget) html += line('保护目标', 'x=' + unit.protectTarget.x + ' y=' + unit.protectTarget.y);
        if (unit.weakExposure) html += line('弱点暴露', unit.weakExposure.part + ' ' + fmt(unit.weakExposure.exposure) + ' / HP ' + fmt(unit.weakExposure.hpRatio));
        if (unit.lastTargetTactic) html += line('最近部位战术', tacticName(unit.lastTargetTactic));
        if (unit.personality) html += line('战斗性格', (unit.personality.name || unit.personality.code) + ' / ' + (unit.personality.code || 'custom'));
        html += line('攻 / 防 / 速', fmt(unit.atk) + ' / ' + fmt(unit.def) + ' / ' + fmt(unit.effectiveSpd));
        html += line('视野 / 转头', fmt(unit.vision) + ' / ' + fmt(unit.headTurn));
        html += line('步幅 / 肢体', fmt(unit.step) + ' / ' + fmt(unit.limbMove));
        html += line('控制 / 转圈', fmt(unit.moveControl) + ' / ' + fmt(unit.spin));
        if (unit.perception) {
            html += line('听力 / 警觉', fmt(unit.perception.hearingRange) + ' / ' + fmt(unit.perception.awareness));
            html += line('声音感知', (unit.perception.detectedBySound ? '捕获' : '未捕获') + ' / 置信' + fmt(unit.perception.soundConfidence || 0));
            html += line('声音方位', unit.perception.lastKnownTargetX == null ? '未知' : ('x=' + unit.perception.lastKnownTargetX + ' y=' + (unit.perception.lastKnownTargetY == null ? '?' : unit.perception.lastKnownTargetY) + (unit.perception.misledByFakeSound ? ' 假声' : '')));
        }
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

    function sideName(side) {
        return side === 'left' ? '左方宠物' : side === 'right' ? '右方宠物' : '未知宠物';
    }

    function skillName(code) {
        var names = {
            quick_snap: '快速咬击', bite: '撕咬', combo_bite: '连击撕咬', heavy_bite: '重咬', guard: '防御架势', brace: '稳固防御',
            retreat_step: '后撤步', flank_step: '绕后步', fake_sound: '假声诱导', tail_decoy: '断尾诱饵', listen_alert: '警觉聆听', search_sound: '声音搜索',
            move: '移动', fast_move: '快速突进', flee: '撤退', dodge: '闪避',
            scratch: '利爪抓击', tail_whip: '尾鞭横扫', camouflage: '伪装潜伏', venom_spit: '毒液喷吐',
            iron_hide: '铁皮硬化', dragon_rush: '龙形冲撞', regen: '再生恢复', predator_eye: '掠食者凝视',
            flame_breath: '火焰吐息', gale_slash: '疾风斩', shadow_step: '影步', heal: '治疗'
        };
        return names[code] || code || '普通行动';
    }

    function partName(part) {
        return bodyPartNames[part] || ({ head: '头部', body: '躯干', tail: '尾部', leg_fl: '左前肢', leg_fr: '右前肢', leg_bl: '左后肢', leg_br: '右后肢' }[part]) || part || '身体';
    }

    function zoneName(zone) {
        return ({ front: '正面', side: '侧面', rear: '背后' }[zone]) || zone || '未知角度';
    }

    function stateName(st) {
        return ({ aggressive: '主动进攻', kiting: '保持距离', defensive: '防守周旋', fear: '恐惧退避', free: '自由活动' }[st]) || st || '观察';
    }

    function soundName(type) {
        return ({ footstep: '脚步声', scramble: '失衡摩擦声', fake_skill_sound: '技能假声', hit: '命中声', crit: '暴击声' }[type]) || type || '声音';
    }

    function describeEvent(e) {
        e = e || {};
        var frame = e.frame || e.startFrame || e.impactFrame || (state ? state.frame : 0);
        var src = e.src || e.actor || '';
        var tgt = e.tgt || e.target || '';
        var prefix = '[' + frame + '] ';
        if (e.type === 'action_phase') return prefix + sideName(src) + '进入动作阶段：' + skillName(e.actionId) + '，起手/命中/恢复帧 ' + e.startFrame + '/' + e.impactFrame + '/' + e.endFrame + '。';
        if (e.type === 'strategy_intent') return prefix + sideName(src) + '策略意图切换为' + strategyName(e.intent) + '（' + (e.reason || '-') + '）。';
        if (e.type === 'guard_block') return prefix + sideName(tgt) + '使用' + skillName(e.defenseAction) + '格挡' + sideName(src) + '，减免 ' + fmt(e.blockedDamage || 0) + ' 点伤害。';
        if (e.type === 'counter') return prefix + sideName(tgt) + '抓住反制窗口，反制' + sideName(src) + '。';
        if (e.type === 'sound') {
            return prefix + sideName(e.realSource || src) + (e.fake ? '制造' : '发出') + soundName(e.soundType) + '，音量 ' + fmt(e.volume || 0) + '，传播半径 ' + fmt(e.radius || 0) + (e.fake ? '，试图误导对手。' : '。');
        }
        if (e.type === 'perception') {
            return prefix + sideName(src) + (e.fake ? '被假声误导' : '听到' + sideName(tgt) + '的动静') + '，判断方向为' + (e.direction || '未知') + '，置信度 ' + fmt(e.confidence || 0) + '。';
        }
        if (e.type === 'movement') {
            var verb = e.fast ? '快速冲刺' : '调整位置';
            return prefix + sideName(src) + '决定' + verb + '，执行' + skillName(e.actionId) + '，速度 ' + fmt(e.speed || 0) + '。';
        }
        if (e.type === 'combat_action') {
            var result = e.result || {};
            var action = skillName(e.actionId);
            if (result.dodged) return prefix + sideName(src) + '发动' + action + '，但' + sideName(tgt) + (result.decoy ? '用断尾诱饵骗过攻击。' : '成功闪避。');
            if (!result.hit) return prefix + sideName(src) + '尝试' + action + '，没有造成有效伤害。';
            return prefix + sideName(src) + '发动' + action + '，' + (result.crit ? '暴击' : '命中') + sideName(tgt) + '的' + partName(result.part || e.targetPart) + '，造成 ' + fmt(result.damage || 0) + ' 点伤害' + (result.blocked ? '（格挡减免' + fmt(result.blockedDamage || 0) + '）' : '') + (result.countered ? '（触发反制）' : '') + (result.attackZone ? '（' + zoneName(result.attackZone) + '攻击）' : '') + (e.targetTactic ? '，战术：' + tacticName(e.targetTactic) : '') + '。';
        }
        if (e.type === 'hit' || e.type === 'crit') {
            return prefix + sideName(src) + (e.type === 'crit' ? '打出暴击，' : '命中，') + '击中' + sideName(tgt) + '的' + partName(e.part) + '，造成 ' + fmt(e.dmg || 0) + ' 点伤害' + (e.attackZone ? '（' + zoneName(e.attackZone) + '）' : '') + '。';
        }
        if (e.type === 'skill_hit') {
            return prefix + sideName(src) + '释放' + skillName(e.skill) + '，' + (e.crit ? '暴击命中' : '命中') + sideName(tgt) + '的' + partName(e.part) + '，造成 ' + fmt(e.dmg || 0) + ' 点技能伤害' + (e.blocked ? '（格挡减免' + fmt(e.blockedDamage || 0) + '）' : '') + (e.countered ? '（触发反制）' : '') + (e.attackZone ? '（' + zoneName(e.attackZone) + '攻击）' : '') + (e.targetTactic ? '，战术：' + tacticName(e.targetTactic) : '') + '。';
        }
        if (e.type === 'heal') return prefix + sideName(src) + '释放' + skillName(e.skill) + '，恢复约 ' + fmt(e.amt || 0) + ' 点生命。';
        if (e.type === 'buff') return prefix + sideName(src) + '释放' + skillName(e.skill) + '，获得' + (e.effect || '强化') + '效果。';
        if (e.type === 'fear') return prefix + sideName(src) + '释放' + skillName(e.skill) + '，震慑' + sideName(tgt) + '，恐惧值增加 ' + fmt(e.fear || 0) + '。';
        if (e.type === 'dodge' || e.type === 'tail_decoy') return prefix + sideName(src) + (e.type === 'tail_decoy' ? '断尾制造诱饵，骗过' : '闪避了') + sideName(tgt) + '的攻击。';
        if (e.type === 'tail_detach') return prefix + sideName(src) + '尾部脱落，留下诱饵。';
        if (e.type === 'limb_detach') return prefix + sideName(src) + '的' + partName(e.part) + '受创脱落。';
        if (e.type === 'spin') return prefix + sideName(src) + '移动失衡，原地打转并发出声响。';
        if (e.type === 'flee') return prefix + sideName(src) + '因恐惧或劣势选择撤退。';
        if (e.type === 'perception_action') return prefix + sideName(src) + (e.cause && e.cause.fake ? '转向假声位置搜索。' : '根据声音转向目标位置。');
        if (e.type === 'visual_fx') return prefix + '画面表现：' + (e.fxId === 'skill_glow' ? '技能光效' : e.fxId === 'crit_hit' ? '暴击冲击' : e.fxId === 'hit_flash' ? '命中闪光' : e.fxId === 'dodge_spark' ? '闪避火花' : e.fxId === 'fake_sound_wave' ? '假声波纹' : e.fxId === 'sound_wave' ? '声波扩散' : (e.fxId || '特效')) + '。';
        return prefix + sideName(src) + '执行' + stateName(e.type) + (tgt ? '，目标是' + sideName(tgt) : '') + '。';
    }

    function selectedPersonalities() {
        return {
            leftPersonality: readCustomPersonality('left'),
            rightPersonality: readCustomPersonality('right'),
            randomPersonality: !!(randomPersonality && randomPersonality.checked)
        };
    }

    function personalityOptions(presets) {
        var keys = Object.keys(presets || {});
        return keys.map(function (k) { return '<option value="' + k + '">' + (presets[k].name || k) + '</option>'; }).join('');
    }

    function rememberPersonalities() {
        if (leftPersonality) localStorage.setItem('rg_battle_left_personality', leftPersonality.value);
        if (rightPersonality) localStorage.setItem('rg_battle_right_personality', rightPersonality.value);
        if (randomPersonality) localStorage.setItem('rg_battle_random_personality', randomPersonality.checked ? '1' : '0');
        saveCustomPersonalities();
    }

    function traceText(trace) {
        return Object.keys(trace || {}).map(function (k) { return k + ':' + trace[k]; }).join(' / ');
    }

    function topEntries(obj, limit) {
        return Object.keys(obj || {}).map(function (k) {
            var v = obj[k];
            var score = typeof v === 'object' ? (Number(v.avgDamage || v.damage || 0) + Number(v.avgAttempts || v.attempts || 0)) : Number(v || 0);
            return { key: k, value: v, score: score };
        }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 4);
    }

    function keyedText(obj, limit) {
        var rows = topEntries(obj, limit || 6).map(function (item) { return item.key + ':' + fmt(item.value); });
        return rows.length ? rows.join(' / ') : '-';
    }

    function targetPartsText(obj) {
        var rows = topEntries(obj, 5).map(function (item) {
            var v = item.value || {};
            return partName(item.key) + ' 次' + fmt(v.avgAttempts || v.attempts || 0) + ' 伤' + fmt(v.avgDamage || v.damage || 0);
        });
        return rows.length ? rows.join(' / ') : '-';
    }

    function economyText(e) {
        e = e || {};
        return '耗' + fmt(e.spent || 0) + ' / 回' + fmt(e.recovered || 0) + ' / 拦' + fmt(e.blockedByStamina || 0);
    }

    function modelText(m) {
        m = m || {};
        return '攻' + fmt(m.aggression || 0) + ' 防' + fmt(m.defense || 0) + ' 机' + fmt(m.mobility || 0) + ' 诈' + fmt(m.deception || 0) + ' 察' + fmt(m.observation || 0);
    }

    function strategyName(code) {
        return ({ pressure: '压制', execute: '处决', defend: '防御', kite: '拉扯', ambush: '绕后', bait: '诱骗', observe: '观察', recover: '恢复', fear: '恐惧', idle: '待机' }[code]) || code || '-';
    }

    function tacticName(code) {
        return ({ core_kill: '核心击杀', disable_sense: '破坏感知', cripple_mobility: '削弱机动', remove_decoy: '移除诱饵' }[code]) || code || '-';
    }

    function renderBattleReport(data) {
        if (!battleReport || !data) return;
        var left = data.detail && data.detail.left || {};
        var right = data.detail && data.detail.right || {};
        var samples = data.detail && data.detail.samples || [];
        var delta = Math.abs((data.leftRate || 0) - (data.rightRate || 0));
        var balance = delta <= 10 ? '胜率接近平衡' : (data.leftRate > data.rightRate ? '左方优势明显，建议检查左方属性/技能收益' : '右方优势明显，建议检查右方属性/技能收益');
        battleReport.classList.remove('muted');
        battleReport.innerHTML = [
            '<div class="report-title">详细战斗报告</div>',
            '<div class="report-grid">',
            '<div><b>左方性格</b><span>' + (data.leftPersonality && data.leftPersonality.name || '-') + '</span></div>',
            '<div><b>右方性格</b><span>' + (data.rightPersonality && data.rightPersonality.name || '-') + '</span></div>',
            '<div><b>左均命中/暴击/技能</b><span>' + fmt(left.avgHits || 0) + ' / ' + fmt(left.avgCrits || 0) + ' / ' + fmt(left.avgSkills || 0) + '</span></div>',
            '<div><b>右均命中/暴击/技能</b><span>' + fmt(right.avgHits || 0) + ' / ' + fmt(right.avgCrits || 0) + ' / ' + fmt(right.avgSkills || 0) + '</span></div>',
            '<div><b>左均剩余HP</b><span>' + fmt(left.avgHpLeft || 0) + '</span></div>',
            '<div><b>右均剩余HP</b><span>' + fmt(right.avgHpLeft || 0) + '</span></div>',
            '<div><b>左防御/反制</b><span>格挡 ' + fmt(left.avgBlocks || 0) + ' · 减伤 ' + fmt(left.avgBlockedDamage || 0) + ' · 反制 ' + fmt(left.avgCounters || 0) + '</span></div>',
            '<div><b>右防御/反制</b><span>格挡 ' + fmt(right.avgBlocks || 0) + ' · 减伤 ' + fmt(right.avgBlockedDamage || 0) + ' · 反制 ' + fmt(right.avgCounters || 0) + '</span></div>',
            '<div><b>左体力经济</b><span>消耗 ' + fmt(left.avgStaminaSpent || 0) + ' · 不足拦截 ' + fmt(left.avgStaminaBlocked || 0) + '</span></div>',
            '<div><b>右体力经济</b><span>消耗 ' + fmt(right.avgStaminaSpent || 0) + ' · 不足拦截 ' + fmt(right.avgStaminaBlocked || 0) + '</span></div>',
            '<div><b>左攻击角度</b><span>前/侧/后 ' + ((left.angle && left.angle.front) || 0) + ' / ' + ((left.angle && left.angle.side) || 0) + ' / ' + ((left.angle && left.angle.rear) || 0) + ' · 绕后均分 ' + fmt(left.angle && left.angle.avgFlankScore || 0) + '</span></div>',
            '<div><b>右攻击角度</b><span>前/侧/后 ' + ((right.angle && right.angle.front) || 0) + ' / ' + ((right.angle && right.angle.side) || 0) + ' / ' + ((right.angle && right.angle.rear) || 0) + ' · 绕后均分 ' + fmt(right.angle && right.angle.avgFlankScore || 0) + '</span></div>',
            '</div>',
            '<div class="report-line"><b>左AI状态分布</b><span>' + traceText(left.aiTraceAvg) + '</span></div>',
            '<div class="report-line"><b>右AI状态分布</b><span>' + traceText(right.aiTraceAvg) + '</span></div>',
            '<div class="report-line"><b>左策略意图</b><span>' + traceText(left.strategyAvg) + '</span></div>',
            '<div class="report-line"><b>右策略意图</b><span>' + traceText(right.strategyAvg) + '</span></div>',
            '<div class="report-line"><b>左部位战术</b><span>' + keyedText(left.targetTacticsAvg) + ' · ' + targetPartsText(left.targetPartsAvg) + '</span></div>',
            '<div class="report-line"><b>右部位战术</b><span>' + keyedText(right.targetTacticsAvg) + ' · ' + targetPartsText(right.targetPartsAvg) + '</span></div>',
            '<div class="report-line"><b>左信息博弈</b><span>' + keyedText(left.infoAvg) + '</span></div>',
            '<div class="report-line"><b>右信息博弈</b><span>' + keyedText(right.infoAvg) + '</span></div>',
            '<div class="report-line"><b>左对手模型</b><span>' + modelText(left.opponentModelAvg) + ' · 意图 ' + traceText(left.opponentModelAvg && left.opponentModelAvg.intentTraceAvg) + '</span></div>',
            '<div class="report-line"><b>右对手模型</b><span>' + modelText(right.opponentModelAvg) + ' · 意图 ' + traceText(right.opponentModelAvg && right.opponentModelAvg.intentTraceAvg) + '</span></div>',
            '<div class="report-line"><b>角度收益</b><span>左后方伤害 ' + fmt(left.angle && left.angle.rearDamage || 0) + ' / 右后方伤害 ' + fmt(right.angle && right.angle.rearDamage || 0) + '</span></div>',
            '<div class="report-line"><b>平衡提示</b><span>' + balance + '</span></div>',
            '<div class="sample-list">' + samples.map(function (s) { return '<span>#' + s.index + ' ' + s.leftAi + ' vs ' + s.rightAi + ' → ' + s.winner + ' ' + s.duration + 's 伤害 ' + s.leftDamage + '/' + s.rightDamage + '</span>'; }).join('') + '</div>'
        ].join('');
    }

    function currentMapConfig() {
        if (state && state.mapConfig) return state.mapConfig;
        var id = state && state.map || (mapId && mapId.value) || 'grassland';
        return mapConfigs[id] || mapList[0] || { id: id, name: id, width: 800, height: 600, margin: 20, terrain: 'grass', soundSurface: 'grass' };
    }

    function arenaRect(w, h, map) {
        map = map || currentMapConfig();
        var mw = Math.max(200, Number(map.width) || 800);
        var mh = Math.max(200, Number(map.height) || 600);
        var padX = 40;
        var padTop = 72;
        var padBottom = 64;
        var availableW = Math.max(220, w - padX * 2);
        var availableH = Math.max(180, h - padTop - padBottom);
        var scale = Math.min(availableW / mw, availableH / mh);
        var drawW = mw * scale;
        var drawH = mh * scale;
        return { x: (w - drawW) / 2, y: padTop + (availableH - drawH) / 2, w: drawW, h: drawH, scale: scale, map: map, mw: mw, mh: mh };
    }

    function worldToCanvas(point, w, h, map) {
        var r = arenaRect(w, h, map);
        var x = Number(point && point.x);
        var y = Number(point && point.y);
        if (!Number.isFinite(x)) x = r.mw / 2;
        if (!Number.isFinite(y)) y = r.mh / 2;
        return {
            x: r.x + Math.max(0, Math.min(r.mw, x)) / r.mw * r.w,
            y: r.y + Math.max(0, Math.min(r.mh, y)) / r.mh * r.h
        };
    }

    function drawArena(w, h, map) {
        var r = arenaRect(w, h, map);
        ctx.save();
        ctx.fillStyle = '#070a12';
        ctx.fillRect(0, 0, w, h);
        var grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        grad.addColorStop(0, 'rgba(22,35,54,.82)');
        grad.addColorStop(1, 'rgba(8,17,28,.92)');
        ctx.fillStyle = grad;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#26364f';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        var margin = Math.max(16, Number(r.map.margin) || 20);
        var innerA = worldToCanvas({ x: margin, y: margin }, w, h, r.map);
        var innerB = worldToCanvas({ x: r.mw - margin, y: r.mh - margin }, w, h, r.map);
        ctx.strokeStyle = 'rgba(88,166,255,.22)';
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(innerA.x, innerA.y, innerB.x - innerA.x, innerB.y - innerA.y);
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(139,148,158,.18)';
        ctx.lineWidth = 1;
        for (var gx = 100; gx < r.mw; gx += 100) {
            var gpX = worldToCanvas({ x: gx, y: 0 }, w, h, r.map).x;
            ctx.beginPath(); ctx.moveTo(gpX, r.y); ctx.lineTo(gpX, r.y + r.h); ctx.stroke();
        }
        for (var gy = 100; gy < r.mh; gy += 100) {
            var gpY = worldToCanvas({ x: 0, y: gy }, w, h, r.map).y;
            ctx.beginPath(); ctx.moveTo(r.x, gpY); ctx.lineTo(r.x + r.w, gpY); ctx.stroke();
        }
        ctx.fillStyle = '#8b949e';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText((r.map.name || r.map.id || 'arena') + ' · ' + r.mw + '×' + r.mh + ' · 二维平面地图', r.x + 10, r.y + 20);
        ctx.restore();
    }

    function drawTargetMarker(w, h, map, point, label, color) {
        if (!point) return;
        var p = worldToCanvas(point, w, h, map);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
        ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
        ctx.stroke();
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y - 16);
        ctx.restore();
    }

    function drawSimpleUnit(unit, w, h, map, color, label) {
        if (!unit) return;
        var p = worldToCanvas(unit, w, h, map);
        var facing = Number.isFinite(Number(unit.facing)) ? Number(unit.facing) : 0;
        var hpRatio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(facing);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#0d1117';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 28, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(24, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#21262d';
        ctx.fillRect(p.x - 42, p.y - 44, 84, 7);
        ctx.fillStyle = hpRatio > 0.45 ? '#3fb950' : hpRatio > 0.2 ? '#f59e0b' : '#f85149';
        ctx.fillRect(p.x - 42, p.y - 44, 84 * hpRatio, 7);
        ctx.fillStyle = '#c9d1d9';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label + ' ' + Math.round(unit.hp || 0), p.x, p.y - 50);
        if (unit.actionId) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText(unit.actionId, p.x, p.y - 64);
        }
        ctx.restore();
    }

    function drawFallbackUnits(w, h, map, left, right, message) {
        drawSimpleUnit(left, w, h, map, '#3fb950', '左');
        drawSimpleUnit(right, w, h, map, '#f85149', '右');
        if (!message) return;
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '13px sans-serif';
        ctx.fillText(message, 40, 96);
        ctx.restore();
    }

    function drawUnitSpatialDebug(unit, w, h, map, color) {
        if (!unit) return;
        var p = worldToCanvas(unit, w, h, map);
        var facing = Number(unit.facing);
        if (!Number.isFinite(facing)) return;
        var vision = Math.PI * 2 / 3;
        var rear = Math.PI * 2 / 3;
        var arena = arenaRect(w, h, map);
        var visionMult = Number.isFinite(Number(unit.visionMult)) ? Math.max(0.1, Number(unit.visionMult)) : 1;
        var len = Math.max(90, 250 * arena.scale * visionMult);
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, len, facing - vision / 2, facing + vision / 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#f85149';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, len * 0.78, facing + Math.PI - rear / 2, facing + Math.PI + rear / 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(facing) * len, p.y + Math.sin(facing) * len);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(facing) * len, p.y + Math.sin(facing) * len, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawTargetMarker(w, h, map, unit.flankTarget, '绕后', '#d2a8ff');
        drawTargetMarker(w, h, map, unit.protectTarget, '保护', '#f2cc60');
    }

    function drawSpatialDebug(w, h, map, left, right) {
        if (toggleMotionDebug && !toggleMotionDebug.checked) return;
        drawUnitSpatialDebug(left, w, h, map, '#3fb950');
        drawUnitSpatialDebug(right, w, h, map, '#f85149');
    }

    function hintPointFromEvent(e) {
        if (!e) return null;
        if (e.type === 'perception') return { x: e.lastKnownX, y: e.lastKnownY };
        if (e.lookAt) return e.lookAt;
        return null;
    }


    function collectEdgeHints(events) {
        (events || []).forEach(function (e) {
            var label = '';
            var color = '#58a6ff';
            if (e.type === 'perception') { label = e.fake ? '误判' : '捕获'; color = e.fake ? '#d2a8ff' : '#58a6ff'; }
            else if (e.type === 'combat_action') { label = e.actionId || '攻击'; color = '#f59e0b'; }
            if (!label) return;
            edgeHints.push({ point: hintPointFromEvent(e), direction: e.direction, label: label, color: color, life: 36 });
        });
        edgeHints = edgeHints.slice(-12);
    }

    function drawEdgeHints(w, h) {
        var map = currentMapConfig();
        edgeHints = edgeHints.filter(function (hint) { hint.life -= 1; return hint.life > 0; });
        edgeHints.forEach(function (hint, i) {
            var alpha = Math.min(1, hint.life / 24);
            var p = hint.point && (Number.isFinite(Number(hint.point.x)) || Number.isFinite(Number(hint.point.y))) ? worldToCanvas(hint.point, w, h, map) : null;
            if (!p) {
                var dir = hint.direction || 'unknown';
                var left = dir.indexOf('right') < 0;
                p = { x: left ? 38 : w - 38, y: 92 + i * 28 };
            }
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = hint.color;
            ctx.strokeStyle = hint.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 14 + (36 - hint.life) * 0.45, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(hint.label, p.x, p.y - 18);
            ctx.restore();
        });
    }
    function triggerScreenImpact(power) {
        power = Math.max(0, Math.min(1, Number(power) || 0));
        if (power <= 0) return;
        cameraShake.power = Math.max(cameraShake.power, power);
        cameraShake.frames = Math.max(cameraShake.frames, Math.round(8 + power * 16));
        cameraShake.seed = (cameraShake.seed + 1) % 997;
        screenImpact.power = Math.max(screenImpact.power, power);
        screenImpact.life = Math.max(screenImpact.life, Math.round(5 + power * 12));
    }

    function collectImpactEvents(events) {
        (events || []).forEach(function (e) {
            var power = 0;
            if (e.type === 'combat_action' && e.fx && e.fx.cameraShake) power = Number(e.fx.cameraShake) || 0;
            if (e.type === 'visual_fx') {
                if (e.fxId === 'crit_hit') power = Math.max(power, 0.42 * (e.intensity || 1));
                else if (e.fxId === 'skill_glow') power = Math.max(power, 0.28 * (e.intensity || 1));
                else if (e.fxId === 'hit_flash') power = Math.max(power, 0.18 * (e.intensity || 1));
            }
            if (e.type === 'crit' || e.crit || (e.result && e.result.crit)) power = Math.max(power, 0.38);
            triggerScreenImpact(power);
        });
    }

    function resetScreenImpact() {
        cameraShake = { power: 0, frames: 0, seed: 0 };
        screenImpact = { power: 0, life: 0 };
    }

    function getShakeOffset() {
        if (cameraShake.frames <= 0 || cameraShake.power <= 0) return { x: 0, y: 0 };
        var t = cameraShake.frames;
        var amp = cameraShake.power * 18 * (t / (t + 8));
        return {
            x: Math.sin((t + cameraShake.seed) * 2.17) * amp,
            y: Math.cos((t + cameraShake.seed) * 1.73) * amp * 0.65
        };
    }

    function decayScreenImpact() {
        if (cameraShake.frames > 0) cameraShake.frames -= 1;
        else cameraShake.power = Math.max(0, cameraShake.power * 0.72);
        if (screenImpact.life > 0) screenImpact.life -= 1;
        else screenImpact.power = Math.max(0, screenImpact.power * 0.65);
    }

    function drawScreenImpact(w, h) {
        if (screenImpact.power <= 0.02) return;
        var alpha = Math.min(0.32, screenImpact.power * (screenImpact.life + 1) / 18);
        ctx.save();
        ctx.fillStyle = 'rgba(255,248,197,' + alpha + ')';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(248,81,73,' + (alpha * 1.4) + ')';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.restore();
    }

    function isSoundWaveEvent(e) {
        return !!e && (e.type === 'sound' || (e.type === 'visual_fx' && (e.fxId === 'sound_wave' || e.fxId === 'fake_sound_wave')));
    }

    function shouldLogEvent(e) {
        return !!e && !isSoundWaveEvent(e);
    }

    function eventLogKey(e) {
        if (!e) return '';
        return [e.type, e.src || e.actor || '', e.tgt || e.target || '', e.part || '', e.dmg || '', e.actionId || e.fxId || ''].join('|');
    }

    function pushEvents(events) {
        if (!events || !events.length) return;
        var visibleEvents = events.filter(shouldLogEvent);
        if (!visibleEvents.length) return;
        var existingHead = eventLogRows.slice(0, 8).join('\n');
        var rows = visibleEvents.map(function (e) {
            return { key: eventLogKey(e), html: '<div class="event">' + esc(describeEvent(e)) + '</div>' };
        }).filter(function (row, idx, arr) {
            if (!row.key) return true;
            if (idx > 0 && arr[idx - 1].key === row.key) return false;
            return existingHead.indexOf(row.html) < 0;
        }).map(function (row) { return row.html; });
        if (!rows.length) return;
        Array.prototype.unshift.apply(eventLogRows, rows);
        eventLogRows = eventLogRows.slice(0, 80);
        eventLog.innerHTML = eventLogRows.join('');
    }

    function winnerName(winner) {
        if (winner === 'left') return '左方宠物';
        if (winner === 'right') return '右方宠物';
        if (winner === 'draw') return '平局';
        return winner || '未知';
    }

    function finishReasonName(reason) {
        return ({
            both_dead: '双方同时失去战斗能力',
            left_dead: '左方宠物生命值归零',
            right_dead: '右方宠物生命值归零',
            time_limit: '达到最大战斗时长，按剩余生命比例判定',
            unknown: '异常结束：未命中合法结束条件'
        }[reason]) || reason || '异常结束：未命中合法结束条件';
    }

    function inferFinishReason(nextState, summary, left, right) {
        var reason = summary.reason || nextState.reason;
        if (reason && reason !== 'unknown') return reason;
        var frame = summary.totalFrames || nextState.frame || 0;
        var fps = nextState.fps || 30;
        var lhp = left.hpRemaining != null ? left.hpRemaining : left.hp;
        var rhp = right.hpRemaining != null ? right.hpRemaining : right.hp;
        if (lhp <= 0 && rhp <= 0) return 'both_dead';
        if (lhp <= 0) return 'left_dead';
        if (rhp <= 0) return 'right_dead';
        var maxFrames = nextState.maxFrames || fps * 120;
        if (frame >= maxFrames) return 'time_limit';
        return 'unknown';
    }

    function pushBattleSummary(nextState) {
        if (!nextState || !nextState.finished) return;
        var summary = nextState.summary || {};
        var key = (sessionId || 'battle') + ':' + (summary.totalFrames || nextState.frame || 0) + ':' + (summary.winner || nextState.winner || '');
        if (summaryShownKey === key) return;
        summaryShownKey = key;
        var left = summary.left || (nextState.units && nextState.units.left) || {};
        var right = summary.right || (nextState.units && nextState.units.right) || {};
        var duration = summary.duration != null ? summary.duration : Math.ceil((nextState.frame || 0) / (nextState.fps || 30));
        var reason = inferFinishReason(nextState, summary, left, right);
        var rows = [
            '<div class="event"><b>===== 战斗结算报告 =====</b></div>',
            '<div class="event">结束原因：' + esc(finishReasonName(reason)) + '</div>',
            '<div class="event">胜利方：' + esc(winnerName(summary.winner || nextState.winner)) + '</div>',
            '<div class="event">战斗时长：' + esc(duration) + ' 秒（' + esc(summary.totalFrames || nextState.frame || 0) + ' 帧）</div>',
            '<div class="event">左方剩余生命：' + esc(fmt(left.hpRemaining != null ? left.hpRemaining : left.hp)) + ' / ' + esc(fmt(left.hpMax || left.maxHp || 0)) + '</div>',
            '<div class="event">右方剩余生命：' + esc(fmt(right.hpRemaining != null ? right.hpRemaining : right.hp)) + ' / ' + esc(fmt(right.hpMax || right.maxHp || 0)) + '</div>'
        ];
        eventLogRows = rows.concat(eventLogRows).slice(0, 90);
        eventLog.innerHTML = eventLogRows.join('');
    }

    function applyAppearance(appearance) {
        battleAppearance = appearance || { left: null, right: null };
        if (battleAdapter && battleAdapter.setAppearance) battleAdapter.setAppearance(battleAppearance);
    }

    function updateAll(nextState) {
        state = nextState;
        collectImpactEvents(state.events);
        collectEdgeHints(state.events);
        playBattleSounds(state.events);
        pushEvents(state.events);
        if (animator) animator.ingestState(state);
        renderMetrics();
        renderUnit(leftState, state.units.left);
        renderUnit(rightState, state.units.right);
        updateTopHud();
        if (state.finished) {
            var summary = state.summary || {};
            var left = summary.left || (state.units && state.units.left) || {};
            var right = summary.right || (state.units && state.units.right) || {};
            var reason = inferFinishReason(state, summary, left, right);
            if (reason === 'unknown') {
                running = false;
                pushBattleSummary(state);
                winnerBadge.textContent = '战斗异常结束：服务端返回 unknown 结束原因';
                winnerBadge.classList.remove('hidden');
            } else {
                running = false;
                pushBattleSummary(state);
                winnerBadge.textContent = '战斗结束：' + winnerName(state.winner);
                winnerBadge.classList.remove('hidden');
            }
        } else {
            winnerBadge.classList.add('hidden');
        }
        if (!running || state.finished) draw();
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
        var map = currentMapConfig();
        drawArena(w, h, map);
        previewFrame += 1;
        if (!state) {
            var idleShake = getShakeOffset();
            ctx.save();
            ctx.translate(idleShake.x, idleShake.y);
            if (previewActive && battleAdapter && battleAdapter.isReady && battleAdapter.isReady() && battleAdapter.renderPreview) {
                battleAdapter.renderPreview(ctx, { width: w, height: h, frame: previewFrame, map: map });
                if (!toggleMotionDebug || toggleMotionDebug.checked) battleAdapter.drawMotionDebug(ctx);
                ctx.restore();
                ctx.fillStyle = '#8b949e';
                ctx.font = '16px sans-serif';
                ctx.fillText('战斗前自由活动 · 点击开始进入 AI 战斗', 40, 72);
            } else {
                ctx.restore();
                ctx.fillStyle = '#8b949e';
                ctx.font = '18px sans-serif';
                ctx.fillText('输入宠物ID并点击开始，或等待导入预览', 40, 72);
            }
            drawEdgeHints(w, h);
            decayScreenImpact();
            return;
        }
        if (animator) {
            animator.advanceRenderFrame(Math.max(0.7, Math.min(2.2, Number(speed.value || 1) * 0.55)));
        }
        var leftVisual = animator ? animator.getUnitVisual('left', state.units.left) : state.units.left;
        var rightVisual = animator ? animator.getUnitVisual('right', state.units.right) : state.units.right;
        var shake = getShakeOffset();
        ctx.save();
        ctx.translate(shake.x, shake.y);
        var renderSkipped = renderDegradedUntil > 0;
        if (battleAdapter && battleAdapter.isReady && battleAdapter.isReady() && !renderSkipped) {
            try {
                var renderStart = performance.now();
                battleAdapter.render(ctx, { left: leftVisual, right: rightVisual }, { width: w, height: h, map: map });
                if (!toggleMotionDebug || toggleMotionDebug.checked) battleAdapter.drawMotionDebug(ctx);
                var renderCost = performance.now() - renderStart;
                if (renderCost > 32) {
                    renderDegradedUntil = 45;
                    console.warn('[BattleDebug] 正式渲染耗时过高，临时降级为简化绘制', renderCost, state && state.frame);
                }
            } catch (err) {
                renderDegradedUntil = 90;
                console.error('[BattleDebug] 正式渲染异常，已降级为简化绘制', err, state && state.frame);
            }
        }
        if (renderSkipped || renderDegradedUntil > 0 || !battleAdapter || !battleAdapter.isReady || !battleAdapter.isReady()) {
            drawFallbackUnits(w, h, map, leftVisual, rightVisual, renderDegradedUntil > 0 ? '正式渲染临时降级，战斗继续推进' : '正式宠物渲染器不可用');
            if (renderDegradedUntil > 0) renderDegradedUntil -= 1;
        }
        ctx.restore();
        drawSpatialDebug(w, h, map, leftVisual, rightVisual);
        drawEdgeHints(w, h);
        drawScreenImpact(w, h);
        decayScreenImpact();
    }

    function drawFlashes(w, h) {
        flashEvents = flashEvents.filter(function (e) { e.life = (e.life || 18) - 1; return e.life > 0; });
        flashEvents.forEach(function (e, i) {
            var color = '#f59e0b';
            if (e.type === 'perception' || e.type === 'perception_action') color = '#58a6ff';
            else if (e.type === 'movement') color = '#7ee787';
            else if (e.type === 'crit' || e.crit || (e.result && e.result.crit)) color = '#f85149';
            else if (e.type === 'heal') color = '#3fb950';
            ctx.fillStyle = color;
            ctx.font = 'bold 15px sans-serif';
            ctx.fillText(e.type + (e.dmg ? ' -' + e.dmg : '') + (e.result && e.result.damage ? ' -' + e.result.damage : ''), w / 2 - 80 + i * 18, 80 + i * 18);
        });
    }

    function rememberPetIds() {
        if (Number(pet1Id.value) > 0) localStorage.setItem('rg_battle_left_pet_id', String(Number(pet1Id.value)));
        if (Number(pet2Id.value) > 0) localStorage.setItem('rg_battle_right_pet_id', String(Number(pet2Id.value)));
    }

    async function start() {
        stopIdleLoop();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        running = false;
        stepping = false;
        stepStartedAt = 0;
        stepWatchdogShown = false;
        sameFrameResponses = 0;
        lastTick = 0;
        previewActive = false;
        previewKey = '';
        eventLog.innerHTML = '';
        eventLogRows = [];
        summaryShownKey = '';
        stepBacklog = 0;
        flashEvents = [];
        resetScreenImpact();
        edgeHints = [];
        applyAppearance(null);
        updateTopHud();
        if (animator) animator.reset();
        if (battleAdapter) battleAdapter.reset();
        rememberPetIds();
        rememberPersonalities();
        var payload = selectedPersonalities();
        payload.pet1Id = Number(pet1Id.value);
        payload.pet2Id = Number(pet2Id.value);
        payload.mapId = mapId.value;
        var data = await request('/start', payload);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        sessionId = data.sessionId;
        applyAppearance(data.appearance);
        updateAll(data.state);
        running = true;
        loop();
    }

    async function step(frames) {
        if (!sessionId) return;
        var requestSession = sessionId;
        var want = Math.max(1, Math.round(Number(frames) || 1));
        if (stepping) {
            stepBacklog = Math.min(18, stepBacklog + want);
            return;
        }
        stepping = true;
        stepStartedAt = performance.now ? performance.now() : Date.now();
        stepWatchdogShown = false;
        try {
            var data = await request('/step', { sessionId: requestSession, frames: want }, { timeoutMs: 2500 });
            var prevFrame = state && state.frame || 0;
            var respFrame = data.state && data.state.frame || 0;
            if (respFrame <= prevFrame && !(data.state && data.state.finished)) sameFrameResponses += 1;
            else sameFrameResponses = 0;
            if (sameFrameResponses >= 3) {
                running = false;
                stepBacklog = 0;
                throw new Error('战斗步进未推进：服务端连续返回同一帧 ' + respFrame);
            }
            if (requestSession !== sessionId) return;
            updateAll(data.state);
        } finally {
            if (requestSession !== sessionId) return;
            stepping = false;
            stepStartedAt = 0;
            stepWatchdogShown = false;
            if (running && stepBacklog > 0) {
                var next = Math.min(18, stepBacklog);
                stepBacklog = 0;
                step(next).catch(showError);
            }
        }
    }

    function checkStepWatchdog(now) {
        if (!stepping || !stepStartedAt || stepWatchdogShown) return false;
        if (now - stepStartedAt < 3500) return false;
        stepWatchdogShown = true;
        stepBacklog = 0;
        showError(new Error('战斗步进请求超时，请重新开始或降低倍速'));
        return true;
    }

    function loop(ts) {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        draw();
        var now = ts || performance.now();
        if (checkStepWatchdog(now)) return;
        if (!lastTick) lastTick = now;
        var elapsed = now - lastTick;
        if (elapsed >= 90) {
            lastTick = now;
            var frames = Math.max(1, Math.min(8, Math.round(Number(speed.value || 1) * elapsed / 33)));
            step(frames).catch(showError);
        }
    }

    function showError(err) {
        running = false;
        stepping = false;
        stepStartedAt = 0;
        stepBacklog = 0;
        alert(err.message || err);
    }

    async function loadMeta() {
        var data = await request('/meta');
        bodyPartNames = {};
        Object.keys(data.bodyParts || {}).forEach(function (key) { bodyPartNames[key] = data.bodyParts[key].name || key; });
        mapList = data.maps || [];
        mapConfigs = {};
        mapList.forEach(function (m) { if (m && m.id) mapConfigs[m.id] = m; });
        mapId.innerHTML = mapList.map(function (m) { return '<option value="' + m.id + '">' + m.name + ' (' + m.id + ')</option>'; }).join('');
        personalityPresets = data.personalities || {};
        var opts = personalityOptions(personalityPresets);
        if (leftPersonality) {
            leftPersonality.innerHTML = opts;
            leftPersonality.value = localStorage.getItem('rg_battle_left_personality') || 'balanced';
        }
        if (rightPersonality) {
            rightPersonality.innerHTML = opts;
            rightPersonality.value = localStorage.getItem('rg_battle_right_personality') || 'balanced';
        }
        if (randomPersonality) randomPersonality.checked = localStorage.getItem('rg_battle_random_personality') === '1';
        renderPersonalityEditors();
        renderAudioRequirements();
        if (audioEnabled) audioEnabled.checked = localStorage.getItem('rg_battle_audio_enabled') === '1';
        if (audioVolume) audioVolume.value = localStorage.getItem('rg_battle_audio_volume') || audioVolume.value;
        if (audioStatus) audioStatus.textContent = (audioEnabled && audioEnabled.checked ? '音效开启' : '音效关闭') + '；资源目录：client/assets/audio/battle/';
    }

    document.getElementById('btnStart').onclick = function () { start().catch(showError); };
    document.getElementById('btnPause').onclick = function () {
        running = !running;
        if (!running) {
            stepBacklog = 0;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            return;
        }
        lastTick = 0;
        loop();
    };
    document.getElementById('btnStep').onclick = function () { running = false; step(1).catch(showError); };
    document.getElementById('btnReset').onclick = async function () {
        if (!sessionId) return start().catch(showError);
        var data = await request('/reset', { sessionId: sessionId });
        sessionId = data.sessionId;
        stopIdleLoop();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        running = false;
        stepping = false;
        stepStartedAt = 0;
        stepWatchdogShown = false;
        sameFrameResponses = 0;
        lastTick = 0;
        previewActive = false;
        previewKey = '';
        eventLog.innerHTML = '';
        eventLogRows = [];
        summaryShownKey = '';
        stepBacklog = 0;
        flashEvents = [];
        resetScreenImpact();
        if (animator) animator.reset();
        if (battleAdapter) battleAdapter.reset();
        applyAppearance(data.appearance);
        updateAll(data.state);
    };
    document.getElementById('btnEnd').onclick = async function () {
        stopIdleLoop();
        running = false;
        stepping = false;
        stepStartedAt = 0;
        stepWatchdogShown = false;
        stepBacklog = 0;
        if (sessionId) await request('/end', { sessionId: sessionId });
        sessionId = '';
        state = null;
        updateTopHud();
        summaryShownKey = '';
        flashEvents = [];
        resetScreenImpact();
        edgeHints = [];
        if (animator) animator.reset();
        if (battleAdapter) battleAdapter.reset();
        previewKey = '';
        loadPreview().catch(showError);
    };
    document.getElementById('btnBatch').onclick = async function () {
        batchResult.textContent = '运行中...';
        if (battleReport) battleReport.textContent = '详细报告生成中...';
        rememberPetIds();
        rememberPersonalities();
        var payload = selectedPersonalities();
        payload.pet1Id = Number(pet1Id.value);
        payload.pet2Id = Number(pet2Id.value);
        payload.mapId = mapId.value;
        payload.count = Number(document.getElementById('batchCount').value || 20);
        var data = await request('/batch', payload);
        lastBatchReport = data;
        batchResult.innerHTML = '总场次：' + data.count + '<br>左胜率：' + data.leftRate + '% (' + data.left + ')<br>右胜率：' + data.rightRate + '% (' + data.right + ')<br>平局率：' + data.drawRate + '% (' + data.draw + ')<br>平均时长：' + data.avgDuration + 's<br>左/右均伤：' + data.avgDamageLeft + ' / ' + data.avgDamageRight + '<br>左/右均闪避：' + data.avgDodgesLeft + ' / ' + data.avgDodgesRight + '<br>左/右体力消耗：' + fmt(data.detail.left.avgStaminaSpent || 0) + ' / ' + fmt(data.detail.right.avgStaminaSpent || 0) + '<br>左/右格挡反制：' + fmt(data.detail.left.avgBlocks || 0) + '+' + fmt(data.detail.left.avgCounters || 0) + ' / ' + fmt(data.detail.right.avgBlocks || 0) + '+' + fmt(data.detail.right.avgCounters || 0) + '<br>左/右主策略：' + keyedText(data.detail.left.strategyAvg, 3) + ' / ' + keyedText(data.detail.right.strategyAvg, 3) + '<br>左角度 前/侧/后：' + (data.detail.left.angle.front || 0) + ' / ' + (data.detail.left.angle.side || 0) + ' / ' + (data.detail.left.angle.rear || 0) + '<br>右角度 前/侧/后：' + (data.detail.right.angle.front || 0) + ' / ' + (data.detail.right.angle.side || 0) + ' / ' + (data.detail.right.angle.rear || 0);
        renderBattleReport(data);
    };

    if (toggleMotionDebug) toggleMotionDebug.onchange = draw;
    if (pet1Id) pet1Id.onchange = function () { state = null; updateTopHud(); previewKey = ''; loadPreview().catch(showError); };
    if (pet2Id) pet2Id.onchange = function () { state = null; updateTopHud(); previewKey = ''; loadPreview().catch(showError); };
    bindPanelToggle('toggleControlsPanel', 'controlsPanel', 'rg_battle_controls_collapsed');
    bindPanelToggle('toggleInspectPanel', 'inspectPanel', 'rg_battle_inspect_collapsed');
    if (leftPersonality) leftPersonality.onchange = function () { rememberPersonalities(); renderPersonalityEditors(); };
    if (rightPersonality) rightPersonality.onchange = function () { rememberPersonalities(); renderPersonalityEditors(); };
    if (leftCustomPersonality) leftCustomPersonality.onchange = function () { saveCustomPersonalities(); };
    if (rightCustomPersonality) rightCustomPersonality.onchange = function () { saveCustomPersonalities(); };
    if (randomPersonality) randomPersonality.onchange = rememberPersonalities;
    if (audioEnabled) audioEnabled.onchange = function () { localStorage.setItem('rg_battle_audio_enabled', audioEnabled.checked ? '1' : '0'); ensureAudio(); if (audioStatus) audioStatus.textContent = (audioEnabled.checked ? '音效开启' : '音效关闭') + '；资源目录：client/assets/audio/battle/'; };
    if (audioVolume) audioVolume.oninput = function () { localStorage.setItem('rg_battle_audio_volume', audioVolume.value); };
    document.getElementById('btnExportJson').onclick = exportReportJson;
    document.getElementById('btnExportCsv').onclick = exportReportCsv;
    window.addEventListener('resize', resizeCanvas);
    loadMeta().then(function () { resizeCanvas(); renderMetrics(); loadPreview().catch(showError); }).catch(showError);
}());
