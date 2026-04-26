'use strict';

const { getActionContract } = require('../models/battle-action-contracts');

function _point(unit) {
    return { x: Math.round(unit.x), y: Math.round(unit.y) };
}

function _contractTiming(actionId, frame) {
    const contract = getActionContract(actionId);
    const startFrame = frame;
    const impactFrame = frame + (contract.impact || Math.floor((contract.duration || 1) / 2));
    const endFrame = frame + (contract.duration || 1);
    return { contract, startFrame, impactFrame, endFrame };
}

function _surface(map) {
    return (map && (map.soundSurface || map.terrain)) || 'grass';
}

function mapMovementAction({ actor, from, to, speed, frame, map, actionId }) {
    const id = actionId || (speed >= 3 ? 'fast_move' : 'move');
    const { contract, startFrame, endFrame } = _contractTiming(id, frame);
    return {
        type: 'movement',
        actionId: id,
        actor: actor.side,
        startFrame,
        endFrame,
        from,
        to,
        speed,
        fast: id === 'fast_move',
        surface: _surface(map),
        pose: contract.pose,
        priority: contract.priority,
    };
}

function mapAttackAction({ actor, target, frame, result, targetPart, actionId = 'bite' }) {
    const { contract, startFrame, impactFrame, endFrame } = _contractTiming(actionId, frame);
    const hit = !result.dodged && result.damage > 0;
    return {
        type: 'combat_action',
        actionId,
        actor: actor.side,
        target: target.side,
        startFrame,
        impactFrame,
        endFrame,
        targetPart: result.part || targetPart,
        result: {
            hit,
            dodged: !!result.dodged,
            crit: !!result.crit,
            damage: Math.max(0, Number(result.damage || 0)),
            part: result.part || targetPart,
            decoy: !!result.decoy,
            attackZone: result.attackZone || (result.angleBonus && result.angleBonus.zone) || null,
            flankScore: result.flankScore != null ? result.flankScore : result.angleBonus && result.angleBonus.flankScore,
            flankAngle: result.flankAngle != null ? result.flankAngle : result.angleBonus && result.angleBonus.angle,
            angleBonus: result.angleBonus || null,
        },
        motion: {
            actorFrom: _point(actor),
            actorTo: _point(actor),
            targetFrom: _point(target),
            targetImpulse: hit ? { x: actor.x <= target.x ? 10 : -10, y: -2 } : { x: 0, y: 0 },
        },
        fx: {
            impact: result.dodged ? 'dodge' : result.crit ? 'crit_hit' : 'hit',
            hitFlash: hit,
            cameraShake: result.crit ? 0.35 : hit ? 0.18 : 0,
        },
        pose: contract.pose,
        priority: contract.priority,
    };
}

function mapSkillAction({ actor, target, frame, skillCode, effect, result, targetPart }) {
    const actionId = skillCode || 'buff';
    const { contract, startFrame, impactFrame, endFrame } = _contractTiming(actionId, frame);
    const damage = result ? Math.max(0, Number(result.damage || 0)) : 0;
    const dodged = !!(result && result.dodged);
    const hit = !!result && !dodged && damage > 0;
    return {
        type: 'combat_action',
        actionId,
        actor: actor.side,
        target: target ? target.side : null,
        startFrame,
        impactFrame,
        endFrame,
        targetPart: result && result.part ? result.part : targetPart || null,
        result: {
            hit,
            dodged,
            crit: !!(result && result.crit),
            damage,
            part: result && result.part ? result.part : targetPart || null,
            effect: effect ? effect.effect || effect.type : null,
            decoy: !!(result && result.decoy),
            attackZone: result && (result.attackZone || result.angleBonus && result.angleBonus.zone) || null,
            flankScore: result && (result.flankScore != null ? result.flankScore : result.angleBonus && result.angleBonus.flankScore),
            flankAngle: result && (result.flankAngle != null ? result.flankAngle : result.angleBonus && result.angleBonus.angle),
            angleBonus: result && result.angleBonus || null,
        },
        motion: {
            actorFrom: _point(actor),
            actorTo: _point(actor),
            targetFrom: target ? _point(target) : null,
            targetImpulse: hit && target ? { x: actor.x <= target.x ? 14 : -14, y: -3 } : { x: 0, y: 0 },
        },
        fx: {
            impact: actionId,
            hitFlash: hit,
            cameraShake: hit ? Math.min(0.5, 0.16 + damage / 800) : 0,
        },
        pose: contract.pose,
        priority: contract.priority,
    };
}

function mapPerceptionAction(perceptionEvent, frame) {
    if (!perceptionEvent || perceptionEvent.type !== 'perception') return null;
    const actionId = perceptionEvent.fake ? 'search_sound' : 'listen_alert';
    const { contract, startFrame, endFrame } = _contractTiming(actionId, frame || perceptionEvent.frame || 0);
    return {
        type: 'perception_action',
        actionId,
        actor: perceptionEvent.src,
        startFrame,
        endFrame,
        lookAt: {
            x: perceptionEvent.lastKnownX,
            y: perceptionEvent.lastKnownY,
        },
        direction: perceptionEvent.direction,
        angle: perceptionEvent.angle,
        vector: perceptionEvent.vector,
        cause: {
            type: 'sound',
            soundType: perceptionEvent.soundType,
            source: perceptionEvent.tgt,
            confidence: perceptionEvent.confidence,
            fake: !!perceptionEvent.fake,
        },
        pose: contract.pose,
        priority: contract.priority,
    };
}

function mapVisualFx(event) {
    if (!event) return null;
    if (event.type === 'sound') {
        return {
            type: 'visual_fx',
            fxId: event.fake ? 'fake_sound_wave' : 'sound_wave',
            frame: event.frame,
            x: event.x,
            y: event.y,
            radius: event.radius,
            intensity: Math.max(0.1, Math.min(1, event.volume / 50)),
            surface: event.surface,
        };
    }
    if (event.type === 'hit' || event.type === 'crit' || event.type === 'skill_hit') {
        return {
            type: 'visual_fx',
            fxId: event.type === 'crit' || event.crit ? 'crit_hit' : event.type === 'skill_hit' ? 'skill_glow' : 'hit_flash',
            frame: event.frame,
            actor: event.src,
            target: event.tgt,
            skill: event.skill || null,
            intensity: event.crit ? 1 : event.type === 'skill_hit' ? 0.85 : 0.6,
        };
    }
    if (event.type === 'dodge' || event.type === 'tail_decoy') {
        return {
            type: 'visual_fx',
            fxId: event.type === 'tail_decoy' ? 'decoy_dodge' : 'dodge_spark',
            frame: event.frame,
            actor: event.src,
            target: event.tgt,
            intensity: event.type === 'tail_decoy' ? 0.9 : 0.65,
        };
    }
    if (event.type === 'combat_action' && event.fx && event.fx.impact) {
        return {
            type: 'visual_fx',
            fxId: event.fx.impact === 'dodge' ? 'dodge_spark' : event.fx.impact === 'crit_hit' ? 'crit_hit' : event.actionId && event.actionId !== 'bite' ? 'skill_glow' : 'hit_flash',
            frame: event.impactFrame || event.frame || event.startFrame,
            actor: event.actor,
            target: event.target,
            skill: event.actionId !== 'bite' ? event.actionId : null,
            intensity: event.fx.impact === 'crit_hit' ? 1 : event.actionId && event.actionId !== 'bite' ? 0.85 : 0.6,
        };
    }
    return null;
}

function appendDerivedAnimationEvents(events, frame) {
    const derived = [];
    for (const event of events) {
        const perceptionAction = mapPerceptionAction(event, frame);
        if (perceptionAction) derived.push(perceptionAction);
        const visualFx = mapVisualFx(event);
        if (visualFx) derived.push(visualFx);
    }
    return derived.length ? events.concat(derived) : events;
}

module.exports = {
    mapMovementAction,
    mapAttackAction,
    mapSkillAction,
    mapPerceptionAction,
    mapVisualFx,
    appendDerivedAnimationEvents,
};
