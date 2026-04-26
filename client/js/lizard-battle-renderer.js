(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.LizardBattleRenderer = factory(root);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function finite(v, fallback) { return Number.isFinite(Number(v)) ? Number(v) : fallback; }

    function resolveMap(map) {
        map = map || {};
        return {
            width: Math.max(200, finite(map.width, 800)),
            height: Math.max(200, finite(map.height, 600)),
            margin: Math.max(16, finite(map.margin, 20))
        };
    }

    function arenaRect(w, h, map) {
        var m = resolveMap(map);
        var padX = 40;
        var padTop = 72;
        var padBottom = 64;
        var availableW = Math.max(220, w - padX * 2);
        var availableH = Math.max(180, h - padTop - padBottom);
        var scale = Math.min(availableW / m.width, availableH / m.height);
        var drawW = m.width * scale;
        var drawH = m.height * scale;
        return {
            map: m,
            scale: scale,
            x: (w - drawW) / 2,
            y: padTop + (availableH - drawH) / 2,
            w: drawW,
            h: drawH
        };
    }

    function worldToCanvas(point, w, h, map) {
        var r = arenaRect(w, h, map);
        var m = r.map;
        return {
            x: r.x + clamp(finite(point && point.x, m.width / 2), 0, m.width) / m.width * r.w,
            y: r.y + clamp(finite(point && point.y, m.height / 2), 0, m.height) / m.height * r.h + finite(point && point.yOffset, 0)
        };
    }

    function worldRadiusToCanvas(radius, w, h, map) {
        return Math.max(1, finite(radius, 160) * arenaRect(w, h, map).scale);
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

    function LizardBattleRenderer(options) {
        options = options || {};
        this.SPINE_NODE_COUNT = options.spineNodes || 22;
        this.BASE_REF_W = 1200;
        this.BASE_SEGMENT_LENGTH = options.segmentLength || 18;
        this.BASE_LEG_LENGTH1 = options.legLength1 || 38;
        this.BASE_LEG_LENGTH2 = options.legLength2 || 34;
        this.BASE_STEP_DISTANCE = options.stepDistance || 50;
        this.tracks = { left: [], right: [] };
        this.maxTrackPoints = options.maxTrackPoints || 80;
        this.appearance = { left: null, right: null };
        this.lastAnchors = { left: null, right: null };
    }

    LizardBattleRenderer.prototype.reset = function () {
        this.tracks = { left: [], right: [] };
        this.lastAnchors = { left: null, right: null };
    };

    LizardBattleRenderer.prototype.setAppearance = function (appearance) {
        this.appearance = appearance || { left: null, right: null };
    };

    LizardBattleRenderer.prototype._scale = function (w) {
        return Math.max(0.35, Math.min(1, w / this.BASE_REF_W));
    };

    LizardBattleRenderer.prototype._resolveAppearance = function (side, options) {
        var app = (options && options.appearance) || this.appearance[side] || {};
        var rp = app.render_params || app.renderParams || {};
        var seed = app.body_seed || app.bodySeed || {};
        var hue = finite(seed.hue, side === 'left' ? 115 : 8);
        var sat = clamp(Math.round(38 * finite(rp.colorSaturation, 1)), 20, 90);
        var light = clamp(finite(seed.lightness, side === 'left' ? 36 : 40), 16, 58);
        var pattern = seed.patternColor || rp.patternColor || 'hsla(' + ((hue + 38) % 360) + ',' + sat + '%,' + clamp(light + 18, 28, 74) + '%,.72)';
        return {
            bodyWidth: clamp(finite(rp.bodyWidth, 1), 0.7, 2.2),
            segmentWidth: clamp(finite(rp.segmentWidth, 1), 0.7, 2.0),
            headScale: clamp(finite(rp.headScale, 1), 0.7, 2.2),
            limbThickness: clamp(finite(rp.limbThickness, 1), 0.45, 2.2),
            legGapRatio: clamp(finite(rp.legGapRatio, 1), 0.65, 1.65),
            patternComplexity: clamp(Math.round(finite(rp.patternComplexity, 1)), 0, 18),
            patternType: rp.patternType || seed.patternType || 'spots',
            spineCount: clamp(Math.round(finite(rp.spineCount, 0)), 0, 80),
            spineLength: clamp(finite(rp.spineLength, 1), 0, 3),
            spineNodes: clamp(Math.round(finite(rp.spineNodes, this.SPINE_NODE_COUNT)), 14, 34),
            colors: {
                body: seed.bodyColor || 'hsl(' + hue + ',' + sat + '%,' + light + '%)',
                head: seed.headColor || 'hsl(' + hue + ',' + Math.round(sat * 0.9) + '%,' + clamp(light + 4, 18, 64) + '%)',
                tail: seed.tailColor || 'hsl(' + hue + ',' + sat + '%,' + clamp(light - 8, 10, 54) + '%)',
                pattern: pattern,
                eye: seed.eyeColor || '#ffb347'
            }
        };
    };

    LizardBattleRenderer.prototype._segmentLengthAt = function (i, scale, app, nodeCount) {
        var n = nodeCount - 1;
        var t = i / n;
        var base = this.BASE_SEGMENT_LENGTH * scale * lerp(0.9, 1.08, clamp(app.spineNodes / 28, 0, 1));
        if (t < 0.052) return base * lerp(0.85, 1.0, t / 0.052);
        if (t < 0.40) return base * lerp(1.05, 0.92, (t - 0.052) / 0.348);
        if (t < 0.60) return base * lerp(0.92, 0.72, (t - 0.40) / 0.20);
        if (t < 0.80) return base * lerp(0.72, 0.55, (t - 0.60) / 0.20);
        return base * lerp(0.55, 0.30, (t - 0.80) / 0.20);
    };

    LizardBattleRenderer.prototype._bodyWidthAt = function (i, scale, app, nodeCount) {
        var n = nodeCount - 1;
        var t = i / n;
        var width;
        if (t < 0.052) width = lerp(9, 17, t / 0.052);
        else if (t < 0.10) width = lerp(17, 14, (t - 0.052) / 0.048);
        else if (t < 0.18) width = lerp(14, 24, (t - 0.10) / 0.08);
        else if (t < 0.30) width = lerp(24, 22, (t - 0.18) / 0.12);
        else if (t < 0.40) width = lerp(22, 17, (t - 0.30) / 0.10);
        else if (t < 0.50) width = lerp(17, 13, (t - 0.40) / 0.10);
        else if (t < 0.70) width = lerp(13, 6, (t - 0.50) / 0.20);
        else width = lerp(6, 1, (t - 0.70) / 0.30);
        var tailMul = t > 0.55 ? lerp(1, 0.75 + app.spineLength * 0.12, (t - 0.55) / 0.45) : 1;
        return width * scale * app.bodyWidth * app.segmentWidth * tailMul;
    };

    LizardBattleRenderer.prototype._unitToCanvas = function (unit, w, h, map, side) {
        return worldToCanvas(unit || spawnPoint(side || 'left', map), w, h, map);
    };

    LizardBattleRenderer.prototype._poseModifiers = function (unit, faceRight, scale) {
        var progress = clamp(finite(unit.actionProgress, 0), 0, 1);
        var pulse = Math.sin(progress * Math.PI);
        var actionId = unit.actionId || '';
        var pose = unit.pose || '';
        var hitKick = unit.impact ? 1 : 0;
        var dirSign = faceRight ? 1 : -1;
        var m = { headLift: 0, headThrust: 0, turn: 0, bodyWave: 0, coil: 0, compress: 0, stretch: 0, skillGlow: 0, recoil: hitKick * -12 * dirSign * scale };
        if (pose === 'listen' || pose === 'alert' || actionId === 'listen_alert' || actionId === 'search_sound') {
            m.headLift += (9 + pulse * 5) * scale;
            m.turn += (faceRight ? -1 : 1) * (0.14 + pulse * 0.1);
            m.bodyWave += 4 * scale;
        }
        if (pose === 'attack' || actionId === 'bite') {
            m.headThrust += (8 + pulse * 16) * dirSign * scale;
            m.compress += (1 - progress) * 8 * scale;
            m.stretch += pulse * 10 * scale;
            m.turn += (faceRight ? -1 : 1) * pulse * 0.18;
        }
        if (actionId === 'scratch') {
            m.headThrust += pulse * 9 * dirSign * scale;
            m.bodyWave += 6 * scale;
            m.turn += (faceRight ? -1 : 1) * pulse * 0.28;
        } else if (actionId === 'tail_whip') {
            m.coil += pulse * 12 * scale;
            m.turn += (faceRight ? 1 : -1) * pulse * 0.22;
        } else if (actionId === 'venom_spit' || actionId === 'predator_eye') {
            m.headLift += pulse * 10 * scale;
            m.headThrust += pulse * 7 * dirSign * scale;
            m.skillGlow = pulse;
        } else if (actionId === 'dragon_rush') {
            m.headThrust += (10 + pulse * 22) * dirSign * scale;
            m.stretch += 16 * pulse * scale;
            m.bodyWave += 8 * scale;
        } else if (actionId === 'regen') {
            m.headLift += pulse * 6 * scale;
            m.skillGlow = pulse;
            m.coil += pulse * 4 * scale;
        } else if (pose === 'skill') {
            m.headLift += pulse * 6 * scale;
            m.headThrust += pulse * 8 * dirSign * scale;
            m.skillGlow = pulse;
        } else if (pose === 'dodge') {
            m.coil += 9 * scale;
            m.recoil += -10 * dirSign * scale;
        }
        return m;
    };

    LizardBattleRenderer.prototype._makeSpine = function (unit, w, h, faceRight, app, map, side) {
        var scale = this._scale(w);
        var nodeCount = app.spineNodes;
        var head = this._unitToCanvas(unit, w, h, map, side);
        var mod = this._poseModifiers(unit, faceRight, scale);
        var dir = (faceRight ? 0 : Math.PI) + mod.turn;
        var motionPulse = unit.footPhase || 0;
        var pose = unit.pose || '';
        head.x += mod.headThrust + mod.recoil;
        head.y -= mod.headLift;
        var spine = [{ x: head.x, y: head.y - 38 * scale }];
        for (var i = 1; i < nodeCount; i++) {
            var prev = spine[i - 1];
            var t = i / (nodeCount - 1);
            var wave = Math.sin(t * Math.PI * 2.4 + motionPulse * Math.PI) * (1 - t * 0.25) * (9 * scale + mod.bodyWave * (1 - t));
            var coil = (pose === 'dodge' ? Math.sin(t * Math.PI * 3) * 7 * scale : 0) + Math.sin(t * Math.PI * 2.6) * mod.coil * (0.35 + t * 0.65);
            var angle = dir + Math.PI + (wave + coil) * 0.015;
            var len = this._segmentLengthAt(i - 1, scale, app, nodeCount);
            if (t < 0.32) len -= mod.compress * (1 - t / 0.32);
            if (t > 0.12 && t < 0.58) len += mod.stretch * (1 - Math.abs(t - 0.35) / 0.23);
            spine.push({ x: prev.x + Math.cos(angle) * len, y: prev.y + Math.sin(angle) * len + wave * 0.18 + coil * 0.16 });
        }
        return spine;
    };

    LizardBattleRenderer.prototype._traceBody = function (ctx, spine, scale, app) {
        var left = [];
        var right = [];
        for (var i = 0; i < spine.length; i++) {
            var node = spine[i];
            var next = spine[Math.min(i + 1, spine.length - 1)];
            var prev = spine[Math.max(0, i - 1)];
            var angle = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2;
            var width = this._bodyWidthAt(i, scale, app, spine.length);
            left.push({ x: node.x + Math.cos(angle) * width, y: node.y + Math.sin(angle) * width });
            right.push({ x: node.x - Math.cos(angle) * width, y: node.y - Math.sin(angle) * width });
        }
        ctx.beginPath();
        ctx.moveTo(spine[0].x, spine[0].y);
        left.forEach(function (p) { ctx.lineTo(p.x, p.y); });
        ctx.lineTo(spine[spine.length - 1].x, spine[spine.length - 1].y);
        for (var r = right.length - 1; r >= 0; r--) ctx.lineTo(right[r].x, right[r].y);
        ctx.closePath();
    };

    LizardBattleRenderer.prototype._legIndexAt = function (ratio, nodeCount) {
        return Math.max(2, Math.min(nodeCount - 3, Math.round((nodeCount - 1) * ratio)));
    };

    LizardBattleRenderer.prototype._drawLeg = function (ctx, spine, index, side, pairId, phase, scale, app) {
        var node = spine[index];
        var prev = spine[Math.max(0, index - 1)];
        var next = spine[Math.min(spine.length - 1, index + 1)];
        var axis = Math.atan2(next.y - prev.y, next.x - prev.x);
        var perp = axis + Math.PI / 2 * side;
        var bodyWidth = this._bodyWidthAt(index, scale, app, spine.length) * app.legGapRatio;
        var hip = { x: node.x + Math.cos(perp) * bodyWidth, y: node.y + Math.sin(perp) * bodyWidth };
        var reach = (this.BASE_LEG_LENGTH1 + this.BASE_LEG_LENGTH2 - 12) * scale * (0.85 + app.bodyWidth * 0.12);
        var stride = Math.sin(phase + pairId * Math.PI) * this.BASE_STEP_DISTANCE * 0.16 * scale;
        var foot = { x: hip.x + Math.cos(perp) * reach * 0.62 + Math.cos(axis) * stride, y: hip.y + Math.sin(perp) * reach * 0.62 + Math.sin(axis) * stride + Math.abs(Math.sin(phase + pairId * Math.PI)) * -7 * scale };
        var knee = { x: (hip.x + foot.x) / 2 + Math.cos(perp) * reach * 0.18, y: (hip.y + foot.y) / 2 + Math.sin(perp) * reach * 0.18 };
        ctx.strokeStyle = app.colors.tail;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, 7 * scale * app.limbThickness);
        ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
        ctx.lineWidth = Math.max(1, 2 * scale);
        ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(foot.x + Math.cos(axis) * 9 * scale, foot.y + Math.sin(axis) * 9 * scale); ctx.stroke();
    };

    LizardBattleRenderer.prototype._drawPattern = function (ctx, spine, app, scale) {
        var count = Math.min(app.patternComplexity, spine.length - 2);
        if (count <= 0) return;
        ctx.save();
        ctx.fillStyle = app.colors.pattern;
        ctx.strokeStyle = app.colors.pattern;
        ctx.lineWidth = Math.max(1, 2 * scale);
        for (var i = 0; i < count; i++) {
            var idx = Math.max(2, Math.min(spine.length - 3, Math.round(lerp(2, spine.length - 5, i / Math.max(1, count - 1)))));
            var p = spine[idx];
            var r = Math.max(1.5, this._bodyWidthAt(idx, scale, app, spine.length) * 0.22);
            if (app.patternType === 'stripes') {
                ctx.beginPath(); ctx.moveTo(p.x - r * 1.8, p.y - r); ctx.lineTo(p.x + r * 1.8, p.y + r); ctx.stroke();
            } else {
                ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.2, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    };

    LizardBattleRenderer.prototype._drawSpines = function (ctx, spine, app, scale) {
        var count = Math.min(app.spineCount, spine.length - 4);
        if (count <= 0 || app.spineLength <= 0) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(230,237,243,.75)';
        ctx.lineWidth = Math.max(1, 2 * scale);
        for (var i = 0; i < count; i++) {
            var idx = Math.max(2, Math.min(spine.length - 4, Math.round(lerp(2, spine.length - 5, i / Math.max(1, count - 1)))));
            var p = spine[idx];
            var prev = spine[Math.max(0, idx - 1)];
            var next = spine[Math.min(spine.length - 1, idx + 1)];
            var angle = Math.atan2(next.y - prev.y, next.x - prev.x) - Math.PI / 2;
            var len = (5 + app.spineLength * 4) * scale;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len); ctx.stroke();
        }
        ctx.restore();
    };

    LizardBattleRenderer.prototype._drawTracks = function (ctx, side, point) {
        var list = this.tracks[side] || [];
        var last = list[list.length - 1];
        if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 3) {
            list.push({ x: point.x, y: point.y });
            if (list.length > this.maxTrackPoints) list.shift();
        }
        this.tracks[side] = list;
    };

    LizardBattleRenderer.prototype.renderUnit = function (ctx, unit, options) {
        options = options || {};
        if (!unit) return null;
        var w = options.width || 960;
        var h = options.height || 560;
        var side = options.side || 'left';
        var app = this._resolveAppearance(side, options);
        var faceRight = options.faceRight !== false;
        var map = options.map || null;
        var scale = this._scale(w);
        var spine = this._makeSpine(unit, w, h, faceRight, app, map, side);
        var head = spine[0];
        var hpRatio = unit.maxHp > 0 ? clamp(unit.hp / unit.maxHp, 0, 1) : 0;
        this._drawTracks(ctx, side, head);
        this.lastAnchors[side] = { head: head, spine: spine, unit: unit, app: app };

        ctx.save();
        ctx.globalAlpha = unit.hp <= 0 ? 0.35 : 1;
        var phase = (unit.footPhase || 0) * Math.PI;
        this._drawLeg(ctx, spine, this._legIndexAt(0.07, spine.length), 1, 0, phase, scale, app);
        this._drawLeg(ctx, spine, this._legIndexAt(0.07, spine.length), -1, 0, phase + Math.PI, scale, app);
        this._drawLeg(ctx, spine, this._legIndexAt(0.28, spine.length), 1, 1, phase + Math.PI, scale, app);
        this._drawLeg(ctx, spine, this._legIndexAt(0.28, spine.length), -1, 1, phase, scale, app);

        ctx.fillStyle = app.colors.body;
        ctx.strokeStyle = unit.impact ? '#fff8c5' : app.colors.tail;
        ctx.lineWidth = unit.impact ? 4 : Math.max(1, 2 * scale);
        this._traceBody(ctx, spine, scale, app);
        ctx.fill(); ctx.stroke();
        this._drawPattern(ctx, spine, app, scale);
        this._drawSpines(ctx, spine, app, scale);

        var headAngle = Math.atan2(spine[0].y - spine[2].y, spine[0].x - spine[2].x);
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(headAngle);
        ctx.fillStyle = app.colors.head;
        ctx.strokeStyle = unit.impact ? '#fff8c5' : '#e6edf3';
        ctx.beginPath();
        ctx.ellipse(8 * scale, 0, 16 * scale * app.headScale, 12 * scale * app.headScale, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = app.colors.eye;
        ctx.beginPath(); ctx.ellipse(12 * scale, -8 * scale * app.headScale, 4 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(12 * scale, 8 * scale * app.headScale, 4 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (this._poseModifiers(unit, faceRight, scale).skillGlow > 0.05) {
            var glow = this._poseModifiers(unit, faceRight, scale).skillGlow;
            var aura = ctx.createRadialGradient(head.x, head.y, 4, head.x, head.y, 36 * scale + glow * 30 * scale);
            aura.addColorStop(0, 'rgba(210,168,255,.45)');
            aura.addColorStop(1, 'rgba(210,168,255,0)');
            ctx.save();
            ctx.fillStyle = aura;
            ctx.beginPath(); ctx.arc(head.x, head.y, 36 * scale + glow * 30 * scale, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        ctx.restore();

        ctx.fillStyle = '#21262d'; ctx.fillRect(head.x - 52, head.y - 56, 104, 8);
        ctx.fillStyle = hpRatio > 0.45 ? '#3fb950' : hpRatio > 0.2 ? '#f59e0b' : '#f85149';
        ctx.fillRect(head.x - 52, head.y - 56, 104 * hpRatio, 8);
        ctx.fillStyle = '#c9d1d9'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(unit.st + ' HP ' + Math.round(unit.hp), head.x, head.y - 64);
        if (unit.actionId) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText(unit.actionId + ' ' + Math.round((unit.actionProgress || 0) * 100) + '%', head.x, head.y - 78);
        }
        return { head: head, spine: spine };
    };

    LizardBattleRenderer.prototype._eventPoint = function (fx, units, w, h, map) {
        if (Number.isFinite(Number(fx.x)) || Number.isFinite(Number(fx.y))) return worldToCanvas(fx, w, h, map);
        var side = fx.target || fx.actor || 'left';
        var anchor = this.lastAnchors[side];
        if (anchor) return anchor.head;
        var unit = units && units[side];
        return unit ? this._unitToCanvas(unit, w, h, map, side) : worldToCanvas(spawnPoint(side, map), w, h, map);
    };

    LizardBattleRenderer.prototype._sidePoint = function (side, units, w, h, map) {
        var anchor = this.lastAnchors[side];
        if (anchor) return anchor.head;
        return units && units[side] ? this._unitToCanvas(units[side], w, h, map, side) : worldToCanvas(spawnPoint(side, map), w, h, map);
    };

    LizardBattleRenderer.prototype._drawParticleBurst = function (ctx, p, t, count, color, intensity) {
        ctx.fillStyle = color;
        for (var i = 0; i < count; i++) {
            var a = i / count * Math.PI * 2 + Math.sin(i * 12.989) * 0.35;
            var d = (14 + (i % 5) * 7 + intensity * 18) * (0.25 + t);
            var r = Math.max(1.2, (4 - t * 2.5) * (0.7 + (i % 3) * 0.18));
            ctx.beginPath();
            ctx.arc(p.x + Math.cos(a) * d, p.y - 38 + Math.sin(a) * d, r, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    LizardBattleRenderer.prototype._drawSkillTrail = function (ctx, fx, units, w, h, t, intensity, map) {
        var actor = this._sidePoint(fx.actor || 'left', units, w, h, map);
        var target = this._sidePoint(fx.target || (fx.actor === 'left' ? 'right' : 'left'), units, w, h, map);
        var skill = fx.skill || fx.fxId || 'skill';
        var colors = {
            venom_spit: 'rgba(77,255,136,', dragon_rush: 'rgba(255,138,76,', regen: 'rgba(63,185,80,',
            predator_eye: 'rgba(255,77,109,', tail_whip: 'rgba(245,158,11,', scratch: 'rgba(255,248,197,',
            camouflage: 'rgba(210,168,255,', iron_hide: 'rgba(139,148,158,'
        };
        var c = colors[skill] || 'rgba(210,168,255,';
        ctx.strokeStyle = c + (0.25 + intensity * 0.55) + ')';
        ctx.fillStyle = c + (0.35 + intensity * 0.45) + ')';
        ctx.lineWidth = 3 + intensity * 3;
        ctx.lineCap = 'round';
        if (skill === 'regen' || skill === 'camouflage' || skill === 'iron_hide' || skill === 'predator_eye') {
            var center = skill === 'predator_eye' ? target : actor;
            for (var r = 0; r < 3; r++) {
                ctx.beginPath();
                ctx.arc(center.x, center.y - 38, 18 + r * 12 + t * 30, 0, Math.PI * 2);
                ctx.stroke();
            }
            this._drawParticleBurst(ctx, center, t, skill === 'regen' ? 18 : 12, c + '0.9)', intensity);
            if (skill === 'predator_eye') {
                ctx.beginPath(); ctx.moveTo(actor.x, actor.y - 40); ctx.lineTo(target.x, target.y - 40); ctx.stroke();
            }
            return;
        }
        ctx.beginPath();
        ctx.moveTo(actor.x, actor.y - 40);
        var midX = lerp(actor.x, target.x, clamp(t + 0.18, 0, 1));
        var arcY = lerp(actor.y, target.y, 0.5) - 75 - Math.sin(t * Math.PI) * 30;
        if (skill === 'venom_spit') ctx.quadraticCurveTo((actor.x + target.x) / 2, arcY, midX, lerp(actor.y - 40, target.y - 40, t));
        else ctx.lineTo(lerp(actor.x, target.x, t), lerp(actor.y - 40, target.y - 40, t));
        ctx.stroke();
        this._drawParticleBurst(ctx, { x: lerp(actor.x, target.x, t), y: lerp(actor.y, target.y, t) }, t, skill === 'dragon_rush' ? 18 : 10, c + '0.9)', intensity);
    };

    LizardBattleRenderer.prototype._drawSoundPropagation = function (ctx, fx, p, w, h, t, intensity, map) {
        var maxR = worldRadiusToCanvas(fx.radius, w, h, map);
        var color = fx.fxId === 'fake_sound_wave' ? '210,168,255' : '88,166,255';
        ctx.lineWidth = 1.5 + intensity * 2.5;
        for (var r = 0; r < 5; r++) {
            var rt = t + r * 0.14;
            if (rt > 1.15) continue;
            ctx.strokeStyle = 'rgba(' + color + ',' + Math.max(0, (1 - rt) * (0.25 + intensity * 0.35)) + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y - 35, maxR * rt, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (var i = 0; i < 16; i++) {
            var a = i / 16 * Math.PI * 2;
            var jitter = Math.sin(i * 7.13 + t * 9) * 5;
            var d = maxR * clamp(t + (i % 4) * 0.035, 0, 1) + jitter;
            ctx.fillStyle = 'rgba(' + color + ',' + Math.max(0, (1 - t) * 0.45) + ')';
            ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y - 35 + Math.sin(a) * d, 1.6 + intensity, 0, Math.PI * 2); ctx.fill();
        }
    };

    LizardBattleRenderer.prototype.drawVisualFx = function (ctx, fxList, options) {
        options = options || {};
        var w = options.width || 960;
        var h = options.height || 560;
        var units = options.units || {};
        var map = options.map || null;
        var self = this;
        (fxList || []).forEach(function (fx) {
            var t = clamp(fx.progress || 0, 0, 1);
            var p = self._eventPoint(fx, units, w, h, map);
            var intensity = clamp(finite(fx.intensity, 0.6), 0.1, 1.3);
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.85;
            if (fx.fxId === 'sound_wave' || fx.fxId === 'fake_sound_wave') {
                self._drawSoundPropagation(ctx, fx, p, w, h, t, intensity, map);
            } else if (fx.fxId === 'dodge_spark' || fx.fxId === 'decoy_dodge') {
                ctx.strokeStyle = fx.fxId === 'decoy_dodge' ? 'rgba(245,158,11,.95)' : 'rgba(126,231,135,.95)';
                ctx.lineWidth = 3;
                ctx.setLineDash([6, 5]);
                ctx.beginPath(); ctx.arc(p.x, p.y - 38, 18 + 26 * t, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('闪避', p.x, p.y - 72 - t * 18);
            } else if (fx.fxId === 'skill_glow') {
                self._drawSkillTrail(ctx, fx, units, w, h, t, intensity, map);
                var grad = ctx.createRadialGradient(p.x, p.y - 38, 4, p.x, p.y - 38, 46 + 26 * t);
                grad.addColorStop(0, 'rgba(210,168,255,.75)');
                grad.addColorStop(1, 'rgba(210,168,255,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(p.x, p.y - 38, 46 + 26 * t, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(210,168,255,.9)'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fx.skill || 'skill', p.x, p.y - 82);
            } else {
                ctx.strokeStyle = fx.fxId === 'crit_hit' ? 'rgba(248,81,73,.95)' : 'rgba(255,248,197,.95)';
                ctx.fillStyle = ctx.strokeStyle;
                ctx.lineWidth = 3 + intensity * 2;
                var rays = fx.fxId === 'crit_hit' ? 10 : 7;
                for (var i = 0; i < rays; i++) {
                    var a = i / rays * Math.PI * 2;
                    var inner = 8 + t * 4;
                    var outer = 24 + intensity * 20 + t * 16;
                    ctx.beginPath();
                    ctx.moveTo(p.x + Math.cos(a) * inner, p.y - 38 + Math.sin(a) * inner);
                    ctx.lineTo(p.x + Math.cos(a) * outer, p.y - 38 + Math.sin(a) * outer);
                    ctx.stroke();
                }
                self._drawParticleBurst(ctx, p, t, rays + 4, ctx.strokeStyle, intensity);
                ctx.beginPath(); ctx.arc(p.x, p.y - 38, 5 + 9 * intensity, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        });
    };

    LizardBattleRenderer.prototype.drawMotionDebug = function (ctx) {
        var sides = Object.keys(this.tracks);
        for (var s = 0; s < sides.length; s++) {
            var side = sides[s];
            var list = this.tracks[side];
            if (!list || list.length < 2) continue;
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
                ctx.beginPath(); ctx.arc(list[p].x, list[p].y, 2.5, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
    };

    return LizardBattleRenderer;
}));
