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
    var animator = window.BattleAnimator ? new window.BattleAnimator({ contracts: window.BattleActionContracts }) : null;
    var battleAdapter = window.LizardBattleAdapter ? new window.LizardBattleAdapter(canvas, { animator: animator }) : null;
    var battleRenderer = window.LizardBattleRenderer ? new window.LizardBattleRenderer() : null;

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

    function soundPan(e) {
        var map = currentMapConfig();
        var mw = Math.max(200, Number(map && map.width) || 800);
        var x = e && Number.isFinite(Number(e.x)) ? Number(e.x) : mw / 2;
        return Math.max(-1, Math.min(1, (x - mw / 2) / (mw / 2)));
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
            [], ['side', 'avgDamage', 'avgHits', 'avgCrits', 'avgDodges', 'avgSkills', 'avgHpLeft'], ['left', d.detail.left.avgDamage, d.detail.left.avgHits, d.detail.left.avgCrits, d.detail.left.avgDodges, d.detail.left.avgSkills, d.detail.left.avgHpLeft], ['right', d.detail.right.avgDamage, d.detail.right.avgHits, d.detail.right.avgCrits, d.detail.right.avgDodges, d.detail.right.avgSkills, d.detail.right.avgHpLeft],
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

    function describeEvent(e) {
        var frame = e.frame || e.startFrame || e.impactFrame || (state ? state.frame : 0);
        var src = e.src || e.actor || '';
        var tgt = e.tgt || e.target || '';
        var text = '[' + frame + '] ' + e.type + ' ' + src + '→' + tgt;
        if (e.type === 'sound') {
            text += ' ' + e.soundType + ' pos=(' + fmt(e.x) + ',' + fmt(e.y) + ') vol=' + e.volume + ' r=' + e.radius + ' surface=' + e.surface + (e.fake ? ' fake' : '');
        } else if (e.type === 'perception') {
            var vec = e.vector ? ' vec=(' + fmt(e.vector.x) + ',' + fmt(e.vector.y) + ')' : '';
            text += ' ' + e.subtype + ' dir=' + e.direction + ' angle=' + fmt(e.angle) + vec + ' conf=' + e.confidence + ' pos≈(' + fmt(e.lastKnownX) + ',' + fmt(e.lastKnownY) + ')' + (e.fake ? ' fake' : '');
        } else if (e.type === 'movement') {
            text += ' action=' + e.actionId + ' pos=(' + (e.from ? e.from.x : '?') + ',' + (e.from ? e.from.y : '?') + ')→(' + (e.to ? e.to.x : '?') + ',' + (e.to ? e.to.y : '?') + ') speed=' + e.speed + (e.fast ? ' fast' : '');
        } else if (e.type === 'combat_action') {
            var result = e.result || {};
            text += ' action=' + e.actionId + ' hit=' + !!result.hit + ' dmg=' + (result.damage || 0) + (result.part ? ' part=' + result.part : '') + (result.dodged ? ' dodge' : '') + (result.crit ? ' crit' : '');
        } else if (e.type === 'perception_action') {
            text += ' action=' + e.actionId + ' look=(' + (e.lookAt ? fmt(e.lookAt.x) : '?') + ',' + (e.lookAt ? fmt(e.lookAt.y) : '?') + ')' + (e.cause && e.cause.fake ? ' fake' : '');
        } else if (e.type === 'visual_fx') {
            text += ' fx=' + e.fxId + (Number.isFinite(Number(e.x)) || Number.isFinite(Number(e.y)) ? ' pos=(' + fmt(e.x) + ',' + fmt(e.y) + ')' : '') + (e.radius ? ' r=' + e.radius : '') + (e.intensity ? ' intensity=' + fmt(e.intensity) : '');
        } else {
            text += (e.dmg ? ' dmg=' + e.dmg : '') + (e.part ? ' part=' + e.part : '') + (e.skill ? ' skill=' + e.skill : '');
        }
        return text;
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
            '</div>',
            '<div class="report-line"><b>左AI状态分布</b><span>' + traceText(left.aiTraceAvg) + '</span></div>',
            '<div class="report-line"><b>右AI状态分布</b><span>' + traceText(right.aiTraceAvg) + '</span></div>',
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

    function hintPointFromEvent(e) {
        if (!e) return null;
        if (e.type === 'sound' || e.type === 'visual_fx') return { x: e.x, y: e.y };
        if (e.type === 'perception') return { x: e.lastKnownX, y: e.lastKnownY };
        if (e.lookAt) return e.lookAt;
        return null;
    }


    function collectEdgeHints(events) {
        (events || []).forEach(function (e) {
            var label = '';
            var color = '#58a6ff';
            if (e.type === 'sound') { label = e.fake ? '假声' : '声源'; color = e.fake ? '#d2a8ff' : '#58a6ff'; }
            else if (e.type === 'perception') { label = e.fake ? '误判' : '捕获'; color = e.fake ? '#d2a8ff' : '#58a6ff'; }
            else if (e.type === 'combat_action') { label = e.actionId || '攻击'; color = '#f59e0b'; }
            else if (e.type === 'visual_fx' && (e.fxId === 'sound_wave' || e.fxId === 'fake_sound_wave')) { label = e.fxId === 'fake_sound_wave' ? '假声波' : '声波'; color = e.fxId === 'fake_sound_wave' ? '#d2a8ff' : '#58a6ff'; }
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

    function pushEvents(events) {
        if (!events || !events.length) return;
        flashEvents = events.concat(flashEvents).slice(0, 10);
        var rows = events.map(function (e) {
            return '<div class="event">' + describeEvent(e) + '</div>';
        }).join('');
        eventLog.innerHTML = rows + eventLog.innerHTML;
    }

    function applyAppearance(appearance) {
        battleAppearance = appearance || { left: null, right: null };
        if (battleAdapter && battleAdapter.setAppearance) battleAdapter.setAppearance(battleAppearance);
        if (battleRenderer && battleRenderer.setAppearance) battleRenderer.setAppearance(battleAppearance);
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
        if (animator) animator.advanceRenderFrame(Math.max(0.5, Number(speed.value || 1) * 0.28));
        var leftVisual = animator ? animator.getUnitVisual('left', state.units.left) : state.units.left;
        var rightVisual = animator ? animator.getUnitVisual('right', state.units.right) : state.units.right;
        var shake = getShakeOffset();
        ctx.save();
        ctx.translate(shake.x, shake.y);
        if (battleAdapter && battleAdapter.isReady && battleAdapter.isReady()) {
            battleAdapter.render(ctx, { left: leftVisual, right: rightVisual }, { width: w, height: h, map: map });
            if (animator && battleRenderer && battleRenderer.drawVisualFx) {
                battleRenderer.lastAnchors = battleAdapter.lastAnchors;
                battleRenderer.drawVisualFx(ctx, animator.getActiveFx(), { width: w, height: h, map: map, units: { left: leftVisual, right: rightVisual } });
            }
            if (!toggleMotionDebug || toggleMotionDebug.checked) battleAdapter.drawMotionDebug(ctx);
        } else if (battleRenderer) {
            battleRenderer.renderUnit(ctx, leftVisual, { side: 'left', color: '#3fb950', width: w, height: h, map: map, faceRight: true, appearance: battleAppearance.left });
            battleRenderer.renderUnit(ctx, rightVisual, { side: 'right', color: '#f85149', width: w, height: h, map: map, faceRight: false, appearance: battleAppearance.right });
            if (animator && battleRenderer.drawVisualFx) battleRenderer.drawVisualFx(ctx, animator.getActiveFx(), { width: w, height: h, map: map, units: { left: leftVisual, right: rightVisual } });
            if (!toggleMotionDebug || toggleMotionDebug.checked) battleRenderer.drawMotionDebug(ctx);
        } else {
            ctx.fillStyle = '#f85149';
            ctx.font = '16px sans-serif';
            ctx.fillText('正式宠物渲染器不可用：请检查 lizard-renderer.js / lizard-battle-adapter.js 加载顺序', 40, 92);
        }
        ctx.restore();
        drawFlashes(w, h);
        drawEdgeHints(w, h);
        drawScreenImpact(w, h);
        decayScreenImpact();
    }

    function drawFlashes(w, h) {
        flashEvents = flashEvents.filter(function (e) { e.life = (e.life || 18) - 1; return e.life > 0; });
        flashEvents.forEach(function (e, i) {
            var color = '#f59e0b';
            if (e.type === 'perception' || e.type === 'perception_action') color = '#58a6ff';
            else if (e.type === 'sound' || e.fxId === 'sound_wave' || e.fxId === 'fake_sound_wave') color = '#d2a8ff';
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
        previewActive = false;
        previewKey = '';
        eventLog.innerHTML = '';
        flashEvents = [];
        resetScreenImpact();
        edgeHints = [];
        applyAppearance(null);
        if (animator) animator.reset();
        if (battleAdapter) battleAdapter.reset();
        if (battleRenderer) battleRenderer.reset();
        rememberPetIds();
        rememberPersonalities();
        var payload = selectedPersonalities();
        payload.pet1Id = Number(pet1Id.value);
        payload.pet2Id = Number(pet2Id.value);
        payload.mapId = mapId.value;
        var data = await request('/start', payload);
        sessionId = data.sessionId;
        applyAppearance(data.appearance);
        updateAll(data.state);
        running = true;
        loop();
    }

    async function step(frames) {
        if (!sessionId || stepping) return;
        stepping = true;
        try {
            var data = await request('/step', { sessionId: sessionId, frames: frames || 1 });
            updateAll(data.state);
        } finally {
            stepping = false;
        }
    }

    function loop(ts) {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        draw();
        if (!lastTick || (ts || 0) - lastTick >= 80) {
            lastTick = ts || 0;
            step(Math.max(1, Number(speed.value || 1) * 3)).catch(showError);
        }
    }

    function showError(err) {
        running = false;
        stepping = false;
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
    document.getElementById('btnPause').onclick = function () { running = !running; if (running) loop(); };
    document.getElementById('btnStep').onclick = function () { running = false; step(1).catch(showError); };
    document.getElementById('btnReset').onclick = async function () {
        if (!sessionId) return start().catch(showError);
        var data = await request('/reset', { sessionId: sessionId });
        sessionId = data.sessionId;
        stopIdleLoop();
        previewActive = false;
        previewKey = '';
        eventLog.innerHTML = '';
        flashEvents = [];
        resetScreenImpact();
        if (animator) animator.reset();
        if (battleAdapter) battleAdapter.reset();
        if (battleRenderer) battleRenderer.reset();
        applyAppearance(data.appearance);
        updateAll(data.state);
    };
    document.getElementById('btnEnd').onclick = async function () {
        stopIdleLoop();
        running = false;
        if (sessionId) await request('/end', { sessionId: sessionId });
        sessionId = '';
        state = null;
        flashEvents = [];
        resetScreenImpact();
        edgeHints = [];
        if (animator) animator.reset();
        if (battleAdapter) battleAdapter.reset();
        if (battleRenderer) battleRenderer.reset();
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
        batchResult.innerHTML = '总场次：' + data.count + '<br>左胜率：' + data.leftRate + '% (' + data.left + ')<br>右胜率：' + data.rightRate + '% (' + data.right + ')<br>平局率：' + data.drawRate + '% (' + data.draw + ')<br>平均时长：' + data.avgDuration + 's<br>左/右均伤：' + data.avgDamageLeft + ' / ' + data.avgDamageRight + '<br>左/右均闪避：' + data.avgDodgesLeft + ' / ' + data.avgDodgesRight;
        renderBattleReport(data);
    };

    if (toggleMotionDebug) toggleMotionDebug.onchange = draw;
    if (pet1Id) pet1Id.onchange = function () { state = null; previewKey = ''; loadPreview().catch(showError); };
    if (pet2Id) pet2Id.onchange = function () { state = null; previewKey = ''; loadPreview().catch(showError); };
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
