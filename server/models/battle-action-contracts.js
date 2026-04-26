'use strict';

const ACTION_CONTRACTS = {
    idle: { actionId: 'idle', type: 'idle', duration: 12, windup: 0, impact: 0, recover: 0, pose: 'idle', priority: 0 },
    move: { actionId: 'move', type: 'movement', duration: 12, windup: 0, impact: 0, recover: 0, pose: 'walk', priority: 10, rootMotion: true },
    fast_move: { actionId: 'fast_move', type: 'movement', duration: 10, windup: 0, impact: 0, recover: 0, pose: 'run', priority: 12, rootMotion: true, footstep: true },
    bite: { actionId: 'bite', type: 'melee', duration: 28, windup: 8, impact: 14, recover: 6, pose: 'bite', priority: 40, maxRange: 100 },
    scratch: { actionId: 'scratch', type: 'melee', duration: 26, windup: 7, impact: 13, recover: 6, pose: 'claw', priority: 40, maxRange: 100 },
    tail_whip: { actionId: 'tail_whip', type: 'melee', duration: 34, windup: 10, impact: 18, recover: 8, pose: 'tail_swing', priority: 40, maxRange: 120 },
    venom_spit: { actionId: 'venom_spit', type: 'projectile', duration: 42, windup: 14, impact: 24, recover: 8, pose: 'spit', priority: 42, maxRange: 300, projectileSpeed: 520 },
    dragon_rush: { actionId: 'dragon_rush', type: 'charge', duration: 38, windup: 8, impact: 24, recover: 8, pose: 'rush', priority: 45, maxRange: 120, rootMotion: { approach: 80, recoil: 16 } },
    dodge: { actionId: 'dodge', type: 'reaction', duration: 18, windup: 0, impact: 4, recover: 8, pose: 'dodge', priority: 70, rootMotion: { sidestep: 24 } },
    hit_react: { actionId: 'hit_react', type: 'reaction', duration: 18, windup: 0, impact: 4, recover: 10, pose: 'flinch', priority: 65 },
    heal: { actionId: 'heal', type: 'support', duration: 36, windup: 10, impact: 18, recover: 8, pose: 'heal', priority: 35 },
    buff: { actionId: 'buff', type: 'support', duration: 32, windup: 8, impact: 16, recover: 8, pose: 'buff', priority: 35 },
    camouflage: { actionId: 'camouflage', type: 'support', duration: 36, windup: 10, impact: 18, recover: 8, pose: 'camouflage', priority: 35 },
    iron_hide: { actionId: 'iron_hide', type: 'support', duration: 34, windup: 8, impact: 16, recover: 8, pose: 'brace', priority: 35 },
    regen: { actionId: 'regen', type: 'support', duration: 40, windup: 12, impact: 20, recover: 8, pose: 'regen', priority: 35 },
    predator_eye: { actionId: 'predator_eye', type: 'support', duration: 34, windup: 8, impact: 16, recover: 8, pose: 'focus', priority: 36 },
    shadow_step: { actionId: 'shadow_step', type: 'melee', duration: 30, windup: 6, impact: 16, recover: 8, pose: 'shadow_step', priority: 48, maxRange: 100 },
    flame_breath: { actionId: 'flame_breath', type: 'projectile', duration: 46, windup: 16, impact: 28, recover: 10, pose: 'breath', priority: 44, maxRange: 300 },
    gale_slash: { actionId: 'gale_slash', type: 'projectile', duration: 34, windup: 9, impact: 18, recover: 8, pose: 'gale_slash', priority: 43, maxRange: 300 },
    primal_roar: { actionId: 'primal_roar', type: 'fear', duration: 42, windup: 10, impact: 20, recover: 12, pose: 'roar', priority: 38 },
    listen_alert: { actionId: 'listen_alert', type: 'perception', duration: 24, windup: 0, impact: 8, recover: 8, pose: 'listen', priority: 20 },
    search_sound: { actionId: 'search_sound', type: 'perception', duration: 36, windup: 0, impact: 12, recover: 12, pose: 'search', priority: 20 },
    flee: { actionId: 'flee', type: 'movement', duration: 18, windup: 0, impact: 0, recover: 0, pose: 'flee', priority: 30, rootMotion: true },
    dead: { actionId: 'dead', type: 'terminal', duration: 45, windup: 0, impact: 12, recover: 30, pose: 'dead', priority: 100 },
};

function getActionContract(actionId) {
    return ACTION_CONTRACTS[actionId] || ACTION_CONTRACTS.idle;
}

module.exports = { ACTION_CONTRACTS, getActionContract };
