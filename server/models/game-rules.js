/**
 * 全局数值规则常量
 * 所有游戏数值禁止硬编码，必须从本文件引用 (S-H01)
 * 数值策划唯一权威来源：docs/03-game-rules.md
 *
 * P1阶段：仅导出品质/经济/基础常量
 * 后续阶段逐步补充天赋/属性/孵化/养成/蜕变/技能规则
 */

'use strict';

module.exports = {
    /* ── 品质体系 ── */
    QUALITY_COMMON: 1,
    QUALITY_FINE:   2,
    QUALITY_RARE:   3,
    QUALITY_EPIC:   4,
    QUALITY_LEGEND: 5,

    QUALITY_WEIGHTS: [50, 30, 13, 5, 2],

    QUALITY_NAMES: {
        1: '普通', 2: '优秀', 3: '稀有', 4: '史诗', 5: '传说'
    },

    QUALITY_COLORS: {
        1: '#AAAAAA', 2: '#55FF55', 3: '#5599FF', 4: '#CC66FF', 5: '#FFAA00'
    },

    QUALITY_GROWTH: { 1: 1.0, 2: 1.15, 3: 1.3, 4: 1.5, 5: 1.8 },

    /* ── 天赋 ── */
    TALENT_RANGE: {
        1: { min: 6,  max: 10 },
        2: { min: 10, max: 15 },
        3: { min: 14, max: 20 },
        4: { min: 18, max: 26 },
        5: { min: 24, max: 32 }
    },

    /* ── 孵化 ── */
    HATCH_DURATION: { 1: 60, 2: 180, 3: 600, 4: 1800, 5: 3600 },

    /* ── 成长 ── */
    GROWTH_PER_LEVEL: 2,
    BASE_EXP: 100,
    INIT_ATTR_BASE: 5,
    LEVEL_CAP: { 0: 10, 1: 20, 2: 30, 3: 50, 4: 100 },

    /* ── 蜕变 ── */
    EVOLVE_LEVEL:       { 1: 10, 2: 20, 3: 30, 4: 50 },
    EVOLVE_COST:        { 1: 100, 2: 200, 3: 300, 4: 500 },
    EVOLVE_STAMINA_REQ: 50,

    /** 蜕变属性加成（所有六维 base +N） */
    EVOLVE_ATTR_BONUS:        3,
    /** 蜕变体力上限加成 */
    EVOLVE_STAMINA_MAX_BONUS: 20,
    /** 蜕变饱食上限加成 */
    EVOLVE_SATIETY_MAX_BONUS: 10,

    /**
     * 蜕变技能池 (docs/03-game-rules.md §6)
     * key = 目标阶段, value = 可解锁技能列表
     * 每次蜕变从对应阶段池中随机解锁1个未拥有的技能
     * 品质≥3(稀有)时保底必定解锁
     */
    EVOLVE_SKILL_POOL: {
        1: [
            { skill_code: 'scratch',    skill_level: 1 },
            { skill_code: 'tail_whip',  skill_level: 1 }
        ],
        2: [
            { skill_code: 'camouflage', skill_level: 1 },
            { skill_code: 'venom_spit', skill_level: 1 },
            { skill_code: 'iron_hide',  skill_level: 1 }
        ],
        3: [
            { skill_code: 'dragon_rush',  skill_level: 1 },
            { skill_code: 'regen',        skill_level: 1 },
            { skill_code: 'predator_eye', skill_level: 1 }
        ],
        4: [
            { skill_code: 'dragon_rush',  skill_level: 1 },
            { skill_code: 'regen',        skill_level: 1 },
            { skill_code: 'predator_eye', skill_level: 1 }
        ]
    },

    /** 蜕变技能解锁概率（品质<3时的随机概率） */
    EVOLVE_SKILL_CHANCE: 0.6,

    /** 蜕变阶段属性条件 (docs/03-game-rules.md §6) */
    EVOLVE_ATTR_REQ: {
        2: 30,   // 少年→青年：任意属性总和≥30
        4: 60    // 成年→完全体：任意属性总和≥60
    },
    /** 成年→完全体 最低品质要求 */
    EVOLVE_QUALITY_REQ_STAGE4: 2,

    /* ── 体力 ── */
    STAMINA_REGEN_INTERVAL: 300,
    STAMINA_REGEN_AMOUNT:   1,
    REST_COOLDOWN:          1800,
    REST_AMOUNT:            20,

    /* ── 健康 ── */
    HEALTH_INIT:           100,
    HEALTH_MAX_INIT:       100,
    HEALTH_DECAY_INTERVAL: 1800,   // 每30分钟衰减
    HEALTH_DECAY_AMOUNT:   2,      // 每次衰减2点

    /* ── 饱食 ── */
    SATIETY_DECAY_INTERVAL: 600,
    SATIETY_DECAY_AMOUNT:   5,
    FEED_COOLDOWN:          30,

    /* ── 灵虫限制 ── */
    SPIRIT_BUG_DAILY_LIMIT: 3,
    SPIRIT_BUG_TOTAL_LIMIT: 50,

    /* ── 食物表 ── */
    FOOD_TABLE: {
        insect:     { satiety: 20, exp: 10, cost: 5,  mood: 0,  special: null },
        fruit:      { satiety: 30, exp: 15, cost: 10, mood: 5,  special: null },
        meat:       { satiety: 40, exp: 25, cost: 20, mood: 0,  special: 'str_temp' },
        live_prey:  { satiety: 25, exp: 35, cost: 30, mood: 0,  special: 'agi_temp' },
        spirit_bug: { satiety: 15, exp: 50, cost: 50, mood: 0,  special: 'random_perm' }
    },

    /* ── 经济 ── */
    DAILY_GOLD_CAP:          500,
    HOURLY_EXPLORE_GOLD_CAP: 50,
    DAILY_LOGIN_GOLD:        100,
    RENAME_COST:             20,

    /* ── 跑道系统 (P7) ── */
    TREADMILL_TIERS: {
        1: { name: '初级跑道', install_cost: 0,   gold_per_min: 12, daily_cap: 300 },
        2: { name: '中级跑道', install_cost: 30,  gold_per_min: 15, daily_cap: 400 },
        3: { name: '高级跑道', install_cost: 100, gold_per_min: 20, daily_cap: 550 },
        4: { name: '超级跑道', install_cost: 300, gold_per_min: 30, daily_cap: 800 }
    },
    /** 跑道运行基础时长（秒），受心情/性格调整 */
    TREADMILL_BASE_DURATION: 300,
    /** 挂机自动跑概率基础值（0~1），受心情/性格调整 */
    TREADMILL_AFK_BASE_PROB: 0.3,

    /* ══════════════════════════════════════════════════
     * P9 斗兽竞技场 — 异步战斗系统
     * ══════════════════════════════════════════════════ */

    /* ── 竞技场入场 ── */
    /** 入场最低阶段（成年=3） */
    ARENA_MIN_STAGE: 3,
    /** 入场消耗体力 */
    ARENA_ENTRY_STAMINA: 1,
    /** 存钱罐金币累积速率（金/分钟） */
    ARENA_GOLD_PER_MIN: 1,
    /** 存钱罐兑换比率 */
    ARENA_GOLD_EXCHANGE_RATE: 1,

    /* ── 挑战匹配 ── */
    /** 最低下注金额（取双方存钱罐较小值，但不低于此值） */
    ARENA_MIN_BET: 10,
    /** 每日挑战次数上限 */
    ARENA_DAILY_CHALLENGE_LIMIT: 10,
    /** 匹配条件：同品质 + 同阶段 */

    /* ── 战斗引擎 ── */
    /** 模拟帧率 */
    BATTLE_FPS: 30,
    /** 基础战斗时长（帧） = 60秒 × 30FPS */
    BATTLE_BASE_FRAMES: 1800,
    /** 最大战斗时长（帧） = 120秒 × 30FPS */
    BATTLE_MAX_FRAMES: 3600,
    /** 伤害浮动 ±15% */
    BATTLE_DAMAGE_FLOAT: 0.15,
    /** 暴击基础概率 */
    BATTLE_CRIT_BASE: 0.05,
    /** 暴击伤害倍率 */
    BATTLE_CRIT_MULTI: 1.5,
    /** 闪避基础概率 */
    BATTLE_DODGE_BASE: 0.05,

    /* ── 狂暴系统 ── */
    /** 狂暴倍率增长（每秒+2%） */
    BATTLE_RAGE_PER_SEC: 0.02,
    /** 狂暴起始时间（帧）= 60秒后开始 */
    BATTLE_RAGE_START_FRAME: 1800,

    /* ── 恐惧系统 ── */
    /** 每次被击中恐惧值+8 */
    BATTLE_FEAR_PER_HIT: 8,
    /** 恐惧阈值（达到则逃跑判负） */
    BATTLE_FEAR_ESCAPE: 100,
    /** 恐惧自然衰减（每秒） */
    BATTLE_FEAR_DECAY: 0.2,
    /** 技能造成额外恐惧 */
    BATTLE_FEAR_SKILL: 20,

    /* ── 体力惩罚 ── */
    /** 体力耗尽时伤害惩罚系数 */
    BATTLE_STA_EMPTY_PENALTY: 0.5,
    /** 每次攻击消耗战斗体力 */
    BATTLE_STA_PER_ATK: 2,
    /** 战斗初始体力 = stamina × 3 */
    BATTLE_STA_MULTIPLIER: 3,

    /* ── 战斗属性公式系数 ── */
    /** HP = VIT×10 + STR×3 + level×5 */
    BATTLE_HP_VIT: 10,
    BATTLE_HP_STR: 3,
    BATTLE_HP_LVL: 5,
    /** ATK = STR×3 + AGI×1 + level×2 */
    BATTLE_ATK_STR: 3,
    BATTLE_ATK_AGI: 1,
    BATTLE_ATK_LVL: 2,
    /** DEF = VIT×2 + STR×1 + level×1 */
    BATTLE_DEF_VIT: 2,
    BATTLE_DEF_STR: 1,
    BATTLE_DEF_LVL: 1,
    /** SPD = AGI×3 + PER×1 */
    BATTLE_SPD_AGI: 3,
    BATTLE_SPD_PER: 1,
    /** 防御减伤公式: 1 - DEF/(DEF+200) */
    BATTLE_DEF_CONSTANT: 200,

    /* ── 身体部位战斗属性 ── */
    BATTLE_BODY_LEVEL_GROWTH: 0.1,
    BATTLE_BODY_BASE_REGEN: 1,
    BATTLE_BODY_PARTS: {
        head:      { name: '头部',   hp_base: 100, hp_vit: 10, def_base: 50,  def_agi: 50, weight: 0.16, core: true  },
        torso:     { name: '躯干',   hp_base: 100, hp_vit: 10, def_base: 100, def_agi: 10, weight: 0.28, core: true  },
        foreLeft:  { name: '左前肢', hp_base: 50,  hp_vit: 5,  def_base: 50,  def_agi: 5,  weight: 0.11, core: true  },
        foreRight: { name: '右前肢', hp_base: 50,  hp_vit: 5,  def_base: 50,  def_agi: 5,  weight: 0.11, core: true  },
        hindLeft:  { name: '左后肢', hp_base: 50,  hp_vit: 5,  def_base: 50,  def_agi: 5,  weight: 0.11, core: true  },
        hindRight: { name: '右后肢', hp_base: 50,  hp_vit: 5,  def_base: 50,  def_agi: 5,  weight: 0.11, core: true  },
        tail:      { name: '尾部',   hp_base: 30,  hp_vit: 2,  def_base: 30,  def_agi: 2,  weight: 0.12, core: false },
    },
    BATTLE_INJURY_HALF: 0.5,
    BATTLE_INJURY_HEAVY: 0.8,
    BATTLE_HEAD_VISION_HALF: 0.65,
    BATTLE_HEAD_VISION_HEAVY: 0.35,
    BATTLE_HEAD_VISION_DISABLED: 0.1,
    BATTLE_HEAD_TURN_HEAVY: 0.45,
    BATTLE_TORSO_STEP_HALF: 0.7,
    BATTLE_TORSO_STEP_HEAVY: 0.45,
    BATTLE_TORSO_STEP_DISABLED: 0.1,
    BATTLE_LIMB_DRAG_SPEED_PENALTY: 0.12,
    BATTLE_LIMB_DETACH_SPEED_PENALTY: 0.22,
    BATTLE_LIMB_DETACH_CONTROL_PENALTY: 0.28,
    BATTLE_LIMB_DETACH_SPIN_CHANCE: 0.18,
    BATTLE_TAIL_DECOY_FRAMES: 150,
    BATTLE_TAIL_DECOY_HIT_CHANCE: 0.35,
    BATTLE_TAIL_DECOY_DODGE_BONUS: 0.2,

    /* ── 结算奖惩 ── */
    /** 胜利：+赌注 +5金 -1体力 */
    ARENA_BATTLE_BONUS: 5,
    ARENA_WIN_STAMINA_COST: 1,
    /** 失败：-赌注 -5金 -10体力 */
    ARENA_LOSE_GOLD_PENALTY: 5,
    ARENA_LOSE_STAMINA_COST: 10,
    /** 平局：-10体力 +10金 */
    ARENA_DRAW_BONUS: 10,
    ARENA_DRAW_STAMINA_COST: 10,
    /** 恢复期时长（秒）= 30分钟 */
    ARENA_RECOVERY_DURATION: 1800,

    /* ── 战斗记录 ── */
    /** 记录保留时长（秒）= 72小时 */
    ARENA_RECORD_EXPIRE: 259200,

    /* ── AI 状态机 ── */
    /** AI状态: aggressive / kiting / defensive / fear */
    AI_STATES: ['aggressive', 'kiting', 'defensive', 'fear'],
    /** 状态切换阈值 */
    AI_HP_DEFENSIVE_THRESHOLD: 0.3,
    AI_HP_AGGRESSIVE_THRESHOLD: 0.6,
    AI_FEAR_KITING_THRESHOLD: 60,

    /* ── 地图定义 ── */
    ARENA_MAPS: [
        { id: 'grassland', name: '草原', width: 800, height: 600, terrain: 'flat', buff: null },
        { id: 'swamp',     name: '沼泽', width: 800, height: 600, terrain: 'slow', buff: { stat: 'spd', mod: -0.2 } },
        { id: 'volcano',   name: '火山', width: 800, height: 600, terrain: 'hot',  buff: { stat: 'atk', mod: 0.1 } },
    ],

    /* ── 技能战斗效果 ── */
    BATTLE_SKILL_EFFECTS: {
        bite:         { dmg_multi: 1.2, fear: 5,  cooldown: 90,  type: 'melee' },
        scratch:      { dmg_multi: 1.0, fear: 3,  cooldown: 60,  type: 'melee' },
        tail_whip:    { dmg_multi: 0.8, fear: 10, cooldown: 75,  type: 'melee' },
        camouflage:   { dmg_multi: 0,   fear: 0,  cooldown: 150, type: 'buff', effect: 'dodge_up', value: 0.3, duration: 90 },
        venom_spit:   { dmg_multi: 1.5, fear: 15, cooldown: 120, type: 'ranged' },
        iron_hide:    { dmg_multi: 0,   fear: 0,  cooldown: 180, type: 'buff', effect: 'def_up', value: 0.5, duration: 90 },
        dragon_rush:  { dmg_multi: 2.0, fear: 20, cooldown: 180, type: 'melee' },
        regen:        { dmg_multi: 0,   fear: 0,  cooldown: 200, type: 'heal', value: 0.15 },
        predator_eye: { dmg_multi: 0,   fear: 12, cooldown: 150, type: 'buff', effect: 'crit_up', value: 0.2, duration: 120 },
        crystal_armor:{ dmg_multi: 0,   fear: 0,  cooldown: 240, type: 'buff', effect: 'def_up', value: 0.8, duration: 60 },
        shadow_step:  { dmg_multi: 1.3, fear: 18, cooldown: 150, type: 'melee', effect: 'dodge_up', value: 0.5, duration: 30 },
        flame_breath: { dmg_multi: 2.5, fear: 25, cooldown: 240, type: 'ranged' },
        gale_slash:   { dmg_multi: 1.8, fear: 15, cooldown: 150, type: 'ranged' },
        primal_roar:  { dmg_multi: 0,   fear: 40, cooldown: 300, type: 'fear_skill' },
    },

    /* ── 宠物售卖 (P7) ── */
    PET_SELL_BASE_PRICE:      50,
    PET_SELL_LEVEL_FACTOR:    5,
    PET_SELL_STAGE_FACTOR:    100,
    PET_SELL_QUALITY_FACTOR:  80,
    PET_SELL_SKILL_FACTOR:    30,

    /* ── 技能栏上限 ── */
    SKILL_SLOTS: { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 },

    /* ── 蜕变阶段上限 ── */
    MAX_STAGE: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 },

    /* ── 阶段名称 ── */
    STAGE_NAMES: { 0: '幼体', 1: '少年', 2: '青年', 3: '成年', 4: '完全体' },

    /* ── 性别 ── */
    GENDER_MALE:   1,
    GENDER_FEMALE: 2,
    GENDER_NAMES: { 1: '雄性', 2: '雌性' },
    GENDER_ICONS: { 1: '♂', 2: '♀' },

    /* ── 六维属性键名 ── */
    ATTR_KEYS: ['str', 'agi', 'vit', 'int', 'per', 'cha'],

    /* ── 初始技能定义 ── */
    INITIAL_SKILLS: [
        { skill_code: 'bite', skill_level: 1, slot_index: 0 }
    ],

    /* ══════════════════════════════════════════════════
     * P8 繁殖系统常量
     * ══════════════════════════════════════════════════ */

    /* ── 交友市场 ── */
    /** 繁殖最低阶段要求（成年=3） */
    BREED_MIN_STAGE: 3,
    /** 邀请有效期（秒） */
    BREED_INVITE_EXPIRE: 3600,
    /** 交配笼时长（秒） = 4小时 */
    BREED_CAGE_DURATION: 14400,
    /** 繁殖冷却（秒） = 24小时 */
    BREED_COOLDOWN: 86400,
    /** 繁殖体力消耗 */
    BREED_STAMINA_COST: 30,
    /** 繁殖心情消耗 */
    BREED_MOOD_COST: 20,
    /** 繁殖金币费用 */
    BREED_GOLD_COST: 200,

    /**
     * 繁殖成功概率因子
     * base_prob = 0.6
     * + mood_bonus (mood>=80: +0.15)
     * + rest_bonus (last_rest_at 距今<1h: +0.1)
     * - cooldown_penalty (last_breed_at 距今<48h: -0.15)
     */
    BREED_BASE_PROB: 0.6,
    BREED_MOOD_THRESHOLD: 80,
    BREED_MOOD_BONUS: 0.15,
    BREED_REST_WINDOW: 3600,
    BREED_REST_BONUS: 0.1,
    BREED_RECENT_WINDOW: 172800,
    BREED_RECENT_PENALTY: 0.15,

    /** 产蛋数量范围 [min, max] */
    BREED_EGG_MIN: 1,
    BREED_EGG_MAX: 2,

    /* ── 品质遗传组合表 (5级体系) ──
     * key = "父品质:母品质" (小值在前)
     * value = [普通%, 优秀%, 稀有%, 史诗%, 传说%]
     * 所有行总和 = 100
     */
    BREED_QUALITY_TABLE: {
        '1:1': [70, 22, 5, 2.5, 0.5],
        '1:2': [50, 30, 13, 5, 2],
        '1:3': [40, 30, 18, 9, 3],
        '1:4': [30, 28, 25, 13, 4],
        '1:5': [25, 25, 28, 17, 5],
        '2:2': [30, 40, 20, 8, 2],
        '2:3': [20, 35, 30, 12, 3],
        '2:4': [15, 28, 35, 17, 5],
        '2:5': [10, 22, 38, 23, 7],
        '3:3': [15, 30, 37, 15, 3],
        '3:4': [10, 25, 35, 25, 5],
        '3:5': [8, 20, 35, 30, 7],
        '4:4': [10, 25, 38, 25, 2],
        '4:5': [8, 22, 35, 30, 5],
        '5:5': [10, 25, 35, 28, 2],
    },

    /** 全局传说上限：传说占比 ≥1% 时概率减半，≥2% 时强制归零 */
    LEGEND_CAP_HALVE: 0.01,
    LEGEND_CAP_ZERO: 0.02,

    /* ── 天赋基因遗传 ── */
    /** 遗传概率 80%，变异概率 20% */
    GENE_INHERIT_RATE: 0.8,
    GENE_MUTATE_RATE: 0.2,
    /** 变异幅度 ±1~3 */
    GENE_MUTATE_MIN: 1,
    GENE_MUTATE_MAX: 3,
    /** 基因表达倍率：纯合显性 / 杂合 / 纯合隐性 */
    GENE_EXPR_HOMO_DOM: 1.1,
    GENE_EXPR_HETERO: 1.0,
    GENE_EXPR_HOMO_REC: 0.9,

    /* ── 外观模块遗传 ── */
    /** 5个独立外观模块 */
    APPEARANCE_MODULES: ['spine', 'limbs', 'head', 'tail', 'skin'],
    /** 各模块父方权重 (father_weight)，母方 = 1 - father_weight */
    APPEARANCE_PARENT_WEIGHT: {
        spine: 0.5,
        limbs: 0.5,
        head:  0.7,
        tail:  0.3,
        skin:  0.5,
    },
    /** 外观变异池范围 */
    APPEARANCE_MUTATE_RANGE: {
        spine:  { min: 15, max: 25 },
        limbs:  { min: 15, max: 25 },
        head:   { min: 0, max: 2 },
        tail:   { min: 0.2, max: 0.5 },
        skin:   { min: 0, max: 360 },
    },

    /* ── 技能遗传 ── */
    /** 80%遗传分支内的分布 */
    SKILL_INHERIT_FATHER_ONLY: 0.35,
    SKILL_INHERIT_MOTHER_ONLY: 0.35,
    SKILL_INHERIT_BOTH: 0.10,
    SKILL_INHERIT_NONE: 0.20,
    /** 品质对应技能上限 */
    SKILL_CAP_BY_QUALITY: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 4 },
    /** 全局技能变异池 */
    SKILL_MUTATION_POOL: [
        { skill_code: 'scratch', skill_level: 1 },
        { skill_code: 'tail_whip', skill_level: 1 },
        { skill_code: 'camouflage', skill_level: 1 },
        { skill_code: 'venom_spit', skill_level: 1 },
        { skill_code: 'iron_hide', skill_level: 1 },
        { skill_code: 'dragon_rush', skill_level: 1 },
        { skill_code: 'regen', skill_level: 1 },
        { skill_code: 'predator_eye', skill_level: 1 },
    ],

    /* ── 隐藏基因系统 ── */
    /** 隐藏基因类型定义 */
    HIDDEN_GENES: {
        crystal_scale: { name: '水晶鳞', cap: 5, quality_boost: 1, exclusive_skill: 'crystal_armor' },
        shadow_veil:   { name: '暗影纱', cap: 5, quality_boost: 0, exclusive_skill: 'shadow_step' },
        flame_heart:   { name: '炎之心', cap: 3, quality_boost: 1, exclusive_skill: 'flame_breath' },
        storm_wing:    { name: '风暴翼', cap: 3, quality_boost: 0, exclusive_skill: 'gale_slash' },
        ancient_blood: { name: '远古血', cap: 2, quality_boost: 1, exclusive_skill: 'primal_roar' },
    },
    /** 初代宠物携带隐藏基因概率 */
    HIDDEN_GENE_CARRY_RATE: 0.001,
    /** 隐藏基因解锁条件：双亲同类型 + 后代纯合 + 变异分支10%触发 */
    HIDDEN_GENE_TRIGGER_RATE: 0.10,
    /** 隐藏基因解锁后冷却（秒）= 7天 */
    HIDDEN_GENE_COOLDOWN: 604800,

    /* ── 渲染参数基准值 (docs/03-game-rules.md §3.4) ── */
    RENDER_BASE: {
        bodyWidth:         1.0,
        headScale:         1.0,
        moveSpeed:         1.0,
        legFrequency:      1.0,
        spineNodes:        20,
        segmentWidth:      1.0,
        fovAngle:          1.0,
        fovDistance:       1.0,
        colorSaturation:   1.0,
        patternComplexity: 1
    }
};
