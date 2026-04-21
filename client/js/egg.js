/**
 * 宠物蛋 UI 逻辑
 * - 领蛋 → 展示蛋卡片 → 孵化 → 倒计时 → 天赋分配 → 创建宠物
 * - 纯交互层，不做任何数值计算 (S-A01)
 * - 倒计时由服务端返回 remaining_seconds，前端仅做展示倒数 (S-A02)
 */

'use strict';

const Egg = (() => {
    /* ── 品质配色（仅用于展示） ── */
    const QUALITY_COLORS = { 1: '#AAAAAA', 2: '#55FF55', 3: '#5599FF', 4: '#CC66FF', 5: '#FFAA00' };
    const QUALITY_NAMES  = { 1: '普通', 2: '优秀', 3: '稀有', 4: '史诗', 5: '传说' };
    const GENDER_ICONS   = { 1: '♂', 2: '♀' };
    const GENDER_COLORS  = { 1: '#5599FF', 2: '#FF69B4' };

    /* ── 状态 ── */
    let _currentEgg      = null;
    let _timerInterval   = null;
    let _talentTotal     = 0;
    let _lastCreatedPetId = null;

    /* ── DOM 引用 ── */
    const eggSection     = document.getElementById('eggSection');
    const eggClaim       = document.getElementById('eggClaim');
    const eggCard        = document.getElementById('eggCard');
    const eggIcon        = document.getElementById('eggIcon');
    const eggQuality     = document.getElementById('eggQuality');
    const eggStatus      = document.getElementById('eggStatus');
    const eggTimer       = document.getElementById('eggTimer');
    const eggProgress    = document.getElementById('eggProgress');
    const eggProgressFill = document.getElementById('eggProgressFill');
    const btnStartHatch  = document.getElementById('btnStartHatch');
    const btnFinishHatch = document.getElementById('btnFinishHatch');
    const btnClaimEgg    = document.getElementById('btnClaimEgg');
    const talentPanel    = document.getElementById('talentPanel');
    const talentRemaining = document.getElementById('talentRemaining');
    const btnConfirmTalent = document.getElementById('btnConfirmTalent');
    const petNameInput   = document.getElementById('petNameInput');
    const talentMsg      = document.getElementById('talentMsg');
    const petCreated     = document.getElementById('petCreated');
    const petCreatedTitle = document.getElementById('petCreatedTitle');
    const petCreatedAttrs = document.getElementById('petCreatedAttrs');
    const petCreatedDerived = document.getElementById('petCreatedDerived');
    const btnViewPet     = document.getElementById('btnViewPet');

    /* 宠物面板 DOM */
    const petPanel        = document.getElementById('petPanel');
    const petPanelTitle   = document.getElementById('petPanelTitle');
    const btnBackToEgg    = document.getElementById('btnBackToEgg');
    const petPanelStatus  = document.getElementById('petPanelStatus');
    const petPanelBars    = document.getElementById('petPanelBars');
    const petPanelAttrs   = document.getElementById('petPanelAttrs');
    const petPanelDerived = document.getElementById('petPanelDerived');
    const petPanelSkills  = document.getElementById('petPanelSkills');

    /* 养成面板 DOM (P5) */
    const foodGrid       = document.getElementById('foodGrid');
    const feedMsg        = document.getElementById('feedMsg');
    const btnRest        = document.getElementById('btnRest');
    const restCooldown   = document.getElementById('restCooldown');

    /* 蜕变面板 DOM (P6) */
    const evolveSection  = document.getElementById('evolveSection');
    const evolveInfo     = document.getElementById('evolveInfo');
    const btnEvolve      = document.getElementById('btnEvolve');
    const evolveMsg      = document.getElementById('evolveMsg');
    const evolveOverlay  = document.getElementById('evolveOverlay');
    const evolveAnimText = document.getElementById('evolveAnimText');
    const evolveAnimSkill = document.getElementById('evolveAnimSkill');
    const btnEvolveClose = document.getElementById('btnEvolveClose');

    /* 跑道面板 DOM (P7) */
    const treadmillSection = document.getElementById('treadmillSection');
    const treadmillInfo    = document.getElementById('treadmillInfo');
    const treadmillActions = document.getElementById('treadmillActions');
    const treadmillMsg     = document.getElementById('treadmillMsg');

    /* 售卖面板 DOM (P7) */
    const sellSection = document.getElementById('sellSection');
    const sellInfo    = document.getElementById('sellInfo');
    const btnSellPet  = document.getElementById('btnSellPet');
    const sellMsg     = document.getElementById('sellMsg');

    /* 繁殖面板 DOM (P8) */
    const breedSection  = document.getElementById('breedSection');
    const breedInfo     = document.getElementById('breedInfo');
    const breedActions  = document.getElementById('breedActions');
    const breedMsg      = document.getElementById('breedMsg');
    const marketPanel   = document.getElementById('marketPanel');
    const marketList    = document.getElementById('marketList');
    const marketMsg     = document.getElementById('marketMsg');
    const invitePanel   = document.getElementById('invitePanel');
    const inviteList    = document.getElementById('inviteList');
    const inviteMsg     = document.getElementById('inviteMsg');
    const cagePanel     = document.getElementById('cagePanel');
    const cageInfo      = document.getElementById('cageInfo');
    const cageActions   = document.getElementById('cageActions');
    const cageMsg       = document.getElementById('cageMsg');

    /* 新布局 DOM */
    const sideActions   = document.getElementById('sideActions');
    const hudBottom     = document.getElementById('hudBottom');
    const foodBar       = document.getElementById('foodBar');
    const menuOverlay   = document.getElementById('menuOverlay');
    const btnMenu       = document.getElementById('btnMenu');

    /* 食物定义（展示用，数值以服务端为准） */
    const FOOD_LIST = [
        { code: 'insect',     name: '🦗 昆虫', cost: 5,  desc: '饱食+20 经验+10' },
        { code: 'fruit',      name: '🍎 果实', cost: 10, desc: '饱食+30 经验+15 心情+5' },
        { code: 'meat',       name: '🥩 肉块', cost: 20, desc: '饱食+40 经验+25' },
        { code: 'live_prey',  name: '🦎 活饵', cost: 30, desc: '饱食+25 经验+35' },
        { code: 'spirit_bug', name: '✨ 灵虫', cost: 50, desc: '饱食+15 经验+50 随机属性+1' }
    ];

    /* 同步定时器 */
    let _syncInterval = null;
    let _feedCooldownTimer = null;
    let _lizardRenderer = null;
    let _treadmillTimer = null;

    const talentInputs = {
        str: document.getElementById('talStr'),
        agi: document.getElementById('talAgi'),
        vit: document.getElementById('talVit'),
        int: document.getElementById('talInt'),
        per: document.getElementById('talPer'),
        cha: document.getElementById('talCha')
    };

    /* ── 工具函数 ── */
    function showTalentMsg(text, type = 'error') {
        talentMsg.textContent = text;
        talentMsg.className = `msg ${type}`;
    }

    function formatTime(seconds) {
        if (seconds <= 0) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function hideAll() {
        eggSection.style.display = 'none';
        eggClaim.style.display = 'none';
        eggCard.style.display = 'none';
        talentPanel.style.display = 'none';
        petCreated.style.display = 'none';
        petPanel.style.display = 'none';
        marketPanel.style.display = 'none';
        invitePanel.style.display = 'none';
        cagePanel.style.display = 'none';
        if (document.getElementById('arenaPanel')) document.getElementById('arenaPanel').style.display = 'none';
        if (document.getElementById('battlePanel')) document.getElementById('battlePanel').style.display = 'none';
        if (document.getElementById('historyPanel')) document.getElementById('historyPanel').style.display = 'none';
        if (document.getElementById('attrPanel')) document.getElementById('attrPanel').style.display = 'none';
        if (menuOverlay) menuOverlay.style.display = 'none';
        if (sideActions) sideActions.style.display = 'none';
        if (hudBottom) hudBottom.style.display = 'none';
        btnStartHatch.style.display = 'none';
        btnFinishHatch.style.display = 'none';
        eggTimer.style.display = 'none';
        eggProgress.style.display = 'none';
        feedMsg.textContent = '';
        stopTimer();
        stopSync();
        if (_restCdTimer) { clearInterval(_restCdTimer); _restCdTimer = null; }
        if (_feedCooldownTimer) { clearInterval(_feedCooldownTimer); _feedCooldownTimer = null; }
        if (_treadmillTimer) { clearInterval(_treadmillTimer); _treadmillTimer = null; }
        if (_lizardRenderer) { _lizardRenderer.stop(); }
    }

    /* ── 初始化：登录后调用 ── */
    async function init(user) {
        hideAll();

        /* 未领蛋 → 显示领取按钮 */
        if (user.egg_claimed === 0) {
            eggSection.style.display = 'flex';
            eggClaim.style.display = 'block';
            return;
        }

        /* 已领蛋 → 查询蛋列表 */
        const res = await Api.post('/api/egg/list');
        if (res.code !== 0) return;

        const eggs = res.data.eggs;

        /* 蛋列表为空 → 显示领蛋按钮 */
        if (eggs.length === 0) {
            eggSection.style.display = 'flex';
            eggClaim.style.display = 'block';
            return;
        }

        /* 找到未完全处理的蛋（优先未孵化的） */
        const unhatched = eggs.find(e => e.is_hatched === 0);
        const hatched   = eggs.find(e => e.is_hatched === 1);

        if (unhatched) {
            _currentEgg = unhatched;
            showEggCard(unhatched);

            if (unhatched.hatch_start_at > 0) {
                await pollHatchStatus(unhatched.id);
            }
        } else if (hatched) {
            /* 蛋已孵化 → 检查是否已创建宠物 */
            const petRes = await Api.post('/api/pet/list');
            if (petRes.code === 0 && petRes.data.pets.length > 0) {
                const activePet = petRes.data.pets[0];
                await fetchAndShowPetPanel(activePet.id);
            } else {
                /* 蛋已孵化但未创建宠物 → 进入天赋分配 */
                _currentEgg = hatched;
                await pollHatchStatus(hatched.id);
            }
        }
    }

    /* ── 显示蛋卡片 ── */
    function showEggCard(egg) {
        hideAll();
        eggSection.style.display = 'flex';
        eggCard.style.display = 'block';

        const color = QUALITY_COLORS[egg.quality] || '#AAAAAA';
        const name  = egg.quality_name || QUALITY_NAMES[egg.quality] || '未知';

        eggQuality.textContent = name;
        eggQuality.style.color = color;
        eggIcon.style.filter = `drop-shadow(0 0 8px ${color})`;

        if (egg.hatch_start_at === 0 && egg.is_hatched === 0) {
            eggStatus.textContent = '等待孵化';
            btnStartHatch.style.display = 'block';
        }
    }

    /* ── 领取蛋 ── */
    btnClaimEgg.addEventListener('click', async () => {
        btnClaimEgg.disabled = true;
        const res = await Api.post('/api/egg/claim');
        btnClaimEgg.disabled = false;

        if (res.code !== 0) {
            alert(res.msg);
            return;
        }

        _currentEgg = {
            id: res.data.egg_id,
            quality: res.data.quality,
            quality_name: res.data.quality_name,
            is_hatched: 0,
            hatch_start_at: 0,
            hatch_duration: 0,
            talent_points: 0
        };

        showEggCard(_currentEgg);
    });

    /* ── 开始孵化 ── */
    btnStartHatch.addEventListener('click', async () => {
        if (!_currentEgg) return;
        btnStartHatch.disabled = true;

        const res = await Api.post('/api/hatch/start', { egg_id: _currentEgg.id });
        btnStartHatch.disabled = false;

        if (res.code !== 0) {
            alert(res.msg);
            return;
        }

        btnStartHatch.style.display = 'none';
        startCountdown(res.data.hatch_duration);
    });

    /* ── 倒计时显示 ── */
    function startCountdown(totalSeconds) {
        let remaining = totalSeconds;

        eggStatus.textContent = '孵化中...';
        eggTimer.style.display = 'block';
        eggProgress.style.display = 'block';

        function tick() {
            if (remaining <= 0) {
                stopTimer();
                eggTimer.textContent = '孵化完成！';
                eggProgressFill.style.width = '100%';
                eggStatus.textContent = '孵化完成';
                btnFinishHatch.style.display = 'block';
                return;
            }
            eggTimer.textContent = formatTime(remaining);
            const pct = ((totalSeconds - remaining) / totalSeconds * 100).toFixed(1);
            eggProgressFill.style.width = pct + '%';
            remaining--;
        }

        tick();
        _timerInterval = setInterval(tick, 1000);
    }

    function stopTimer() {
        if (_timerInterval) {
            clearInterval(_timerInterval);
            _timerInterval = null;
        }
    }

    /* ── 轮询孵化状态（从服务端获取权威数据） ── */
    async function pollHatchStatus(eggId) {
        const res = await Api.post('/api/hatch/status', { egg_id: eggId });
        if (res.code !== 0) return;

        const d = res.data;

        if (d.status === 'idle') {
            showEggCard(_currentEgg);
        } else if (d.status === 'hatching') {
            eggCard.style.display = 'block';
            const color = QUALITY_COLORS[_currentEgg.quality] || '#AAAAAA';
            eggQuality.textContent = _currentEgg.quality_name || QUALITY_NAMES[_currentEgg.quality];
            eggQuality.style.color = color;
            eggIcon.style.filter = `drop-shadow(0 0 8px ${color})`;
            startCountdown(d.remaining_seconds);
        } else if (d.status === 'ready') {
            _currentEgg.talent_points = d.talent_points;
            _currentEgg.is_hatched = 1;
            showTalentAllocation(d.talent_points);
        }
    }

    /* ── 天赋分配面板 ── */
    function showTalentAllocation(totalPoints) {
        hideAll();
        eggSection.style.display = 'flex';
        _talentTotal = totalPoints;
        talentPanel.style.display = 'block';

        /* 重置输入 */
        for (const key of Object.keys(talentInputs)) {
            talentInputs[key].value = 0;
            talentInputs[key].max = totalPoints;
        }
        updateTalentRemaining();
    }

    function getUsedPoints() {
        let sum = 0;
        for (const key of Object.keys(talentInputs)) {
            sum += parseInt(talentInputs[key].value, 10) || 0;
        }
        return sum;
    }

    function updateTalentRemaining() {
        const used = getUsedPoints();
        const left = _talentTotal - used;
        talentRemaining.textContent = `可分配点数: ${left} / ${_talentTotal}`;
        talentRemaining.style.color = left === 0 ? '#3fb950' : (left < 0 ? '#f85149' : '#e6edf3');
        btnConfirmTalent.disabled = (left !== 0) || !petNameInput.value.trim();
    }

    /* 监听天赋输入变化 */
    for (const key of Object.keys(talentInputs)) {
        talentInputs[key].addEventListener('input', updateTalentRemaining);
    }
    petNameInput.addEventListener('input', updateTalentRemaining);

    /* ── 点击"孵化完成"按钮 → 查询状态并进入天赋分配 ── */
    btnFinishHatch.addEventListener('click', async () => {
        if (!_currentEgg) return;
        await pollHatchStatus(_currentEgg.id);
    });

    /* ── 确认天赋分配 ── */
    btnConfirmTalent.addEventListener('click', async () => {
        const petName = petNameInput.value.trim();
        if (!petName) return;

        const talents = {};
        for (const key of Object.keys(talentInputs)) {
            talents[key] = parseInt(talentInputs[key].value, 10) || 0;
        }

        /* 前端预校验（最终以服务端为准） */
        const sum = Object.values(talents).reduce((a, b) => a + b, 0);
        if (sum !== _talentTotal) {
            showTalentMsg(`天赋点总和须为 ${_talentTotal}`);
            return;
        }

        btnConfirmTalent.disabled = true;
        const res = await Api.post('/api/hatch/finish', {
            egg_id:   _currentEgg.id,
            pet_name: petName,
            talents
        });
        btnConfirmTalent.disabled = false;

        if (res.code !== 0) {
            showTalentMsg(res.msg);
            return;
        }

        showPetCreated(res.data);
    });

    /* ── 宠物创建成功展示 ── */
    function showPetCreated(pet) {
        hideAll();
        eggSection.style.display = 'flex';
        petCreated.style.display = 'block';

        _lastCreatedPetId = pet.pet_id;

        const color = QUALITY_COLORS[pet.quality] || '#AAAAAA';
        const qName = QUALITY_NAMES[pet.quality] || '未知';
        const gIcon = GENDER_ICONS[pet.gender] || '';
        const gColor = GENDER_COLORS[pet.gender] || '#e6edf3';
        petCreatedTitle.innerHTML = `🦎 <span style="color:${color}">${pet.name}</span> <span style="color:${gColor};font-size:18px">${gIcon}</span> <small style="color:${color}">[${qName}]</small> 诞生了！`;

        /* 六维属性 */
        const attrNames = { str: '力量', agi: '敏捷', vit: '体质', int: '智力', per: '感知', cha: '魅力' };
        let attrHtml = '<div class="attr-grid">';
        for (const [key, label] of Object.entries(attrNames)) {
            const a = pet.attrs[key];
            attrHtml += `<div class="attr-item"><span class="attr-label">${label}</span><span class="attr-val">${a.total}</span><small>(${a.base}+${a.talent})</small></div>`;
        }
        attrHtml += '</div>';
        petCreatedAttrs.innerHTML = attrHtml;

        /* 衍生属性 */
        const d = pet.derived;
        petCreatedDerived.innerHTML = `
            <div class="derived-grid">
                <span>HP ${d.hp_max}</span>
                <span>ATK ${d.atk}</span>
                <span>DEF ${d.def}</span>
                <span>SPD ${d.spd}</span>
                <span>CRIT ${(d.crit_rate / 100).toFixed(1)}%</span>
                <span>DODGE ${(d.dodge_rate / 100).toFixed(1)}%</span>
            </div>`;
    }

    /* ── 查看宠物详情 ── */
    btnViewPet.addEventListener('click', async () => {
        if (!_lastCreatedPetId) return;
        await fetchAndShowPetPanel(_lastCreatedPetId);
    });

    /* ── 返回按钮（关闭宠物详情面板，回到 Canvas 主视图） ── */
    btnBackToEgg.addEventListener('click', () => {
        petPanel.style.display = 'none';
    });

    /* ── 请求宠物详情并展示面板 ── */
    async function fetchAndShowPetPanel(petId) {
        const res = await Api.post('/api/pet/detail', { pet_id: petId });
        if (res.code !== 0) {
            alert(res.msg || '获取宠物详情失败');
            return;
        }
        _lastCreatedPetId = petId;
        showPetPanel(res.data);
    }

    /* ── 渲染宠物信息面板（主视图：Canvas + HUD） ── */
    function showPetPanel(data) {
        hideAll();
        eggSection.style.display = 'none';

        const pet = data.pet;

        /* 更新 HUD 顶栏 */
        renderHudBars(pet);
        const hudPetInfo = document.getElementById('hudPetInfo');
        if (hudPetInfo) {
            hudPetInfo.textContent = `${pet.stage_name} Lv.${pet.level} EXP ${pet.exp}/${pet.exp_next}`;
        }

        /* 显示侧边按钮和底部食物栏 */
        if (sideActions) sideActions.style.display = 'flex';
        if (hudBottom) hudBottom.style.display = 'flex';

        /* 渲染底部食物栏 */
        renderFoodBar();

        /* 缓存宠物面板数据（菜单打开时用） */
        _cachedPetData = data;

        /* 渲染宠物详情面板内容（不显示，菜单打开时才显示） */
        renderPetPanelContent(data);

        /* 启动自动同步（每30秒） */
        startSync(pet.id);

        /* 启动蜥蜴渲染器 — rAF 确保布局完成后再初始化 */
        var gameCanvas = document.getElementById('gameCanvas');
        if (gameCanvas && typeof LizardRenderer !== 'undefined') {
            var _renderData = data;
            requestAnimationFrame(function() {
                if (!_lizardRenderer) {
                    _lizardRenderer = new LizardRenderer(gameCanvas, { activity: 5 });
                }
                if (_renderData.render_params || _renderData.body_seed) {
                    _lizardRenderer.applyRenderParams(_renderData.render_params, _renderData.body_seed);
                }
                _lizardRenderer.toggleAI(true);
                _lizardRenderer.start();
            });
        }
    }

    /* ── 缓存宠物数据 ── */
    let _cachedPetData = null;

    /* ── 更新 HUD 状态条 ── */
    function renderHudBars(pet) {
        const staminaPct = pet.stamina_max > 0 ? (pet.stamina / pet.stamina_max * 100).toFixed(1) : 0;
        const satietyPct = pet.satiety_max > 0 ? (pet.satiety / pet.satiety_max * 100).toFixed(1) : 0;
        const moodPct    = pet.mood;
        const healthMax  = pet.health_max || 100;
        const health     = pet.health !== undefined ? pet.health : healthMax;
        const healthPct  = healthMax > 0 ? (health / healthMax * 100).toFixed(1) : 0;

        const hudStaminaFill = document.getElementById('hudStaminaFill');
        const hudSatietyFill = document.getElementById('hudSatietyFill');
        const hudMoodFill    = document.getElementById('hudMoodFill');
        const hudHealthFill  = document.getElementById('hudHealthFill');
        const hudStaminaVal  = document.getElementById('hudStaminaVal');
        const hudSatietyVal  = document.getElementById('hudSatietyVal');
        const hudMoodVal     = document.getElementById('hudMoodVal');
        const hudHealthVal   = document.getElementById('hudHealthVal');

        if (hudStaminaFill) hudStaminaFill.style.width = staminaPct + '%';
        if (hudSatietyFill) hudSatietyFill.style.width = satietyPct + '%';
        if (hudMoodFill)    hudMoodFill.style.width = moodPct + '%';
        if (hudHealthFill)  hudHealthFill.style.width = healthPct + '%';
        if (hudStaminaVal)  hudStaminaVal.textContent = `${pet.stamina}/${pet.stamina_max}`;
        if (hudSatietyVal)  hudSatietyVal.textContent = `${pet.satiety}/${pet.satiety_max}`;
        if (hudMoodVal)     hudMoodVal.textContent = `${pet.mood}`;
        if (hudHealthVal)   hudHealthVal.textContent = `${health}/${healthMax}`;
    }

    /* ── 渲染底部食物栏 ── */
    function renderFoodBar() {
        if (!foodBar) return;
        let html = '';
        for (const f of FOOD_LIST) {
            html += `<button class="food-btn" data-food="${f.code}">
                <span class="food-name">${f.name}</span>
                <span class="food-cost">\u{1F4B0}${f.cost}</span>
            </button>`;
        }
        foodBar.innerHTML = html;
        foodBar.querySelectorAll('.food-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFeed(btn.dataset.food));
        });
    }

    /* ── 渲染宠物详情面板内容（不显示面板本身） ── */
    function renderPetPanelContent(data) {
        const pet = data.pet;
        const color = QUALITY_COLORS[pet.quality] || '#AAAAAA';
        const qName = pet.quality_name || QUALITY_NAMES[pet.quality] || '未知';
        const gIcon = GENDER_ICONS[pet.gender] || '';
        const gColor = GENDER_COLORS[pet.gender] || '#e6edf3';

        petPanelTitle.innerHTML = `\u{1F98E} <span style="color:${color}">${pet.name}</span> <span style="color:${gColor};font-size:18px">${gIcon}</span> <small style="color:${color}">[${qName}]</small>`;

        petPanelStatus.innerHTML = `
            <div class="pp-status-row">
                <span class="pp-stage">${pet.stage_name}</span>
                <span class="pp-level">Lv.${pet.level}</span>
                <span class="pp-exp">EXP ${pet.exp}/${pet.exp_next}</span>
            </div>`;

        renderBars(pet);

        const attrNames = { str: '\u529B\u91CF', agi: '\u654F\u6377', vit: '\u4F53\u8D28', int: '\u667A\u529B', per: '\u611F\u77E5', cha: '\u9B45\u529B' };
        let attrHtml = '<div class="attr-grid">';
        for (const [key, label] of Object.entries(attrNames)) {
            const a = data.attrs[key];
            attrHtml += `<div class="attr-item"><span class="attr-label">${label}</span><span class="attr-val">${a.total}</span><small>(${a.base}+${a.talent})</small></div>`;
        }
        attrHtml += '</div>';
        petPanelAttrs.innerHTML = attrHtml;

        const d = data.derived;
        petPanelDerived.innerHTML = `
            <div class="derived-grid">
                <span>HP ${d.hp_max}</span>
                <span>ATK ${d.atk}</span>
                <span>DEF ${d.def}</span>
                <span>SPD ${d.spd}</span>
                <span>CRIT ${(d.crit_rate / 100).toFixed(1)}%</span>
                <span>DODGE ${(d.dodge_rate / 100).toFixed(1)}%</span>
            </div>`;

        const SKILL_NAMES = {
            bite: '\u6495\u54AC', scratch: '\u6293\u6320', tail_whip: '\u5C3E\u51FB', camouflage: '\u4F2A\u88C5',
            venom_spit: '\u6BD2\u6DB2\u55B7\u5C04', iron_hide: '\u94C1\u7532', dragon_rush: '\u9F99\u7A81', regen: '\u518D\u751F', predator_eye: '\u63A0\u98DF\u4E4B\u773C'
        };
        if (data.skills && data.skills.length > 0) {
            let skillHtml = '<div class="pp-skill-list">';
            for (const sk of data.skills) {
                const sName = SKILL_NAMES[sk.skill_code] || sk.skill_code;
                const equipped = sk.is_equipped ? ' pp-skill-equipped' : '';
                skillHtml += `<span class="pp-skill-badge${equipped}">${sName} Lv.${sk.skill_level}</span>`;
            }
            skillHtml += '</div>';
            petPanelSkills.innerHTML = '<h4>\u6280\u80FD</h4>' + skillHtml;
        } else {
            petPanelSkills.innerHTML = '<h4>\u6280\u80FD</h4><p class="pp-no-skill">\u6682\u65E0\u6280\u80FD</p>';
        }

        renderFoodGrid();
        renderEvolveSection(data);
        renderTreadmillSection(data.pet);
        renderSellSection(data.pet);
        renderBreedSection(data.pet);
        if (typeof Arena !== 'undefined' && Arena.renderArenaSection) {
            Arena.renderArenaSection(data.pet);
        }
    }

    /* ── 渲染状态条（可独立更新） ── */
    function renderBars(pet) {
        const staminaPct = pet.stamina_max > 0 ? (pet.stamina / pet.stamina_max * 100).toFixed(1) : 0;
        const satietyPct = pet.satiety_max > 0 ? (pet.satiety / pet.satiety_max * 100).toFixed(1) : 0;
        const moodPct    = pet.mood;
        const healthMax  = pet.health_max || 100;
        const health     = pet.health !== undefined ? pet.health : healthMax;
        const healthPct  = healthMax > 0 ? (health / healthMax * 100).toFixed(1) : 0;

        petPanelBars.innerHTML = `
            <div class="pp-bar-item">
                <span class="pp-bar-label">⚡ 体力</span>
                <div class="pp-bar-track"><div class="pp-bar-fill pp-bar-stamina" style="width:${staminaPct}%"></div></div>
                <span class="pp-bar-val">${pet.stamina}/${pet.stamina_max}</span>
            </div>
            <div class="pp-bar-item">
                <span class="pp-bar-label">🍖 饱食</span>
                <div class="pp-bar-track"><div class="pp-bar-fill pp-bar-satiety" style="width:${satietyPct}%"></div></div>
                <span class="pp-bar-val">${pet.satiety}/${pet.satiety_max}</span>
            </div>
            <div class="pp-bar-item">
                <span class="pp-bar-label">💚 健康</span>
                <div class="pp-bar-track"><div class="pp-bar-fill pp-bar-health" style="width:${healthPct}%"></div></div>
                <span class="pp-bar-val">${health}/${healthMax}</span>
            </div>
            <div class="pp-bar-item">
                <span class="pp-bar-label">😊 心情</span>
                <div class="pp-bar-track"><div class="pp-bar-fill pp-bar-mood" style="width:${moodPct}%"></div></div>
                <span class="pp-bar-val">${moodPct}</span>
            </div>`;
    }

    /* ── 渲染食物按钮网格 (P5) ── */
    function renderFoodGrid() {
        let html = '';
        for (const f of FOOD_LIST) {
            html += `
                <button class="food-btn" data-food="${f.code}">
                    <span class="food-name">${f.name}</span>
                    <span class="food-cost">💰${f.cost}</span>
                    <span class="food-desc">${f.desc}</span>
                </button>`;
        }
        foodGrid.innerHTML = html;

        /* 绑定点击事件 */
        foodGrid.querySelectorAll('.food-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFeed(btn.dataset.food));
        });
    }

    /* ── 喂食处理 (P5) ── */
    async function handleFeed(foodCode) {
        if (!_lastCreatedPetId) return;

        /* 禁用所有食物按钮 */
        foodGrid.querySelectorAll('.food-btn').forEach(b => b.disabled = true);
        feedMsg.textContent = '';
        feedMsg.className = 'nurture-msg';

        const res = await Api.post('/api/nurture/feed', {
            pet_id: _lastCreatedPetId,
            food: foodCode
        });

        foodGrid.querySelectorAll('.food-btn').forEach(b => b.disabled = false);

        if (res.code !== 0) {
            feedMsg.textContent = res.msg;
            feedMsg.className = 'nurture-msg error';
            return;
        }

        const d = res.data;
        let msg = `喂食成功！饱食 ${d.satiety.before}→${d.satiety.after}，经验 +${d.exp_gained}${d.level_up ? ' (升级!)' : ''}`;
        if (d.mood_delta > 0) msg += `，心情 +${d.mood_delta}`;
        feedMsg.textContent = msg;
        feedMsg.className = 'nurture-msg success';

        /* 更新金币显示 */
        const goldEl = document.getElementById('userGold');
        if (goldEl) goldEl.textContent = `💰 ${d.gold_remain}`;

        /* 如果升级了，刷新完整面板 */
        if (d.level_up) {
            await fetchAndShowPetPanel(_lastCreatedPetId);
        } else {
            /* 立即同步状态条 */
            await syncAndUpdateBars();
        }
    }

    /* ═══════════════════════════════════════════
     * 蜕变系统 (P6)
     * ═══════════════════════════════════════════ */

    /* 蜕变常量（展示用，逻辑以服务端为准） */
    const STAGE_NAMES  = { 0: '幼体', 1: '少年', 2: '成年', 3: '完全体' };
    const EVOLVE_LEVEL = { 1: 10, 2: 25, 3: 50 };
    const EVOLVE_COST  = { 1: 100, 2: 200, 3: 300 };
    const MAX_STAGE    = { 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 };

    /* 存储当前宠物数据引用（用于蜕变判断） */
    let _currentPetData = null;

    /**
     * 渲染蜕变区域：显示条件与按钮
     * @param {object} data 宠物详情数据
     */
    function renderEvolveSection(data) {
        _currentPetData = data;
        const pet = data.pet;
        const targetStage = pet.stage + 1;
        const maxStage = MAX_STAGE[pet.quality] || 2;

        /* 已达最高阶段 → 隐藏蜕变区 */
        if (targetStage > maxStage) {
            evolveSection.style.display = 'block';
            evolveInfo.innerHTML = '<span class="evolve-max">🏆 已达最高阶段</span>';
            btnEvolve.style.display = 'none';
            evolveMsg.textContent = '';
            return;
        }

        evolveSection.style.display = 'block';
        btnEvolve.style.display = 'inline-block';

        const levelReq = EVOLVE_LEVEL[targetStage] || 99;
        const costReq  = EVOLVE_COST[targetStage] || 999;
        const stageName = STAGE_NAMES[targetStage] || '未知';

        /* 条件检测（前端预判，最终以服务端为准） */
        const levelOk  = pet.level >= levelReq;
        const staminaOk = pet.stamina >= 50;

        const check = (ok) => ok ? '✅' : '❌';

        evolveInfo.innerHTML = `
            <div class="evolve-target">目标：<strong>${stageName}</strong></div>
            <div class="evolve-reqs">
                <span>${check(levelOk)} 等级 ≥ ${levelReq} (当前 ${pet.level})</span>
                <span>${check(staminaOk)} 体力 ≥ 50 (当前 ${pet.stamina})</span>
                <span>💰 消耗 ${costReq} 金币</span>
            </div>`;

        btnEvolve.disabled = false;
        evolveMsg.textContent = '';
    }

    /* ── 蜕变按钮点击 ── */
    btnEvolve.addEventListener('click', async () => {
        if (!_lastCreatedPetId) return;
        btnEvolve.disabled = true;
        evolveMsg.textContent = '';
        evolveMsg.className = 'nurture-msg';

        const res = await Api.post('/api/nurture/evolve', {
            pet_id: _lastCreatedPetId
        });

        if (res.code !== 0) {
            evolveMsg.textContent = res.msg;
            evolveMsg.className = 'nurture-msg error';
            btnEvolve.disabled = false;
            return;
        }

        /* 播放蜕变动画 */
        showEvolveAnimation(res.data);
    });

    /**
     * 显示蜕变成功动画覆盖层
     * @param {object} data 蜕变结果
     */
    function showEvolveAnimation(data) {
        const stageName = STAGE_NAMES[data.stage_after] || data.stage_name;
        const SKILL_NAMES_MAP = {
            bite: '撕咬', scratch: '抓挠', tail_whip: '尾击', camouflage: '伪装',
            venom_spit: '毒液喷射', iron_hide: '铁甲', dragon_rush: '龙突', regen: '再生', predator_eye: '掠食之眼'
        };

        evolveAnimText.innerHTML = `
            <div class="evolve-result-title">🎉 蜕变成功！</div>
            <div class="evolve-result-stage">${STAGE_NAMES[data.stage_before] || '?'} → <strong>${stageName}</strong></div>
            <div class="evolve-result-details">
                <span>体力上限 +${data.stamina_max_new - (data.stamina_max_new - 20)}</span>
                <span>饱食上限 +${data.satiety_max_new - (data.satiety_max_new - 10)}</span>
                <span>六维属性 各+${data.attr_bonus}</span>
                <span>等级上限 → ${data.level_cap_new}</span>
            </div>`;

        if (data.skill_unlocked) {
            const skillName = SKILL_NAMES_MAP[data.skill_unlocked] || data.skill_unlocked;
            evolveAnimSkill.innerHTML = `<div class="evolve-skill-unlock">🌟 解锁新技能：<strong>${skillName}</strong></div>`;
            evolveAnimSkill.style.display = 'block';
        } else {
            evolveAnimSkill.innerHTML = '';
            evolveAnimSkill.style.display = 'none';
        }

        evolveOverlay.style.display = 'flex';

        /* 更新金币 */
        const goldEl = document.getElementById('userGold');
        if (goldEl) goldEl.textContent = `💰 ${data.gold_remain}`;
    }

    /* ── 蜕变动画关闭 ── */
    btnEvolveClose.addEventListener('click', async () => {
        evolveOverlay.style.display = 'none';
        /* 刷新完整面板 */
        await fetchAndShowPetPanel(_lastCreatedPetId);
    });

    /* ── 休息按钮 (P5) ── */
    btnRest.addEventListener('click', async () => {
        if (!_lastCreatedPetId) return;
        btnRest.disabled = true;

        const res = await Api.post('/api/nurture/rest', {
            pet_id: _lastCreatedPetId
        });

        if (res.code !== 0) {
            feedMsg.textContent = res.msg;
            feedMsg.className = 'nurture-msg error';
            btnRest.disabled = false;
            return;
        }

        const d = res.data;
        feedMsg.textContent = `休息成功！体力 ${d.stamina.before}→${d.stamina.after}`;
        feedMsg.className = 'nurture-msg success';

        /* 同步状态条 */
        await syncAndUpdateBars();

        /* 显示冷却倒计时 */
        startRestCooldown(30 * 60);
    });

    /* ── 休息冷却倒计时 (P5) ── */
    let _restCdTimer = null;
    function startRestCooldown(seconds) {
        btnRest.disabled = true;
        let remaining = seconds;

        function tick() {
            if (remaining <= 0) {
                clearInterval(_restCdTimer);
                _restCdTimer = null;
                btnRest.disabled = false;
                restCooldown.textContent = '';
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            restCooldown.textContent = `${m}:${String(s).padStart(2, '0')}`;
            remaining--;
        }

        if (_restCdTimer) clearInterval(_restCdTimer);
        tick();
        _restCdTimer = setInterval(tick, 1000);
    }

    /* ── 自动同步 (P5) ── */
    function startSync(petId) {
        stopSync();
        _syncInterval = setInterval(() => syncAndUpdateBars(), 30000);
    }

    function stopSync() {
        if (_syncInterval) {
            clearInterval(_syncInterval);
            _syncInterval = null;
        }
    }

    async function syncAndUpdateBars() {
        if (!_lastCreatedPetId) return;
        const res = await Api.post('/api/pet/sync', { pet_id: _lastCreatedPetId });
        if (res.code !== 0) return;

        const d = res.data;
        const petSync = {
            stamina: d.stamina, stamina_max: d.stamina_max,
            satiety: d.satiety, satiety_max: d.satiety_max,
            mood: d.mood,
            health: d.health, health_max: d.health_max
        };
        renderBars(petSync);
        renderHudBars(petSync);

        /* 更新金币 */
        const goldEl = document.getElementById('userGold');
        if (goldEl) goldEl.textContent = `\u{1F4B0} ${d.gold}`;
    }

    /* ═══════════════════════════════════════════
     * 跑道系统 (P7)
     * ═══════════════════════════════════════════ */

    const TREADMILL_TIERS = {
        1: { name: '初级跑道', install_cost: 0,   gold_per_min: 12, daily_cap: 300 },
        2: { name: '中级跑道', install_cost: 30,  gold_per_min: 15, daily_cap: 400 },
        3: { name: '高级跑道', install_cost: 100, gold_per_min: 20, daily_cap: 550 },
        4: { name: '超级跑道', install_cost: 300, gold_per_min: 30, daily_cap: 800 }
    };

    /**
     * 渲染跑道区域
     * @param {object} pet 宠物数据
     */
    async function renderTreadmillSection(pet) {
        treadmillSection.style.display = 'block';
        treadmillMsg.textContent = '';
        treadmillMsg.className = 'nurture-msg';

        const res = await Api.post('/api/treadmill/status', { pet_id: pet.id });
        if (res.code !== 0) {
            treadmillInfo.innerHTML = '<span style="color:#f85149">跑道状态获取失败</span>';
            return;
        }

        const d = res.data;

        if (!d.installed) {
            /* 未安装跑道 */
            treadmillInfo.innerHTML = '<p>尚未安装跑道，安装后宠物可以跑步产金</p>';
            treadmillActions.innerHTML = `<button class="btn btn-tm" id="btnTmInstall">🔧 安装初级跑道 (免费)</button>`;
            document.getElementById('btnTmInstall').addEventListener('click', () => handleTmInstall(pet.id, 1));
            return;
        }

        /* 已安装 */
        const pct = d.daily_cap > 0 ? (d.collected_today / d.daily_cap * 100).toFixed(1) : 0;
        let infoHtml = `<div class="tm-tier">🏃 ${d.tier_name} · ${d.gold_per_min}金/分钟</div>`;
        infoHtml += `<div class="tm-progress">
            <span>今日 ${d.collected_today}/${d.daily_cap}</span>
            <div class="tm-bar-track"><div class="tm-bar-fill" style="width:${pct}%"></div></div>
        </div>`;

        if (d.is_running) {
            infoHtml += `<div class="tm-running">⚡ 跑道运行中...</div>`;
            _startTreadmillTimer(d.started_at);
            if (_lizardRenderer) _lizardRenderer.setTreadmill(true);
        } else {
            if (_lizardRenderer) _lizardRenderer.setTreadmill(false);
        }

        treadmillInfo.innerHTML = infoHtml;

        /* 操作按钮 */
        let actHtml = '';
        if (d.is_running) {
            actHtml += `<button class="btn btn-tm btn-tm-collect" id="btnTmCollect">💰 收集金币</button>`;
        } else {
            actHtml += `<button class="btn btn-tm" id="btnTmStart">▶ 开始跑步</button>`;
        }
        if (d.tier < 4) {
            const nextTier = TREADMILL_TIERS[d.tier + 1];
            actHtml += `<button class="btn btn-tm" id="btnTmUpgrade">⬆ 升级${nextTier.name} (💰${nextTier.install_cost})</button>`;
        }
        treadmillActions.innerHTML = actHtml;

        /* 绑定事件 */
        const btnStart = document.getElementById('btnTmStart');
        const btnCollect = document.getElementById('btnTmCollect');
        const btnUpgrade = document.getElementById('btnTmUpgrade');
        if (btnStart) btnStart.addEventListener('click', () => handleTmStart(pet.id));
        if (btnCollect) btnCollect.addEventListener('click', () => handleTmCollect(pet.id));
        if (btnUpgrade) btnUpgrade.addEventListener('click', () => handleTmInstall(pet.id, d.tier + 1));
    }

    function _startTreadmillTimer(startedAt) {
        if (_treadmillTimer) { clearInterval(_treadmillTimer); _treadmillTimer = null; }
        const runningEl = treadmillInfo.querySelector('.tm-running');
        if (!runningEl) return;

        function tick() {
            const elapsed = Math.floor(Date.now() / 1000) - startedAt;
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            runningEl.textContent = `⚡ 跑道运行中... ${m}:${String(s).padStart(2, '0')}`;
        }
        tick();
        _treadmillTimer = setInterval(tick, 1000);
    }

    async function handleTmInstall(petId, tier) {
        const res = await Api.post('/api/treadmill/install', { pet_id: petId, tier });
        if (res.code !== 0) {
            treadmillMsg.textContent = res.msg;
            treadmillMsg.className = 'nurture-msg error';
            return;
        }
        treadmillMsg.textContent = `${res.data.tier_name} 安装成功！`;
        treadmillMsg.className = 'nurture-msg success';
        _updateGold(res.data.gold_remain);
        await renderTreadmillSection({ id: petId });
    }

    async function handleTmStart(petId) {
        const res = await Api.post('/api/treadmill/start', { pet_id: petId });
        if (res.code !== 0) {
            treadmillMsg.textContent = res.msg;
            treadmillMsg.className = 'nurture-msg error';
            return;
        }
        treadmillMsg.textContent = `跑步开始！消耗体力 ${res.data.stamina_cost}`;
        treadmillMsg.className = 'nurture-msg success';
        await syncAndUpdateBars();
        await renderTreadmillSection({ id: petId });
    }

    async function handleTmCollect(petId) {
        if (_treadmillTimer) { clearInterval(_treadmillTimer); _treadmillTimer = null; }
        if (_lizardRenderer) _lizardRenderer.setTreadmill(false);
        const res = await Api.post('/api/treadmill/collect', { pet_id: petId });
        if (res.code !== 0) {
            treadmillMsg.textContent = res.msg;
            treadmillMsg.className = 'nurture-msg error';
            return;
        }
        treadmillMsg.textContent = `收集 ${res.data.gold_earned} 金币！今日 ${res.data.collected_today}/${res.data.daily_cap}`;
        treadmillMsg.className = 'nurture-msg success';
        _updateGold(res.data.gold_remain);
        await renderTreadmillSection({ id: petId });
    }

    function _updateGold(gold) {
        const goldEl = document.getElementById('userGold');
        if (goldEl) goldEl.textContent = `💰 ${gold}`;
    }

    /* ═══════════════════════════════════════════
     * 宠物售卖 (P7)
     * ═══════════════════════════════════════════ */

    /**
     * 渲染售卖区域
     * @param {object} pet 宠物数据
     */
    async function renderSellSection(pet) {
        sellSection.style.display = 'block';
        sellMsg.textContent = '';
        sellMsg.className = 'nurture-msg';
        btnSellPet.disabled = true;

        const res = await Api.post('/api/pet/evaluate', { pet_id: pet.id });
        if (res.code !== 0) {
            sellInfo.innerHTML = '<span style="color:#f85149">评估失败</span>';
            return;
        }

        const d = res.data;
        sellInfo.innerHTML = `
            <p>系统评估 <strong>${d.pet_name}</strong> (Lv.${d.level} 品质${d.quality} 阶段${d.stage} 技能×${d.skill_count})</p>
            <div class="sell-price">💰 售价：${d.sell_price} 金币</div>
            <p style="color:#f85149;margin-top:6px;font-size:12px">⚠ 售卖后宠物将被永久删除，不可恢复</p>`;

        btnSellPet.disabled = false;
        btnSellPet.dataset.petId = pet.id;
        btnSellPet.dataset.petName = d.pet_name;
    }

    btnSellPet.addEventListener('click', async () => {
        const petId = parseInt(btnSellPet.dataset.petId, 10);
        const petName = btnSellPet.dataset.petName || '宠物';
        if (!petId) return;

        if (!confirm(`确定要售卖 ${petName} 吗？此操作不可撤销！`)) return;

        btnSellPet.disabled = true;
        const res = await Api.post('/api/pet/sell', { pet_id: petId });

        if (res.code !== 0) {
            sellMsg.textContent = res.msg;
            sellMsg.className = 'nurture-msg error';
            btnSellPet.disabled = false;
            return;
        }

        sellMsg.textContent = `${res.data.pet_name} 已售出，获得 ${res.data.sell_price} 金币`;
        sellMsg.className = 'nurture-msg success';
        _updateGold(res.data.gold_remain);

        /* 清除宠物引用，回到领蛋界面 */
        _lastCreatedPetId = null;
        if (_lizardRenderer) { _lizardRenderer.stop(); _lizardRenderer = null; }
        setTimeout(() => {
            hideAll();
            eggClaim.style.display = 'block';
        }, 2000);
    });

    /* ═══════════════════════════════════════════
     * P8 繁殖系统 UI
     * ═══════════════════════════════════════════ */

    let _cageTimer = null;
    let _breedPetId = null;

    /**
     * 渲染繁殖区（在宠物面板中）
     */
    async function renderBreedSection(pet) {
        breedSection.style.display = 'block';

        /* 阶段不足 */
        if (pet.stage < 2) {
            breedInfo.innerHTML = '<p style="color:#888">宠物需达到成年阶段才能繁殖</p>';
            breedActions.innerHTML = '';
            return;
        }

        _breedPetId = pet.id;
        const genderIcon = GENDER_ICONS[pet.gender] || '';
        const cooldownInfo = pet.last_breed_at ? '（有冷却限制）' : '';

        breedInfo.innerHTML = `
            <p>${genderIcon} ${pet.name} 可参与繁殖 ${cooldownInfo}</p>`;

        breedActions.innerHTML = `
            <button class="btn btn-breed" id="btnMarketRegister">📋 上架交友市场</button>
            <button class="btn btn-breed" id="btnBrowseMarket">💕 浏览市场</button>
            <button class="btn btn-breed" id="btnViewInvites">📬 查看邀请</button>
            <button class="btn btn-breed" id="btnViewCage">🏠 交配笼</button>`;

        document.getElementById('btnMarketRegister').addEventListener('click', async () => {
            const res = await Api.post('/api/breeding/market/list', { pet_id: pet.id });
            breedMsg.textContent = res.code === 0 ? '已上架交友市场' : res.msg;
            breedMsg.className = `nurture-msg ${res.code === 0 ? 'success' : 'error'}`;
        });

        document.getElementById('btnBrowseMarket').addEventListener('click', () => {
            showMarketPanel(pet);
        });

        document.getElementById('btnViewInvites').addEventListener('click', () => {
            showInvitePanel();
        });

        document.getElementById('btnViewCage').addEventListener('click', () => {
            showCagePanel();
        });
    }

    /**
     * 交友市场面板
     */
    async function showMarketPanel(myPet) {
        petPanel.style.display = 'none';
        marketPanel.style.display = 'flex';
        await loadMarketListings(0, myPet);
    }

    async function loadMarketListings(gender, myPet) {
        const body = {};
        if (gender) body.gender = gender;
        const res = await Api.post('/api/breeding/market/browse', body);
        if (res.code !== 0) {
            marketMsg.textContent = res.msg;
            marketMsg.className = 'nurture-msg error';
            return;
        }

        const listings = res.data.listings;
        if (listings.length === 0) {
            marketList.innerHTML = '<p class="market-empty">暂无可配对的宠物</p>';
            return;
        }

        marketList.innerHTML = listings.map(l => `
            <div class="market-card" data-pet-id="${l.pet_id}">
                <div class="market-card-header">
                    <span class="market-pet-name" style="color:${QUALITY_COLORS[l.quality]}">${l.name}</span>
                    <span class="market-gender" style="color:${GENDER_COLORS[l.gender]}">${GENDER_ICONS[l.gender]}</span>
                </div>
                <div class="market-card-info">
                    <span>Lv.${l.level}</span>
                    <span>${l.quality_name}</span>
                    <span>${l.stage_name}</span>
                    <span>心情:${l.mood}</span>
                </div>
                <div class="market-card-owner">主人: ${l.owner_name || '匿名'}</div>
                <div class="market-card-actions">
                    <button class="btn btn-sm btn-invite" data-target="${l.pet_id}">发送邀请</button>
                </div>
            </div>
        `).join('');

        /* 绑定邀请按钮 */
        marketList.querySelectorAll('.btn-invite').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!_breedPetId) return;
                const targetId = parseInt(btn.dataset.target, 10);
                const protocol = confirm('选择蛋分配方式：\n确定 = 双蛋各一(split)\n取消 = 单蛋归你(single)') ? 'split' : 'single';
                const res = await Api.post('/api/breeding/invite/send', {
                    pet_id: _breedPetId,
                    target_pet_id: targetId,
                    egg_protocol: protocol,
                });
                marketMsg.textContent = res.code === 0 ? '邀请已发送' : res.msg;
                marketMsg.className = `nurture-msg ${res.code === 0 ? 'success' : 'error'}`;
            });
        });
    }

    /* 市场过滤按钮 */
    document.querySelectorAll('.market-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.market-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadMarketListings(parseInt(btn.dataset.gender, 10) || 0);
        });
    });

    document.getElementById('btnMarketClose').addEventListener('click', () => {
        marketPanel.style.display = 'none';
        petPanel.style.display = 'flex';
    });

    /**
     * 邀请列表面板
     */
    async function showInvitePanel() {
        petPanel.style.display = 'none';
        invitePanel.style.display = 'flex';

        const res = await Api.post('/api/breeding/invite/list');
        if (res.code !== 0) {
            inviteMsg.textContent = res.msg;
            inviteMsg.className = 'nurture-msg error';
            return;
        }

        const invites = res.data.invites;
        if (invites.length === 0) {
            inviteList.innerHTML = '<p class="market-empty">暂无配对邀请</p>';
            return;
        }

        inviteList.innerHTML = invites.map(inv => `
            <div class="invite-card">
                <div class="invite-card-info">
                    <span>来自: ${inv.from_name || '匿名'}</span>
                    <span>对方宠物: <strong style="color:${QUALITY_COLORS[inv.pet1_quality]}">${inv.pet1_name}</strong> ${GENDER_ICONS[inv.pet1_gender]}</span>
                    <span>→ 你的: <strong style="color:${QUALITY_COLORS[inv.pet2_quality]}">${inv.pet2_name}</strong> ${GENDER_ICONS[inv.pet2_gender]}</span>
                    <span>协议: ${inv.egg_protocol === 'split' ? '双蛋各一' : '单蛋归对方'}</span>
                </div>
                <div class="invite-card-actions">
                    <button class="btn btn-sm btn-accept" data-id="${inv.id}">接受</button>
                    <button class="btn btn-sm btn-reject" data-id="${inv.id}">拒绝</button>
                </div>
            </div>
        `).join('');

        inviteList.querySelectorAll('.btn-accept').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res = await Api.post('/api/breeding/invite/accept', { invite_id: parseInt(btn.dataset.id, 10) });
                inviteMsg.textContent = res.code === 0 ? '已接受，进入交配笼' : res.msg;
                inviteMsg.className = `nurture-msg ${res.code === 0 ? 'success' : 'error'}`;
                if (res.code === 0) {
                    setTimeout(() => showCagePanel(), 1500);
                }
            });
        });

        inviteList.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res = await Api.post('/api/breeding/invite/reject', { invite_id: parseInt(btn.dataset.id, 10) });
                inviteMsg.textContent = res.code === 0 ? '已拒绝' : res.msg;
                inviteMsg.className = `nurture-msg ${res.code === 0 ? 'success' : 'error'}`;
                if (res.code === 0) btn.closest('.invite-card').remove();
            });
        });
    }

    document.getElementById('btnInviteClose').addEventListener('click', () => {
        invitePanel.style.display = 'none';
        petPanel.style.display = 'flex';
    });

    /**
     * 交配笼面板
     */
    async function showCagePanel() {
        petPanel.style.display = 'none';
        invitePanel.style.display = 'none';
        marketPanel.style.display = 'none';
        cagePanel.style.display = 'flex';

        const res = await Api.post('/api/breeding/cage/status');
        if (res.code !== 0) {
            cageMsg.textContent = res.msg;
            cageMsg.className = 'nurture-msg error';
            return;
        }

        const cages = res.data.cages;
        if (cages.length === 0) {
            cageInfo.innerHTML = '<p class="market-empty">暂无交配中的宠物</p>';
            cageActions.innerHTML = '';
            return;
        }

        const cage = cages[0];
        const renderCage = () => {
            const remaining = Math.max(0, cage.finish_at - Math.floor(Date.now() / 1000));
            const progress = Math.min(1, 1 - remaining / (cage.finish_at - cage.started_at));

            cageInfo.innerHTML = `
                <div class="cage-pair">
                    <span class="cage-pet">${cage.pet1_name}</span>
                    <span class="cage-heart">💕</span>
                    <span class="cage-pet">${cage.pet2_name}</span>
                </div>
                <div class="cage-progress">
                    <div class="tm-bar-track">
                        <div class="tm-bar-fill" style="width:${(progress * 100).toFixed(1)}%"></div>
                    </div>
                    <span class="cage-time">${remaining > 0 ? formatTime(remaining) : '已完成'}</span>
                </div>`;

            if (remaining <= 0) {
                cageActions.innerHTML = `<button class="btn btn-primary btn-cage-finish" data-id="${cage.id}">🎉 领取结果</button>`;
                cageActions.querySelector('.btn-cage-finish').addEventListener('click', async () => {
                    const r = await Api.post('/api/breeding/cage/finish', { cage_id: cage.id });
                    if (r.code !== 0) {
                        cageMsg.textContent = r.msg;
                        cageMsg.className = 'nurture-msg error';
                        return;
                    }
                    if (_cageTimer) { clearInterval(_cageTimer); _cageTimer = null; }

                    if (r.data.success) {
                        const eggList = r.data.eggs.map(e =>
                            `🥚 ${e.quality_name}蛋${e.hidden_unlocked ? ' ✨' + e.hidden_name + '解锁!' : ''}`
                        ).join('<br>');
                        cageInfo.innerHTML = `<div class="cage-result success">🎉 繁殖成功！<br>${eggList}</div>`;
                    } else {
                        cageInfo.innerHTML = `<div class="cage-result fail">😔 繁殖失败（成功率: ${(r.data.prob * 100).toFixed(0)}%）</div>`;
                    }
                    cageActions.innerHTML = '';
                });
            } else {
                cageActions.innerHTML = '';
            }
        };

        renderCage();
        if (_cageTimer) clearInterval(_cageTimer);
        _cageTimer = setInterval(renderCage, 1000);
    }

    document.getElementById('btnCageClose').addEventListener('click', () => {
        if (_cageTimer) { clearInterval(_cageTimer); _cageTimer = null; }
        cagePanel.style.display = 'none';
        petPanel.style.display = 'flex';
    });

    /* ═══════════════════════════════════════════
     * 菜单 & 侧边按钮事件
     * ═══════════════════════════════════════════ */

    /* 菜单开关 */
    if (btnMenu) {
        btnMenu.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = menuOverlay.style.display === 'flex' ? 'none' : 'flex';
        });
    }
    const menuClose = document.getElementById('menuClose');
    if (menuClose) {
        menuClose.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = 'none';
        });
    }

    /* 菜单项 */
    const menuPetDetail = document.getElementById('menuPetDetail');
    if (menuPetDetail) {
        menuPetDetail.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = 'none';
            if (_cachedPetData) {
                petPanel.style.display = 'flex';
            } else if (_lastCreatedPetId) {
                fetchAndShowPetDetail(_lastCreatedPetId);
            }
        });
    }

    const menuSell = document.getElementById('menuSell');
    if (menuSell) {
        menuSell.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = 'none';
            petPanel.style.display = 'flex';
            if (sellSection) sellSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    const menuBreed = document.getElementById('menuBreed');
    if (menuBreed) {
        menuBreed.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = 'none';
            petPanel.style.display = 'flex';
            if (breedSection) breedSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    const menuArena = document.getElementById('menuArena');
    if (menuArena) {
        menuArena.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = 'none';
            const arenaPanel = document.getElementById('arenaPanel');
            if (arenaPanel) {
                arenaPanel.style.display = 'flex';
                if (typeof Arena !== 'undefined' && Arena.openArenaPanel) {
                    Arena.openArenaPanel();
                }
            }
        });
    }

    const menuHistory = document.getElementById('menuHistory');
    if (menuHistory) {
        menuHistory.addEventListener('click', () => {
            if (menuOverlay) menuOverlay.style.display = 'none';
            const historyPanel = document.getElementById('historyPanel');
            if (historyPanel) {
                historyPanel.style.display = 'flex';
                if (typeof Arena !== 'undefined' && Arena.loadHistory) {
                    Arena.loadHistory();
                }
            }
        });
    }

    /* 打开宠物详情面板（从菜单） */
    async function fetchAndShowPetDetail(petId) {
        const res = await Api.post('/api/pet/detail', { pet_id: petId });
        if (res.code !== 0) return;
        _cachedPetData = res.data;
        renderPetPanelContent(res.data);
        petPanel.style.display = 'flex';
    }

    /* 侧边按钮 */
    const btnSideFeed = document.getElementById('btnSideFeed');
    if (btnSideFeed) {
        btnSideFeed.addEventListener('click', () => {
            /* 滚动底部食物栏到可见位置（已经可见） */
        });
    }

    const btnSideRest = document.getElementById('btnSideRest');
    if (btnSideRest) {
        btnSideRest.addEventListener('click', async () => {
            if (!_lastCreatedPetId) return;
            btnSideRest.disabled = true;
            const res = await Api.post('/api/nurture/rest', { pet_id: _lastCreatedPetId });
            btnSideRest.disabled = false;
            if (res.code !== 0) {
                feedMsg.textContent = res.msg;
                return;
            }
            feedMsg.textContent = `\u4F11\u606F\u6210\u529F\uFF01\u4F53\u529B ${res.data.stamina.before}\u2192${res.data.stamina.after}`;
            await syncAndUpdateBars();
        });
    }

    const btnSideEvolve = document.getElementById('btnSideEvolve');
    if (btnSideEvolve) {
        btnSideEvolve.addEventListener('click', () => {
            petPanel.style.display = 'flex';
            if (evolveSection) evolveSection.scrollIntoView({ behavior: 'smooth' });
        });
    }

    const btnSideAttr = document.getElementById('btnSideAttr');
    if (btnSideAttr) {
        btnSideAttr.addEventListener('click', () => {
            if (_cachedPetData) {
                showAttrPanel(_cachedPetData);
            }
        });
    }

    /* ═══════════════════════════════════════════
     * 属性面板 (P10)
     * ═══════════════════════════════════════════ */

    const attrPanel     = document.getElementById('attrPanel');
    const attrPanelTitle = document.getElementById('attrPanelTitle');
    const attrPanelBody = document.getElementById('attrPanelBody');
    const btnAttrClose  = document.getElementById('btnAttrClose');

    if (btnAttrClose) {
        btnAttrClose.addEventListener('click', () => {
            if (attrPanel) attrPanel.style.display = 'none';
        });
    }

    function showAttrPanel(data) {
        if (!attrPanel || !attrPanelBody) return;
        const pet = data.pet;
        const color = QUALITY_COLORS[pet.quality] || '#AAAAAA';
        const qName = pet.quality_name || QUALITY_NAMES[pet.quality] || '未知';
        const gIcon = GENDER_ICONS[pet.gender] || '';
        const gColor = GENDER_COLORS[pet.gender] || '#e6edf3';

        const staminaPct = pet.stamina_max > 0 ? (pet.stamina / pet.stamina_max * 100).toFixed(1) : 0;
        const satietyPct = pet.satiety_max > 0 ? (pet.satiety / pet.satiety_max * 100).toFixed(1) : 0;
        const moodPct    = pet.mood;
        const healthMax  = pet.health_max || 100;
        const health     = pet.health !== undefined ? pet.health : healthMax;
        const healthPct  = healthMax > 0 ? (health / healthMax * 100).toFixed(1) : 0;

        let html = '';

        /* 身份区 */
        html += `<div class="attr-identity">
            <span class="attr-identity-name" style="color:${color}">${pet.name}</span>
            <span style="color:${gColor};font-size:18px">${gIcon}</span>
            <div class="attr-identity-info">
                <span>Lv.${pet.level}</span>
                <span>EXP ${pet.exp}/${pet.exp_next}</span>
                <span style="color:${color}">${qName}</span>
            </div>
        </div>`;

        /* 状态条 */
        html += `<div class="attr-bars">
            <div class="attr-bar-item">
                <span class="attr-bar-label">⚡ 体力</span>
                <div class="attr-bar-track"><div class="attr-bar-fill hud-bar-stamina" style="width:${staminaPct}%"></div></div>
                <span class="attr-bar-val">${pet.stamina}/${pet.stamina_max}</span>
            </div>
            <div class="attr-bar-item">
                <span class="attr-bar-label">🍖 饱食</span>
                <div class="attr-bar-track"><div class="attr-bar-fill hud-bar-satiety" style="width:${satietyPct}%"></div></div>
                <span class="attr-bar-val">${pet.satiety}/${pet.satiety_max}</span>
            </div>
            <div class="attr-bar-item">
                <span class="attr-bar-label">💚 健康</span>
                <div class="attr-bar-track"><div class="attr-bar-fill hud-bar-health" style="width:${healthPct}%"></div></div>
                <span class="attr-bar-val">${health}/${healthMax}</span>
            </div>
            <div class="attr-bar-item">
                <span class="attr-bar-label">😊 心情</span>
                <div class="attr-bar-track"><div class="attr-bar-fill hud-bar-mood" style="width:${moodPct}%"></div></div>
                <span class="attr-bar-val">${moodPct}</span>
            </div>
        </div>`;

        /* 操作区 */
        html += `<div class="attr-actions">
            <div class="attr-action-row">
                <div>
                    <div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:2px">🏃 宠物箱升级</div>
                    <span class="attr-action-label">建设跑道，让宠物跑步产金</span>
                </div>
                <button class="btn btn-tm" id="btnAttrTreadmill">建设跑道</button>
            </div>
            <div class="attr-action-row">
                <div>
                    <div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:2px">💰 出售宠物</div>
                    <span class="attr-action-label" id="attrSellPrice">估值计算中...</span>
                </div>
                <button class="btn btn-sell" id="btnAttrSell">出售宠物</button>
            </div>
        </div>`;

        attrPanelBody.innerHTML = html;
        attrPanel.style.display = 'flex';

        /* 绑定跑道按钮 */
        const btnAttrTm = document.getElementById('btnAttrTreadmill');
        if (btnAttrTm) {
            btnAttrTm.addEventListener('click', () => {
                attrPanel.style.display = 'none';
                petPanel.style.display = 'flex';
                if (treadmillSection) treadmillSection.scrollIntoView({ behavior: 'smooth' });
            });
        }

        /* 绑定出售按钮 */
        const btnAttrSellEl = document.getElementById('btnAttrSell');
        if (btnAttrSellEl) {
            btnAttrSellEl.addEventListener('click', () => {
                attrPanel.style.display = 'none';
                petPanel.style.display = 'flex';
                if (sellSection) sellSection.scrollIntoView({ behavior: 'smooth' });
            });
        }

        /* 异步获取估值 */
        if (pet.id) {
            Api.post('/api/pet/evaluate', { pet_id: pet.id }).then(res => {
                const priceEl = document.getElementById('attrSellPrice');
                if (priceEl && res.code === 0) {
                    priceEl.textContent = `估值：${res.data.sell_price} 金币`;
                    priceEl.style.color = '#ffaa00';
                } else if (priceEl) {
                    priceEl.textContent = '估值获取失败';
                }
            });
        }
    }

    /* ── 公共接口 ── */
    return { init, refreshPetPanel: fetchAndShowPetPanel };
})();
