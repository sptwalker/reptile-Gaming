(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.BattleAnimator = factory(root);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    function smoothstep(t) {
        t = clamp01(t);
        return t * t * (3 - 2 * t);
    }

    function cloneUnit(unit) {
        var out = {};
        Object.keys(unit || {}).forEach(function (key) { out[key] = unit[key]; });
        return out;
    }

    function finite(v, fallback) {
        var n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function normalizeAngle(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    function smoothAngle(current, target, amount) {
        if (!Number.isFinite(Number(current))) return target;
        if (!Number.isFinite(Number(target))) return current;
        return normalizeAngle(current + normalizeAngle(target - current) * clamp01(amount));
    }

    function samplePath(event, t, eased) {
        var from = event.from;
        var to = event.to;
        var dx = to.x - from.x;
        var dy = to.y - from.y;
        var x = from.x + dx * eased;
        var y = from.y + dy * eased;
        var pathType = event.pathType || event.rootMotionType || '';
        var actionId = event.actionId || '';
        var shouldArc = pathType === 'arc' || pathType === 'flank' || actionId === 'shadow_step' || actionId === 'dodge';
        var shouldRetreat = pathType === 'retreat' || actionId === 'flee';
        var shouldLunge = pathType === 'lunge' || actionId === 'dragon_rush';
        if (shouldArc || shouldRetreat || shouldLunge) {
            var dist = Math.max(1, Math.hypot(dx, dy));
            var nx = -dy / dist;
            var ny = dx / dist;
            var side = event.actor === 'right' ? -1 : 1;
            var amp = Math.min(80, Math.max(12, dist * 0.22));
            var curve = Math.sin(Math.PI * t);
            if (shouldRetreat) amp *= -0.35;
            if (shouldLunge) amp *= 0.18;
            x += nx * amp * curve * side;
            y += ny * amp * curve * side;
            if (shouldLunge) {
                var punch = Math.sin(Math.PI * Math.min(1, t * 1.35));
                x += dx / dist * amp * 0.35 * punch;
                y += dy / dist * amp * 0.35 * punch;
            }
        }
        return { x: x, y: y, pathType: pathType || (shouldLunge ? 'lunge' : shouldArc ? 'arc' : shouldRetreat ? 'retreat' : 'line') };
    }

    function getPriority(event, contracts) {
        if (typeof event.priority === 'number') return event.priority;
        var contract = contracts && contracts.getActionContract ? contracts.getActionContract(event.actionId) : null;
        return contract && typeof contract.priority === 'number' ? contract.priority : 0;
    }


    function BattleAnimator(options) {
        options = options || {};
        this.contracts = options.contracts || (root.BattleActionContracts || null);
        this.currentFrame = 0;
        this.renderFrame = 0;
        this.units = { left: null, right: null };
        this.actions = { left: null, right: null };
        this.motions = { left: null, right: null };
        this.fxQueue = [];
    }

    BattleAnimator.prototype.reset = function () {
        this.currentFrame = 0;
        this.renderFrame = 0;
        this.units = { left: null, right: null };
        this.actions = { left: null, right: null };
        this.motions = { left: null, right: null };
        this.fxQueue = [];
    };

    BattleAnimator.prototype.ingestState = function (state) {
        if (!state) return;
        if (state.frame < this.currentFrame) this.reset();
        var prevFrame = this.currentFrame || 0;
        this.currentFrame = state.frame || 0;
        if (!this.renderFrame || this.renderFrame > this.currentFrame || this.renderFrame < prevFrame - 1) {
            this.renderFrame = Math.max(prevFrame, this.currentFrame - 4);
        }
        this._syncUnit('left', state.units && state.units.left);
        this._syncUnit('right', state.units && state.units.right);
        this.ingestEvents(state.events || []);
        this._expireTransient();
    };

    BattleAnimator.prototype.ingestEvents = function (events) {
        var self = this;
        (events || []).forEach(function (event) {
            if (!event) return;
            if (event.type === 'movement') self._acceptMotion(event);
            else if (event.type === 'combat_action' || event.type === 'perception_action') self._acceptAction(event);
            else if (event.type === 'visual_fx') self._acceptFx(event);
        });
    };

    BattleAnimator.prototype._syncUnit = function (side, unit) {
        if (!unit) return;
        var visual = this.units[side] || cloneUnit(unit);
        var hadVisual = !!this.units[side];
        Object.keys(unit).forEach(function (key) {
            if (key !== 'x' && key !== 'y') visual[key] = unit[key];
        });
        var serverX = finite(unit.x, finite(visual.x, 0));
        var serverY = finite(unit.y, finite(visual.y, 0));
        visual.serverX = serverX;
        visual.serverY = serverY;
        if (!hadVisual || !Number.isFinite(Number(visual.x)) || !Number.isFinite(Number(visual.y))) {
            visual.x = serverX;
            visual.y = serverY;
        } else {
            var dx = serverX - visual.x;
            var dy = serverY - visual.y;
            var dist = Math.hypot(dx, dy);
            var correction = dist > 160 ? 0.35 : dist > 64 ? 0.18 : 0.08;
            visual.x = lerp(visual.x, serverX, correction);
            visual.y = lerp(visual.y, serverY, correction);
        }
        visual.yOffset = 0;
        this.units[side] = visual;
    };

    BattleAnimator.prototype._acceptMotion = function (event) {
        var side = event.actor;
        if (!side || !this.units[side]) return;
        this.motions[side] = event;
        var current = this.actions[side];
        var currentPriority = current ? getPriority(current, this.contracts) : -1;
        var currentEnded = !current || this.currentFrame >= (current.endFrame || current.frame || 0);
        if (currentEnded || currentPriority <= 20) this._acceptAction(event);
    };

    BattleAnimator.prototype._acceptAction = function (event) {
        var side = event.actor;
        if (!side) return;
        var current = this.actions[side];
        var priority = getPriority(event, this.contracts);
        var currentPriority = current ? getPriority(current, this.contracts) : -1;
        var currentEnded = !current || this.currentFrame >= (current.endFrame || current.frame || 0);
        var currentStart = current ? (current.startFrame != null ? current.startFrame : current.frame || 0) : 0;
        var currentEnd = current ? (current.endFrame != null ? current.endFrame : currentStart + 1) : 0;
        var currentProgress = current ? clamp01((this.currentFrame - currentStart) / Math.max(1, currentEnd - currentStart)) : 1;
        var canBlendOut = currentProgress > 0.72 && priority >= currentPriority - 18;
        if (currentEnded || priority >= currentPriority || canBlendOut) {
            this.actions[side] = event;
        }
    };

    BattleAnimator.prototype._acceptFx = function (event) {
        var item = cloneUnit(event);
        item.startFrame = event.frame != null ? event.frame : this.currentFrame;
        item.endFrame = item.startFrame + (event.duration || 18);
        this.fxQueue.push(item);
        if (this.fxQueue.length > 40) this.fxQueue = this.fxQueue.slice(-40);
    };

    BattleAnimator.prototype.advanceRenderFrame = function (dt) {
        var step = Number(dt);
        if (!Number.isFinite(step) || step <= 0) step = 1;
        var target = this.currentFrame || 0;
        var current = this.renderFrame || target;
        if (current > target || current < target - 10) current = Math.max(0, target - 4);
        this.renderFrame = Math.min(target, current + step);
        this._expireTransient(this.renderFrame);
    };

    BattleAnimator.prototype._expireTransient = function (sampleFrame) {
        var frame = sampleFrame != null ? sampleFrame : this.currentFrame;
        var self = this;
        ['left', 'right'].forEach(function (side) {
            var motion = self.motions[side];
            if (motion && frame > motion.endFrame) self.motions[side] = null;
            var action = self.actions[side];
            if (action && frame > action.endFrame) self.actions[side] = null;
        });
        this.fxQueue = this.fxQueue.filter(function (fx) { return frame <= fx.endFrame; });
    };

    BattleAnimator.prototype.sampleRootMotion = function (event, frame) {
        if (!event || !event.from || !event.to) return null;
        var start = event.startFrame != null ? event.startFrame : (event.frame != null ? event.frame : frame);
        var end = event.endFrame != null ? event.endFrame : start + 1;
        var t = clamp01((frame - start) / Math.max(1, end - start));
        var eased = smoothstep(t);
        var dx = event.to.x - event.from.x;
        var dy = event.to.y - event.from.y;
        var speed = Math.max(1, Number(event.speed || 1));
        var bob = Math.min(12, 2 + speed * 0.8) * Math.sin(Math.PI * t);
        var path = samplePath(event, t, eased);
        return {
            x: path.x,
            y: path.y,
            pathType: path.pathType,
            yOffset: -bob,
            progress: t,
            easedProgress: eased,
            footPhase: Math.sin(Math.PI * 2 * t),
            velocityX: dx / Math.max(1, end - start),
            velocityY: dy / Math.max(1, end - start)
        };
    };

    BattleAnimator.prototype.getUnitVisual = function (side, fallback) {
        var base = cloneUnit(this.units[side] || fallback || {});
        var motion = this.motions[side];
        var sampleFrame = this.renderFrame || this.currentFrame;
        var motionSample = this.sampleRootMotion(motion, sampleFrame);
        var action = this.actions[side];
        if (motionSample) {
            base.x = motionSample.x;
            base.y = motionSample.y;
            base.visualX = motionSample.x;
            base.visualY = motionSample.y;
            base.serverX = finite(base.serverX, motionSample.x);
            base.serverY = finite(base.serverY, motionSample.y);
            base.yOffset = motionSample.yOffset;
            base.footPhase = motionSample.footPhase;
            base.motionProgress = motionSample.progress;
            base.velocityX = motionSample.velocityX;
            base.velocityY = motionSample.velocityY;
            base.motionPathType = motionSample.pathType;
        } else if (Number.isFinite(Number(base.serverX)) && Number.isFinite(Number(base.serverY))) {
            var dx = base.serverX - finite(base.x, base.serverX);
            var dy = base.serverY - finite(base.y, base.serverY);
            var dist = Math.hypot(dx, dy);
            var correction = dist > 160 ? 0.3 : dist > 64 ? 0.14 : 0.06;
            base.x = lerp(finite(base.x, base.serverX), base.serverX, correction);
            base.y = lerp(finite(base.y, base.serverY), base.serverY, correction);
            base.visualX = base.x;
            base.visualY = base.y;
            base.velocityX = dx * correction;
            base.velocityY = dy * correction;
        }
        var moveSpeed = Math.hypot(finite(base.velocityX, 0), finite(base.velocityY, 0));
        var moveFacing = moveSpeed > 0.001 ? Math.atan2(base.velocityY, base.velocityX) : null;
        var serverFacing = Number.isFinite(Number(base.facing)) ? Number(base.facing) : null;
        var previousBody = Number.isFinite(Number(base.bodyFacing)) ? Number(base.bodyFacing) : (serverFacing !== null ? serverFacing : moveFacing);
        var faceIntent = serverFacing !== null ? serverFacing : moveFacing;
        var motionBlend = moveSpeed > 0.035 && moveFacing !== null ? Math.min(0.42, Math.max(0.12, moveSpeed * 0.08)) : 0;
        var bodyTarget = faceIntent !== null && moveFacing !== null
            ? smoothAngle(faceIntent, moveFacing, motionBlend)
            : (faceIntent !== null ? faceIntent : moveFacing);
        var bodyTurn = moveSpeed > 0.001 ? 0.18 : 0.12;
        base.moveFacing = moveFacing !== null ? moveFacing : previousBody;
        base.bodyFacing = bodyTarget !== null ? smoothAngle(previousBody, bodyTarget, bodyTurn) : previousBody;
        base.lookFacing = serverFacing !== null ? smoothAngle(Number.isFinite(Number(base.lookFacing)) ? base.lookFacing : base.bodyFacing, serverFacing, 0.42) : base.bodyFacing;
        base.facing = Number.isFinite(Number(base.lookFacing)) ? base.lookFacing : base.facing;
        if (action) {
            base.actionId = action.actionId;
            base.pose = action.pose;
            base.actionPriority = getPriority(action, this.contracts);
            var actionStart = action.startFrame != null ? action.startFrame : (action.frame != null ? action.frame : sampleFrame);
            var actionEnd = action.endFrame != null ? action.endFrame : sampleFrame + 1;
            base.actionProgress = clamp01((sampleFrame - actionStart) / Math.max(1, actionEnd - actionStart));
            base.impact = action.impactFrame != null && Math.abs(sampleFrame - action.impactFrame) <= 1;
        }
        return base;
    };

    BattleAnimator.prototype.getActiveFx = function () {
        var frame = this.renderFrame || this.currentFrame;
        return this.fxQueue.map(function (fx) {
            var out = cloneUnit(fx);
            out.progress = clamp01((frame - fx.startFrame) / Math.max(1, fx.endFrame - fx.startFrame));
            return out;
        });
    };

    return BattleAnimator;
}));
