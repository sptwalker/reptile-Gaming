(function (global) {
    'use strict';

    var ACTION_CONTRACTS = {
        idle: { actionId: 'idle', type: 'idle', duration: 12, windup: 0, impact: 0, recover: 0, pose: 'idle', priority: 0, tags: ['neutral'] },
        move: { actionId: 'move', type: 'movement', duration: 12, windup: 0, impact: 0, recover: 0, pose: 'walk', priority: 10, rootMotion: true, staminaCost: 0, cooldown: 0, tags: ['movement'] },
        fast_move: { actionId: 'fast_move', type: 'movement', duration: 10, windup: 0, impact: 0, recover: 0, pose: 'run', priority: 12, rootMotion: true, footstep: true, staminaCost: 1, cooldown: 0, tags: ['movement', 'loud'] },
        flee: { actionId: 'flee', type: 'movement', duration: 18, windup: 0, impact: 0, recover: 0, pose: 'flee', priority: 30, rootMotion: true, staminaCost: 1, cooldown: 0, tags: ['movement', 'escape'] },

        quick_snap: { actionId: 'quick_snap', type: 'melee', duration: 18, windup: 4, impact: 8, recover: 6, pose: 'bite', priority: 38, maxRange: 88, staminaCost: 2, cooldown: 24, interruptible: true, armor: 0, counterWindow: { start: 5, end: 10 }, tags: ['attack', 'fast', 'starter'] },
        bite: { actionId: 'bite', type: 'melee', duration: 28, windup: 8, impact: 14, recover: 6, pose: 'bite', priority: 40, maxRange: 100, staminaCost: 3, cooldown: 42, interruptible: true, armor: 0, counterWindow: { start: 8, end: 15 }, tags: ['attack', 'core'] },
        combo_bite: { actionId: 'combo_bite', type: 'melee', duration: 36, windup: 6, impact: 13, recover: 12, pose: 'bite_combo', priority: 42, maxRange: 96, staminaCost: 5, cooldown: 72, interruptible: true, armor: 0, hits: 2, counterWindow: { start: 7, end: 20 }, tags: ['attack', 'combo', 'pressure'] },
        heavy_bite: { actionId: 'heavy_bite', type: 'melee', duration: 44, windup: 14, impact: 24, recover: 12, pose: 'heavy_bite', priority: 45, maxRange: 108, staminaCost: 7, cooldown: 105, interruptible: true, armor: 0.1, counterWindow: { start: 12, end: 25 }, tags: ['attack', 'heavy', 'execute'] },
        scratch: { actionId: 'scratch', type: 'melee', duration: 26, windup: 7, impact: 13, recover: 6, pose: 'claw', priority: 40, maxRange: 100, staminaCost: 3, cooldown: 60, interruptible: true, armor: 0, tags: ['attack', 'bleed'] },
        tail_whip: { actionId: 'tail_whip', type: 'melee', duration: 34, windup: 10, impact: 18, recover: 8, pose: 'tail_swing', priority: 40, maxRange: 120, staminaCost: 4, cooldown: 75, interruptible: true, armor: 0, tags: ['attack', 'control'] },
        venom_spit: { actionId: 'venom_spit', type: 'projectile', duration: 42, windup: 14, impact: 24, recover: 8, pose: 'spit', priority: 42, maxRange: 300, projectileSpeed: 520, staminaCost: 5, cooldown: 120, interruptible: true, armor: 0, tags: ['attack', 'ranged'] },
        dragon_rush: { actionId: 'dragon_rush', type: 'charge', duration: 38, windup: 8, impact: 24, recover: 8, pose: 'rush', priority: 45, maxRange: 120, rootMotion: { approach: 80, recoil: 16 }, staminaCost: 8, cooldown: 180, interruptible: true, armor: 0.15, tags: ['attack', 'charge', 'loud'] },

        guard: { actionId: 'guard', type: 'defense', duration: 30, windup: 2, impact: 8, recover: 8, pose: 'guard', priority: 62, staminaCost: 2, cooldown: 36, interruptible: false, armor: 0.45, counterWindow: { start: 8, end: 18 }, tags: ['defense', 'counter_ready'] },
        brace: { actionId: 'brace', type: 'defense', duration: 38, windup: 4, impact: 12, recover: 10, pose: 'brace', priority: 60, staminaCost: 3, cooldown: 60, interruptible: false, armor: 0.65, counterWindow: { start: 10, end: 22 }, tags: ['defense', 'anti_heavy'] },
        dodge: { actionId: 'dodge', type: 'reaction', duration: 18, windup: 0, impact: 4, recover: 8, pose: 'dodge', priority: 70, rootMotion: { sidestep: 24 }, staminaCost: 3, cooldown: 42, interruptible: false, armor: 0, tags: ['reaction', 'evade'] },
        retreat_step: { actionId: 'retreat_step', type: 'movement', duration: 20, windup: 0, impact: 5, recover: 8, pose: 'retreat', priority: 32, rootMotion: { retreat: 34 }, staminaCost: 2, cooldown: 24, interruptible: false, armor: 0, tags: ['movement', 'escape', 'spacing'] },
        flank_step: { actionId: 'flank_step', type: 'movement', duration: 22, windup: 0, impact: 6, recover: 8, pose: 'sidestep', priority: 34, rootMotion: { sidestep: 36 }, staminaCost: 2, cooldown: 30, interruptible: false, armor: 0, tags: ['movement', 'flank', 'spacing'] },

        hit_react: { actionId: 'hit_react', type: 'reaction', duration: 18, windup: 0, impact: 4, recover: 10, pose: 'flinch', priority: 65, tags: ['reaction'] },
        heal: { actionId: 'heal', type: 'support', duration: 36, windup: 10, impact: 18, recover: 8, pose: 'heal', priority: 35, staminaCost: 3, cooldown: 120, interruptible: true, tags: ['support', 'heal'] },
        buff: { actionId: 'buff', type: 'support', duration: 32, windup: 8, impact: 16, recover: 8, pose: 'buff', priority: 35, staminaCost: 3, cooldown: 90, interruptible: true, tags: ['support', 'buff'] },
        camouflage: { actionId: 'camouflage', type: 'support', duration: 36, windup: 10, impact: 18, recover: 8, pose: 'camouflage', priority: 35, staminaCost: 4, cooldown: 150, interruptible: true, tags: ['support', 'stealth'] },
        iron_hide: { actionId: 'iron_hide', type: 'support', duration: 34, windup: 8, impact: 16, recover: 8, pose: 'brace', priority: 35, staminaCost: 4, cooldown: 180, interruptible: true, armor: 0.35, tags: ['support', 'defense'] },
        regen: { actionId: 'regen', type: 'support', duration: 40, windup: 12, impact: 20, recover: 8, pose: 'regen', priority: 35, staminaCost: 4, cooldown: 200, interruptible: true, tags: ['support', 'heal'] },
        predator_eye: { actionId: 'predator_eye', type: 'support', duration: 34, windup: 8, impact: 16, recover: 8, pose: 'focus', priority: 36, staminaCost: 3, cooldown: 150, interruptible: true, tags: ['support', 'focus'] },
        shadow_step: { actionId: 'shadow_step', type: 'melee', duration: 30, windup: 6, impact: 16, recover: 8, pose: 'shadow_step', priority: 48, maxRange: 100, staminaCost: 5, cooldown: 150, interruptible: true, tags: ['attack', 'trick', 'flank'] },
        flame_breath: { actionId: 'flame_breath', type: 'projectile', duration: 46, windup: 16, impact: 28, recover: 10, pose: 'breath', priority: 44, maxRange: 300, staminaCost: 8, cooldown: 240, interruptible: true, tags: ['attack', 'ranged', 'heavy'] },
        gale_slash: { actionId: 'gale_slash', type: 'projectile', duration: 34, windup: 9, impact: 18, recover: 8, pose: 'gale_slash', priority: 43, maxRange: 300, staminaCost: 6, cooldown: 150, interruptible: true, tags: ['attack', 'ranged'] },
        primal_roar: { actionId: 'primal_roar', type: 'fear', duration: 42, windup: 10, impact: 20, recover: 12, pose: 'roar', priority: 38, staminaCost: 5, cooldown: 300, interruptible: true, tags: ['fear', 'loud'] },
        listen_alert: { actionId: 'listen_alert', type: 'perception', duration: 24, windup: 0, impact: 8, recover: 8, pose: 'listen', priority: 20, staminaCost: 0, cooldown: 12, interruptible: true, tags: ['perception'] },
        search_sound: { actionId: 'search_sound', type: 'perception', duration: 36, windup: 0, impact: 12, recover: 12, pose: 'search', priority: 20, staminaCost: 1, cooldown: 18, interruptible: true, tags: ['perception', 'search'] },
        fake_sound: { actionId: 'fake_sound', type: 'trick', duration: 30, windup: 6, impact: 14, recover: 10, pose: 'fake_sound', priority: 37, staminaCost: 3, cooldown: 96, interruptible: true, tags: ['trick', 'sound', 'bait'] },
        tail_decoy: { actionId: 'tail_decoy', type: 'trick', duration: 32, windup: 5, impact: 12, recover: 10, pose: 'tail_decoy', priority: 58, staminaCost: 4, cooldown: 120, interruptible: false, armor: 0.1, tags: ['trick', 'bait', 'evade'] },
        dead: { actionId: 'dead', type: 'terminal', duration: 45, windup: 0, impact: 12, recover: 30, pose: 'dead', priority: 100, tags: ['terminal'] }
    };

    global.BattleActionContracts = {
        ACTION_CONTRACTS: ACTION_CONTRACTS,
        getActionContract: function (actionId) {
            return ACTION_CONTRACTS[actionId] || ACTION_CONTRACTS.idle;
        }
    };
}(window));
