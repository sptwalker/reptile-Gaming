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
        eggClaim.style.display = 'none';
        eggCard.style.display = 'none';
        talentPanel.style.display = 'none';
        petCreated.style.display = 'none';
        petPanel.style.display = 'none';
        btnStartHatch.style.display = 'none';
        btnFinishHatch.style.display = 'none';
        eggTimer.style.display = 'none';
        eggProgress.style.display = 'none';
        stopTimer();
        stopSync();
        /* PF-03: 清理休息冷却定时器 */
        if (_restCdTimer) { clearInterval(_restCdTimer); _restCdTimer = null; }
        if (_feedCooldownTimer) { clearInterval(_feedCooldownTimer); _feedCooldownTimer = null; }
        if (_lizardRenderer) { _lizardRenderer.stop(); }
    }

    /* ── 初始化：登录后调用 ── */
    async function init(user) {
        hideAll();

        /* 未领蛋 → 显示领取按钮 */
        if (user.egg_claimed === 0) {
            eggClaim.style.display = 'block';
            return;
        }

        /* 已领蛋 → 查询蛋列表 */
        const res = await Api.post('/api/egg/list');
        if (res.code !== 0) return;

        const eggs = res.data.eggs;

        /* 蛋列表为空 → 显示领蛋按钮 */
        if (eggs.length === 0) {
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

    /* ── 返回按钮 ── */
    btnBackToEgg.addEventListener('click', () => {
        hideAll();
        eggSection.style.display = 'block';
        if (_lastCreatedPetId) {
            petCreated.style.display = 'block';
        } else {
            eggClaim.style.display = 'block';
        }
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

    /* ── 渲染宠物信息面板 ── */
    function showPetPanel(data) {
        hideAll();
        eggSection.style.display = 'none';
        petPanel.style.display = 'block';

        const pet = data.pet;
        const color = QUALITY_COLORS[pet.quality] || '#AAAAAA';
        const qName = pet.quality_name || QUALITY_NAMES[pet.quality] || '未知';
        const gIcon = GENDER_ICONS[pet.gender] || '';
        const gColor = GENDER_COLORS[pet.gender] || '#e6edf3';

        petPanelTitle.innerHTML = `🦎 <span style="color:${color}">${pet.name}</span> <span style="color:${gColor};font-size:18px">${gIcon}</span> <small style="color:${color}">[${qName}]</small>`;

        /* 状态信息 */
        petPanelStatus.innerHTML = `
            <div class="pp-status-row">
                <span class="pp-stage">${pet.stage_name}</span>
                <span class="pp-level">Lv.${pet.level}</span>
                <span class="pp-exp">EXP ${pet.exp}/${pet.exp_next}</span>
            </div>`;

        /* 状态条：体力 / 饱食度 / 心情 */
        renderBars(pet);

        /* 六维属性 */
        const attrNames = { str: '力量', agi: '敏捷', vit: '体质', int: '智力', per: '感知', cha: '魅力' };
        let attrHtml = '<div class="attr-grid">';
        for (const [key, label] of Object.entries(attrNames)) {
            const a = data.attrs[key];
            attrHtml += `<div class="attr-item"><span class="attr-label">${label}</span><span class="attr-val">${a.total}</span><small>(${a.base}+${a.talent})</small></div>`;
        }
        attrHtml += '</div>';
        petPanelAttrs.innerHTML = attrHtml;

        /* 衍生属性 */
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

        /* 技能列表 */
        const SKILL_NAMES = {
            bite: '撕咬', scratch: '抓挠', tail_whip: '尾击', camouflage: '伪装',
            venom_spit: '毒液喷射', iron_hide: '铁甲', dragon_rush: '龙突', regen: '再生', predator_eye: '掠食之眼'
        };
        if (data.skills && data.skills.length > 0) {
            let skillHtml = '<div class="pp-skill-list">';
            for (const sk of data.skills) {
                const sName = SKILL_NAMES[sk.skill_code] || sk.skill_code;
                const equipped = sk.is_equipped ? ' pp-skill-equipped' : '';
                skillHtml += `<span class="pp-skill-badge${equipped}">${sName} Lv.${sk.skill_level}</span>`;
            }
            skillHtml += '</div>';
            petPanelSkills.innerHTML = '<h4>技能</h4>' + skillHtml;
        } else {
            petPanelSkills.innerHTML = '<h4>技能</h4><p class="pp-no-skill">暂无技能</p>';
        }

        /* 渲染食物按钮 (P5) */
        renderFoodGrid();

        /* 渲染蜕变区域 (P6) */
        renderEvolveSection(data);

        /* 启动自动同步（每30秒） */
        startSync(pet.id);

        /* 启动蜥蜴渲染器 */
        var gameCanvas = document.getElementById('gameCanvas');
        if (gameCanvas && typeof LizardRenderer !== 'undefined') {
            if (!_lizardRenderer) {
                _lizardRenderer = new LizardRenderer(gameCanvas, { activity: 5 });
            }
            _lizardRenderer.toggleAI(true);
            _lizardRenderer.start();
        }
    }

    /* ── 渲染状态条（可独立更新） ── */
    function renderBars(pet) {
        const staminaPct = pet.stamina_max > 0 ? (pet.stamina / pet.stamina_max * 100).toFixed(1) : 0;
        const satietyPct = pet.satiety_max > 0 ? (pet.satiety / pet.satiety_max * 100).toFixed(1) : 0;
        const moodPct    = pet.mood;

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
        renderBars({
            stamina: d.stamina, stamina_max: d.stamina_max,
            satiety: d.satiety, satiety_max: d.satiety_max,
            mood: d.mood
        });

        /* 更新金币 */
        const goldEl = document.getElementById('userGold');
        if (goldEl) goldEl.textContent = `💰 ${d.gold}`;
    }

    /* ── RB-02: Canvas 分辨率初始化 ── */
    function initCanvas() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        const wrap = document.getElementById('canvasWrap');
        function resize() {
            const rect = wrap.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize();
        window.addEventListener('resize', resize);
    }
    initCanvas();

    /* ── 公共接口 ── */
    return { init };
})();
