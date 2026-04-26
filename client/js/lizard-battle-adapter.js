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

    function makeStage(width, height) {
        var holder = document.createElement('div');
        holder.style.position = 'fixed';
        holder.style.left = '-10000px';
        holder.style.top = '-10000px';
        holder.style.width = width + 'px';
        holder.style.height = height + 'px';
        holder.style.overflow = 'hidden';
        holder.setAttribute('aria-hidden', 'true');
        var canvas = document.createElement('canvas');
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        holder.appendChild(canvas);
        document.body.appendChild(holder);
        return { holder: holder, canvas: canvas };
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

    function mapUnitPoint(unit, width, height, side, map) {
        return worldToCanvas(unit || spawnPoint(side, map), width, height, map);
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
            footPhase: (frame % 30) / 30,
            _preview: true,
            _slot: slot || side
        };
    }

    function LizardBattleAdapter(stageCanvas, options) {
        options = options || {};
        this.stageCanvas = stageCanvas;
        this.animator = options.animator || null;
        this.unitWidth = options.unitWidth || 360;
        this.unitHeight = options.unitHeight || 240;
        this.appearance = { left: null, right: null };
        this.renderers = { left: null, right: null };
        this.stages = { left: null, right: null };
        this.tracks = { left: [], right: [] };
        this.unitHistory = { left: null, right: null };
        this.maxTrackPoints = options.maxTrackPoints || 90;
        this.lastAnchors = { left: null, right: null };
        this.ready = !!(root.LizardRenderer || (typeof LizardRenderer !== 'undefined' && LizardRenderer));
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
        var stage = makeStage(this.unitWidth, this.unitHeight);
        var renderer = new Renderer(stage.canvas, { activity: 8 });
        renderer.toggleAI(false);
        if (renderer.stop) renderer.stop();
        renderer.mouseDown = true;
        renderer.mouseDragStart = { x: this.unitWidth / 2, y: this.unitHeight / 2, time: Date.now() };
        this.stages[side] = stage;
        this.renderers[side] = renderer;
        this._seedPose(side, side === 'left' ? 1 : -1);
    };

    LizardBattleAdapter.prototype._seedPose = function (side, dir) {
        var r = this.renderers[side];
        if (!r || !r.spine || !r.spine.length) return;
        var headX = this.unitWidth * 0.5 + dir * 38;
        var headY = this.unitHeight * 0.48;
        r._w = this.unitWidth;
        r._h = this.unitHeight;
        for (var i = 0; i < r.spine.length; i++) {
            var len = r._segmentLengthAt ? r._segmentLengthAt(Math.max(0, i - 1)) : 14;
            r.spine[i].x = headX - dir * i * len;
            r.spine[i].y = headY + Math.sin(i * 0.45) * 2;
        }
        r.prevHeadX = r.spine[0].x;
        r.prevHeadY = r.spine[0].y;
        r.mouseX = headX + dir * 80;
        r.mouseY = headY;
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
            var s = this.stages[side];
            if (s && s.holder && s.holder.parentNode) s.holder.parentNode.removeChild(s.holder);
            this.renderers[side] = null;
            this.stages[side] = null;
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
        if (r.applyHiddenGene && app.hidden_gene) r.applyHiddenGene(app.hidden_gene);
        this._seedPose(side, side === 'left' ? 1 : -1);
    };

    LizardBattleAdapter.prototype._unitPoint = function (unit, width, height, side, map) {
        return mapUnitPoint(unit, width, height, side, map);
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
        var facing = dx ? (dx > 0 ? 1 : -1) : (side === 'left' ? 1 : -1);
        return { dx: dx, dy: dy, speed: Math.hypot(dx, dy), facing: facing };
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
            reach: 72,
            lift: 0,
            lateral: clamp(motion.dy * 0.12, -18, 18),
            bodyScale: 1,
            effectType: ''
        };
        if (pose === 'run' || actionId === 'fast_move' || actionId === 'flee') {
            profile.reach += 30 + clamp(motion.speed * 6, 0, 52);
            profile.lift += Math.sin((unit && unit.footPhase || 0) * Math.PI) * 8;
        } else if (pose === 'walk' || actionId === 'move') {
            profile.reach += clamp(motion.speed * 4, 0, 32);
        }
        if (pose === 'bite' || actionId === 'bite') {
            profile.reach += 34 * pulse;
            profile.lift -= 5 * pulse;
            profile.effectType = 'melee';
        } else if (pose === 'claw' || actionId === 'scratch') {
            profile.reach += 24 * pulse;
            profile.lateral += 13 * Math.sin(progress * Math.PI * 2);
            profile.effectType = 'melee';
        } else if (pose === 'tail_swing' || actionId === 'tail_whip') {
            profile.reach -= 18 * pulse;
            profile.lateral += 22 * Math.sin(progress * Math.PI * 2);
            profile.effectType = 'melee';
        } else if (pose === 'spit' || actionId === 'venom_spit' || pose === 'breath' || actionId === 'flame_breath' || actionId === 'gale_slash') {
            profile.reach += 28 * pulse;
            profile.lift -= 16 * pulse;
            profile.effectType = 'ranged';
        } else if (pose === 'rush' || actionId === 'dragon_rush' || actionId === 'shadow_step') {
            profile.reach += 50 * pulse;
            profile.bodyScale += 0.08 * pulse;
            profile.effectType = 'melee';
        } else if (pose === 'heal' || actionId === 'regen' || actionId === 'heal') {
            profile.lift -= 22 * pulse;
            profile.reach -= 10 * pulse;
            profile.effectType = 'heal';
        } else if (pose === 'buff' || pose === 'camouflage' || pose === 'brace' || pose === 'focus' || actionId === 'predator_eye' || actionId === 'iron_hide' || actionId === 'camouflage' || actionId === 'buff') {
            profile.lift -= 18 * pulse;
            profile.effectType = actionId === 'predator_eye' ? 'fear_skill' : 'buff';
        } else if (pose === 'listen' || pose === 'search' || pose === 'alert' || actionId === 'listen_alert' || actionId === 'search_sound') {
            profile.lift -= 24 + 8 * pulse;
            profile.lateral += 16 * Math.sin(progress * Math.PI * 2);
            profile.effectType = 'buff';
        } else if (pose === 'dodge' || actionId === 'dodge') {
            profile.reach -= 46;
            profile.lateral += 30 * (progress < 0.5 ? 1 : -1);
        } else if (pose === 'flinch' || actionId === 'hit_react' || unit && unit.impact) {
            profile.reach -= 34 * (1 - progress * 0.4);
            profile.lift += 12 * pulse;
        } else if (pose === 'dead' || actionId === 'dead') {
            profile.reach -= 70;
            profile.lift += 36;
        }
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

    LizardBattleAdapter.prototype._prepareRenderer = function (side, unit, map) {
        var r = this.renderers[side];
        if (!r) return null;
        var motion = this._motionSample(side, unit, map);
        var dir = motion.facing || (side === 'left' ? 1 : -1);
        var profile = this._actionProfile(unit, motion);
        var speedPush = clamp(motion.speed * 5, 0, 46);
        var targetX = this.unitWidth * 0.5 + dir * (profile.reach + speedPush + profile.pulse * 12);
        var targetY = this.unitHeight * 0.48 + profile.lateral + profile.lift;
        r.mouseDown = true;
        r.mouseDragStart = r.mouseDragStart || { x: r.spine[0].x, y: r.spine[0].y, time: Date.now() };
        r.mouseX = targetX;
        r.mouseY = targetY + clamp(motion.dy * 0.22, -34, 34);
        r._battleActionProfile = profile;
        this._syncActionEffect(r, profile, unit);
        return r;
    };

    LizardBattleAdapter.prototype._renderUnitFrame = function (side, unit, map) {
        var r = this._prepareRenderer(side, unit, map);
        if (!r) return null;
        if (r.renderBattleFrame) r.renderBattleFrame({ clear: true, transparent: true });
        else if (r._render) r._render({ clear: true, transparent: true, skipTreadmill: true, skipLightDots: true, skipVision: true });
        return this.stages[side] && this.stages[side].canvas;
    };

    LizardBattleAdapter.prototype.render = function (ctx, units, options) {
        options = options || {};
        if (!this.ready) return false;
        var w = options.width || 960;
        var h = options.height || 560;
        var map = options.map || null;
        var self = this;
        ['left', 'right'].forEach(function (side) {
            var unit = units && units[side];
            if (!unit) return;
            var image = self._renderUnitFrame(side, unit, map);
            if (!image) return;
            var p = self._unitPoint(unit, w, h, side, map);
            var scale = clamp(w / 1200, 0.62, 1.05);
            var drawW = self.unitWidth * scale;
            var drawH = self.unitHeight * scale;
            ctx.save();
            ctx.globalAlpha = unit.hp <= 0 ? 0.35 : 1;
            if (unit.pose === 'dead' || unit.actionId === 'dead') {
                ctx.translate(p.x, p.y - drawH * 0.22);
                ctx.rotate(side === 'left' ? 0.22 : -0.22);
                ctx.drawImage(image, -drawW / 2, -drawH * 0.5, drawW, drawH);
            } else {
                var profile = self.renderers[side] && self.renderers[side]._battleActionProfile || {};
                var squash = clamp(profile.bodyScale || 1, 0.88, 1.12);
                ctx.translate(p.x, p.y - drawH * 0.72);
                ctx.scale(squash, 1 / Math.sqrt(squash));
                ctx.drawImage(image, -drawW / 2, 0, drawW, drawH);
            }
            ctx.restore();
            self._drawTracks(side, p);
            self.lastAnchors[side] = { head: { x: p.x, y: p.y - drawH * 0.36 }, unit: unit };
            self._drawHud(ctx, unit, p, side);
        });
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
        if (unit.actionId) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText(unit.actionId + ' ' + Math.round((unit.actionProgress || 0) * 100) + '%', p.x, p.y - 144);
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
