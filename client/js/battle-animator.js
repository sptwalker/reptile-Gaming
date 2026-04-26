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
        this.currentFrame = state.frame || 0;
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
        Object.keys(unit).forEach(function (key) {
            if (key !== 'x' && key !== 'y') visual[key] = unit[key];
        });
        if (!this.motions[side] || this.currentFrame >= this.motions[side].endFrame) {
            visual.x = unit.x;
            visual.y = unit.y;
            visual.yOffset = 0;
        }
        this.units[side] = visual;
    };

    BattleAnimator.prototype._acceptMotion = function (event) {
        var side = event.actor;
        if (!side || !this.units[side]) return;
        this.motions[side] = event;
        this._acceptAction(event);
    };

    BattleAnimator.prototype._acceptAction = function (event) {
        var side = event.actor;
        if (!side) return;
        var current = this.actions[side];
        var priority = getPriority(event, this.contracts);
        var currentPriority = current ? getPriority(current, this.contracts) : -1;
        var currentEnded = !current || this.currentFrame >= (current.endFrame || current.frame || 0);
        if (currentEnded || priority >= currentPriority) {
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
        this.renderFrame = Math.max(this.renderFrame || 0, this.currentFrame || 0) + step;
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
        return {
            x: event.from.x + dx * eased,
            y: event.from.y + dy * eased,
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
            base.yOffset = motionSample.yOffset;
            base.footPhase = motionSample.footPhase;
            base.motionProgress = motionSample.progress;
        }
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
