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
    LEVEL_CAP: { 0: 10, 1: 25, 2: 50, 3: 100 },

    /* ── 蜕变 ── */
    EVOLVE_LEVEL:       { 1: 10, 2: 25, 3: 50 },
    EVOLVE_COST:        { 1: 100, 2: 200, 3: 300 },
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
        ]
    },

    /** 蜕变技能解锁概率（品质<3时的随机概率） */
    EVOLVE_SKILL_CHANCE: 0.6,

    /** 蜕变阶段属性条件 (docs/03-game-rules.md §6) */
    EVOLVE_ATTR_REQ: {
        2: 30,   // 阶段1→2：任意属性总和≥30
        3: 60    // 阶段2→3：任意属性总和≥60
    },
    /** 阶段2→3 最低品质要求 */
    EVOLVE_QUALITY_REQ_STAGE3: 2,

    /* ── 体力 ── */
    STAMINA_REGEN_INTERVAL: 300,
    STAMINA_REGEN_AMOUNT:   1,
    REST_COOLDOWN:          1800,
    REST_AMOUNT:            20,

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
    DAILY_LOGIN_GOLD:        50,
    RENAME_COST:             20,

    /* ── 技能栏上限 ── */
    SKILL_SLOTS: { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 },

    /* ── 蜕变阶段上限 ── */
    MAX_STAGE: { 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 },

    /* ── 阶段名称 ── */
    STAGE_NAMES: { 0: '幼体', 1: '少年', 2: '成年', 3: '完全体' },

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
