(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.LizardBattleAdapter = factory(root);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    function finite(v, fallback) {
        var n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function resolveMap(map) {
        map = map || {};
        return {
            width: Math.max(200, finite(map.width, 800)),
            height: Math.max(200, finite(map.height, 600)),
            margin: Math.max(16, finite(map.margin, 20))
        };
    }

    function arenaRect(width, height, map) {
        var m = resolveMap(map);
        var padX = 40;
        var padTop = 72;
        var padBottom = 64;
        var availableW = Math.max(220, width - padX * 2);
        var availableH = Math.max(180, height - padTop - padBottom);
        var scale = Math.min(availableW / m.width, availableH / m.height);
        var drawW = m.width * scale;
        var drawH = m.height * scale;
        return {
            map: m,
            scale: scale,
            x: (width - drawW) / 2,
            y: padTop + (availableH - drawH) / 2,
            w: drawW,
            h: drawH
        };
    }

    function worldToCanvas(point, width, height, map) {
        var r = arenaRect(width, height, map);
        var m = r.map;
        var x = r.x + clamp(finite(point && point.x, m.width / 2), 0, m.width) / m.width * r.w;
        var y = r.y + clamp(finite(point && point.y, m.height / 2), 0, m.height) / m.height * r.h + finite(point && point.yOffset, 0);
        return { x: x, y: y };
    }

    function spawnPoint(side, map) {
        var m = resolveMap(map);
        var minX = m.margin;
        var maxX = m.width - m.margin;
        var usableW = maxX - minX;
        return {
            x: side === 'left' ? minX + usableW * 0.12 : maxX - usableW * 0.12,
            y: m.margin + (m.height - m.margin * 2) * 0.5
        };
    }

    function skillDisplayName(code) {
        var names = {
            quick_snap: '快速咬击', bite: '撕咬', combo_bite: '连击撕咬', heavy_bite: '重咬', guard: '防御架势', brace: '稳固防御',
            retreat_step: '后撤步', flank_step: '绕后步', fake_sound: '假声诱导', tail_decoy: '断尾诱饵', listen_alert: '警觉聆听', search_sound: '声音搜索',
            scratch: '利爪抓击', tail_whip: '尾鞭横扫', camouflage: '伪装潜伏', venom_spit: '毒液喷吐', iron_hide: '铁皮硬化',
            dragon_rush: '龙形冲撞', regen: '再生恢复', predator_eye: '掠食者凝视', crystal_armor: '晶甲护体', shadow_step: '影步突袭',
            flame_breath: '火焰吐息', gale_slash: '疾风斩', primal_roar: '原初咆哮', heal: '治疗'
        };
        return names[code] || code || '';
    }

    function shouldShowSkillName(code) {
        if (!code) return false;
        return !({ move: 1, fast_move: 1, flee: 1, dodge: 1, free_roam: 1, idle: 1 }[code]);
    }

    function drawRoundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
            return;
        }
        var rr = Math.min(r, w / 2, h / 2);
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
    }

    function makePreviewUnit(side, frame, slot, map) {
        var m = resolveMap(map);
        var t = frame / 60 + (side === 'left' ? 0 : Math.PI);
        var center = spawnPoint(side, m);
        var rx = Math.max(48, m.width * 0.14);
        var ry = Math.max(40, m.height * 0.18);
        return {
            x: clamp(center.x + Math.cos(t * 0.82) * rx + Math.sin(t * 0.27) * (m.width * 0.04), m.margin, m.width - m.margin),
            y: clamp(center.y + Math.sin(t * 0.74) * ry + Math.cos(t * 0.33) * (m.height * 0.07), m.margin, m.height - m.margin),
            hp: 1,
            maxHp: 1,
            st: 'free',
            pose: 'walk',
            actionId: 'free_roam',
            actionProgress: (frame % 60) / 60,
            facing: side === 'left' ? 0 : Math.PI,
            _preview: true,
            _slot: slot || side
        };
    }

    function LizardBattleAdapter(stageCanvas, options) {
        options = options || {};
        this.stageCanvas = stageCanvas;
        this.animator = options.animator || null;
        this.appearance = { left: null, right: null };
        this.renderers = { left: null, right: null };
        this.tracks = { left: [], right: [] };
        this.unitHistory = { left: null, right: null };
        this.maxTrackPoints = options.maxTrackPoints || 90;
        this.renderScale = finite(options.renderScale, 0.68);
        this.lastAnchors = { left: null, right: null };
        this.ready = !!this._RendererClass();
        if (this.ready) {
            this._createRenderer('left');
            this._createRenderer('right');
        }
    }

    LizardBattleAdapter.prototype.isReady = function () {
        return !!this.ready;
    };

    LizardBattleAdapter.prototype._RendererClass = function () {
        return root.LizardRenderer || (typeof LizardRenderer !== 'undefined' ? LizardRenderer : null);
    };

    LizardBattleAdapter.prototype._createRenderer = function (side) {
        var Renderer = this._RendererClass();
        if (!Renderer) return;
        var renderer = new Renderer(this.stageCanvas, { activity: 8, embedded: true, bindEvents: false, autoResize: false, fixedScale: this.renderScale });
        renderer.toggleAI(false);
        if (renderer.stop) renderer.stop();
        renderer.clearExternalMoveTarget && renderer.clearExternalMoveTarget();
        this.renderers[side] = renderer;
        this._seedPose(side, side === 'left' ? 1 : -1);
    };

    LizardBattleAdapter.prototype._seedPose = function (side, dir) {
        var r = this.renderers[side];
        if (!r || !r.spine || !r.spine.length) return;
        var w = this.stageCanvas.clientWidth || 960;
        var h = this.stageCanvas.clientHeight || 560;
        r._w = w;
        r._h = h;
        if (r._applyScale) r._applyScale();
        var headX = side === 'left' ? w * 0.34 : w * 0.66;
        var headY = h * 0.54;
        for (var i = 0; i < r.spine.length; i++) {
            var len = r._segmentLengthAt ? r._segmentLengthAt(Math.max(0, i - 1)) : 14;
            r.spine[i].x = headX - dir * i * len;
            r.spine[i].y = headY + Math.sin(i * 0.45) * 2;
        }
        r.prevHeadX = r.spine[0].x;
        r.prevHeadY = r.spine[0].y;
        if (r._initLegs) r._initLegs();
    };

    LizardBattleAdapter.prototype.reset = function () {
        this.tracks = { left: [], right: [] };
        this.unitHistory = { left: null, right: null };
        this.lastAnchors = { left: null, right: null };
        this._seedPose('left', 1);
        this._seedPose('right', -1);
    };

    LizardBattleAdapter.prototype.destroy = function () {
        ['left', 'right'].forEach(function (side) {
            var r = this.renderers[side];
            if (r && r.destroy) r.destroy();
            this.renderers[side] = null;
        }, this);
    };

    LizardBattleAdapter.prototype.setAppearance = function (appearance) {
        this.appearance = appearance || { left: null, right: null };
        this._applyAppearance('left', this.appearance.left);
        this._applyAppearance('right', this.appearance.right);
    };

    LizardBattleAdapter.prototype._applyAppearance = function (side, app) {
        var r = this.renderers[side];
        if (!r || !app) return;
        var params = app.render_params || app.renderParams || null;
        var seed = app.body_seed || app.bodySeed || null;
        if (r.applyRenderParams) r.applyRenderParams(params, seed);
        var hiddenGene = app.hidden_gene || app.hiddenGene || '';
        if (r.applyHiddenGene && hiddenGene) r.applyHiddenGene(hiddenGene);
        this._seedPose(side, side === 'left' ? 1 : -1);
    };

    LizardBattleAdapter.prototype._motionSample = function (side, unit, map) {
        var key = unit && unit._slot || side;
        var last = this.unitHistory[key];
        var fallback = spawnPoint(side, map);
        var x = finite(unit && unit.x, fallback.x);
        var y = finite(unit && unit.y, fallback.y);
        var dx = last ? x - last.x : 0;
        var dy = last ? y - last.y : 0;
        this.unitHistory[key] = { x: x, y: y };
        return { dx: dx, dy: dy, speed: Math.hypot(dx, dy) };
    };

    LizardBattleAdapter.prototype._contractFor = function (actionId) {
        var contracts = root.BattleActionContracts || null;
        return contracts && contracts.getActionContract ? contracts.getActionContract(actionId) : null;
    };

    LizardBattleAdapter.prototype._actionProfile = function (unit, motion) {
        var actionId = unit && unit.actionId || '';
        var pose = unit && unit.pose || '';
        var contract = this._contractFor(actionId) || {};
        var type = contract.type || '';
        var progress = clamp(finite(unit && unit.actionProgress, 0), 0, 1);
        var pulse = Math.sin(progress * Math.PI);
        var profile = {
            actionId: actionId,
            pose: pose,
            type: type,
            progress: progress,
            pulse: pulse,
            speedScale: 1,
            effectType: ''
        };
        if (pose === 'run' || actionId === 'fast_move' || actionId === 'flee' || pose === 'rush' || actionId === 'dragon_rush' || actionId === 'shadow_step') profile.speedScale = 1.7;
        else if (pose === 'dodge' || actionId === 'dodge') profile.speedScale = 1.45;
        else if (pose === 'dead' || actionId === 'dead') profile.speedScale = 0.2;
        else if (pose === 'guard' || actionId === 'guard' || pose === 'brace' || actionId === 'brace') profile.speedScale = 0.8;
        else if (motion && motion.speed > 8) profile.speedScale = 1.25;
        if (pose === 'bite' || actionId === 'bite' || pose === 'claw' || actionId === 'scratch' || pose === 'tail_swing' || actionId === 'tail_whip' || pose === 'rush' || actionId === 'dragon_rush') profile.effectType = 'melee';
        else if (pose === 'spit' || actionId === 'venom_spit' || pose === 'breath' || actionId === 'flame_breath' || actionId === 'gale_slash') profile.effectType = 'ranged';
        else if (pose === 'heal' || actionId === 'regen' || actionId === 'heal') profile.effectType = 'heal';
        else if (pose === 'guard' || actionId === 'guard' || pose === 'brace' || actionId === 'brace' || pose === 'buff' || pose === 'camouflage' || pose === 'focus' || actionId === 'predator_eye' || actionId === 'iron_hide' || actionId === 'camouflage' || actionId === 'buff') profile.effectType = actionId === 'predator_eye' ? 'fear_skill' : 'buff';
        return profile;
    };

    LizardBattleAdapter.prototype._syncActionEffect = function (renderer, profile, unit) {
        if (!renderer || !profile || !profile.actionId || !profile.effectType) return;
        var impactBucket = profile.progress < 0.18 ? 0 : profile.progress < 0.62 ? 1 : 2;
        var key = profile.actionId + ':' + impactBucket + ':' + profile.effectType;
        if (renderer._battleLastSkill === key) return;
        if (renderer.triggerSkillTest) renderer.triggerSkillTest(profile.actionId, profile.effectType);
        renderer._battleLastSkill = key;
        if (unit && unit.impact) renderer._testEffect = { code: profile.actionId, type: profile.effectType, time: 24, duration: 24 };
    };

    LizardBattleAdapter.prototype._drawTracks = function (side, p) {
        var list = this.tracks[side] || [];
        var last = list[list.length - 1];
        if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 3) {
            list.push({ x: p.x, y: p.y });
            if (list.length > this.maxTrackPoints) list.shift();
        }
        this.tracks[side] = list;
    };

    LizardBattleAdapter.prototype._syncRendererCanvas = function (renderer, width, height) {
        if (!renderer) return;
        if (renderer._w !== width || renderer._h !== height) {
            renderer._w = width;
            renderer._h = height;
            if (renderer._applyScale) renderer._applyScale();
        }
    };

    LizardBattleAdapter.prototype._renderUnit = function (ctx, side, unit, options) {
        var r = this.renderers[side];
        if (!r || !unit) return;
        var width = options.width || 960;
        var height = options.height || 560;
        var map = options.map || null;
        this._syncRendererCanvas(r, width, height);
        var p = worldToCanvas(unit, width, height, map);
        var motion = this._motionSample(side, unit, map);
        var profile = this._actionProfile(unit, motion);
        var facing = Number.isFinite(Number(unit.facing)) ? Number(unit.facing) : null;
        var bodyFacing = Number.isFinite(Number(unit.bodyFacing)) ? Number(unit.bodyFacing) : facing;
        var lookFacing = Number.isFinite(Number(unit.lookFacing)) ? Number(unit.lookFacing) : facing;
        var moveFacing = Number.isFinite(Number(unit.moveFacing)) ? Number(unit.moveFacing) : bodyFacing;
        var current = r.getHeadAnchor ? r.getHeadAnchor() : null;
        var dxCanvas = current ? p.x - current.x : 0;
        var dyCanvas = current ? p.y - current.y : 0;
        var distCanvas = Math.hypot(dxCanvas, dyCanvas);
        var maxSpeed = Math.max(1, Number(r.MAX_SPEED) || 1);
        var speedScale = Math.max(profile.speedScale || 1, Math.min(1.35, 0.75 + distCanvas / Math.max(1, maxSpeed * 9)));
        if (distCanvas > maxSpeed * 12) speedScale = Math.max(speedScale, 1.55);
        if (distCanvas > maxSpeed * 20) speedScale = Math.max(speedScale, 2.1);
        if (unit.motionProgress != null) speedScale = Math.max(speedScale, 1.05);
        if (distCanvas > maxSpeed * 56 && r.spine && r.spine.length) {
            for (var i = 0; i < r.spine.length; i++) {
                r.spine[i].x += dxCanvas * 0.72;
                r.spine[i].y += dyCanvas * 0.72;
            }
            r.prevHeadX = r.spine[0].x;
            r.prevHeadY = r.spine[0].y;
            if (r._initLegs) r._initLegs();
            speedScale = Math.max(profile.speedScale || 1, 1.35);
        }
        if (r.setExternalMoveTarget) {
            r.setExternalMoveTarget({
                x: p.x,
                y: p.y,
                facing: lookFacing,
                bodyFacing: bodyFacing,
                moveFacing: moveFacing,
                speedScale: speedScale,
                action: { id: profile.actionId, pose: profile.pose, progress: profile.progress, type: profile.type }
            });
        }
        this._syncActionEffect(r, profile, unit);
        ctx.save();
        ctx.globalAlpha = unit.hp <= 0 ? 0.35 : 1;
        if (r.stepBattleFrame) r.stepBattleFrame({ clear: false, transparent: true, skipTreadmill: true, skipLightDots: true, skipVision: true });
        else if (r.renderBattleFrame) r.renderBattleFrame({ clear: false, transparent: true, skipTreadmill: true, skipLightDots: true, skipVision: true });
        ctx.restore();
        var anchor = r.getHeadAnchor ? r.getHeadAnchor() : p;
        this._drawTracks(side, anchor || p);
        this.lastAnchors[side] = { head: anchor || p, unit: unit };
        this._drawHud(ctx, unit, anchor || p, side);
    };

    LizardBattleAdapter.prototype.render = function (ctx, units, options) {
        options = options || {};
        if (!this.ready) return false;
        this._renderUnit(ctx, 'left', units && units.left, options);
        this._renderUnit(ctx, 'right', units && units.right, options);
        return true;
    };

    LizardBattleAdapter.prototype.renderPreview = function (ctx, options) {
        options = options || {};
        var frame = finite(options.frame, 0);
        var map = options.map || null;
        return this.render(ctx, {
            left: makePreviewUnit('left', frame, 'preview-left', map),
            right: makePreviewUnit('right', frame, 'preview-right', map)
        }, options);
    };

    LizardBattleAdapter.prototype._drawHud = function (ctx, unit, p, side) {
        if (unit && unit._preview) return;
        var hpRatio = unit.maxHp > 0 ? clamp(unit.hp / unit.maxHp, 0, 1) : 0;
        ctx.save();
        ctx.fillStyle = '#21262d';
        ctx.fillRect(p.x - 52, p.y - 122, 104, 8);
        ctx.fillStyle = hpRatio > 0.45 ? '#3fb950' : hpRatio > 0.2 ? '#f59e0b' : '#f85149';
        ctx.fillRect(p.x - 52, p.y - 122, 104 * hpRatio, 8);
        ctx.fillStyle = '#c9d1d9';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((unit.st || side) + ' HP ' + Math.round(unit.hp || 0), p.x, p.y - 130);
        if (shouldShowSkillName(unit.actionId)) {
            var label = skillDisplayName(unit.actionId);
            var progress = Math.round((unit.actionProgress || 0) * 100);
            var y = p.y - 154;
            ctx.font = 'bold 15px sans-serif';
            var text = label + ' ' + progress + '%';
            var textW = ctx.measureText(text).width;
            var padX = 10;
            ctx.fillStyle = side === 'left' ? 'rgba(22, 101, 52, 0.82)' : 'rgba(127, 29, 29, 0.82)';
            ctx.strokeStyle = side === 'left' ? 'rgba(126, 231, 135, 0.9)' : 'rgba(248, 113, 113, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            drawRoundRect(ctx, p.x - textW / 2 - padX, y - 17, textW + padX * 2, 24, 8);
            ctx.fill();
            ctx.stroke();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.strokeText(text, p.x, y);
            ctx.fillStyle = '#fff7cc';
            ctx.fillText(text, p.x, y);
        }
        ctx.restore();
    };

    LizardBattleAdapter.prototype.drawMotionDebug = function (ctx) {
        Object.keys(this.tracks).forEach(function (side) {
            var list = this.tracks[side];
            if (!list || list.length < 2) return;
            ctx.save();
            ctx.strokeStyle = side === 'left' ? 'rgba(126,231,135,.65)' : 'rgba(248,81,73,.65)';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.setLineDash([5, 6]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(list[0].x, list[0].y);
            for (var i = 1; i < list.length; i++) ctx.lineTo(list[i].x, list[i].y);
            ctx.stroke();
            ctx.setLineDash([]);
            for (var p = 0; p < list.length; p += 8) {
                ctx.beginPath();
                ctx.arc(list[p].x, list[p].y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }, this);
    };

    return LizardBattleAdapter;
}));
