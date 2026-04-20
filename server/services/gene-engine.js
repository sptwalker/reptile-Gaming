/**
 * P8 核心遗传算法引擎
 * - 品质遗传（组合表 + 全局传说上限）
 * - 天赋基因遗传（显性/隐性基因对，80%遗传 + 20%变异）
 * - 外观模块遗传（5独立模块，可配权重）
 * - 技能遗传（35/35/10/20 分布）
 * - 隐藏基因系统
 */

'use strict';

const { getDB, now } = require('../db');
const { secureRandom } = require('../utils/random');
const rules = require('../models/game-rules');

/* ═══════════════════════════════════════════
 * 1. 品质遗传
 * ═══════════════════════════════════════════ */

/**
 * 根据双亲品质决定后代品质
 * @param {number} q1 父方品质 1~5
 * @param {number} q2 母方品质 1~5
 * @returns {number} 后代品质 1~5
 */
function inheritQuality(q1, q2) {
    const key = Math.min(q1, q2) + ':' + Math.max(q1, q2);
    let weights = rules.BREED_QUALITY_TABLE[key];
    if (!weights) {
        weights = rules.BREED_QUALITY_TABLE['1:1'];
    }

    /* 全局传说上限检查 */
    const legendRatio = _getLegendRatio();
    let adjusted = [...weights];
    if (legendRatio >= rules.LEGEND_CAP_ZERO) {
        adjusted[4] = 0;
    } else if (legendRatio >= rules.LEGEND_CAP_HALVE) {
        adjusted[4] = adjusted[4] / 2;
    }

    /* 归一化 */
    const total = adjusted.reduce((s, v) => s + v, 0);
    const roll = secureRandom(1, 10000) / 100; // 0.01~100.00
    let acc = 0;
    for (let i = 0; i < adjusted.length; i++) {
        acc += (adjusted[i] / total) * 100;
        if (roll <= acc) return i + 1;
    }
    return 1;
}

/**
 * 获取当前传说宠物占比
 */
function _getLegendRatio() {
    const db = getDB();
    const total = db.prepare('SELECT COUNT(*) as cnt FROM pet').get().cnt;
    if (total === 0) return 0;
    const legends = db.prepare('SELECT COUNT(*) as cnt FROM pet WHERE quality = 5').get().cnt;
    return legends / total;
}

/* ═══════════════════════════════════════════
 * 2. 天赋基因遗传（显性/隐性模型）
 * ═══════════════════════════════════════════ */

/**
 * 生成初代宠物的基因组（无父母时随机生成）
 * 每个属性有2个基因值 [dominant, recessive]
 * @param {object} talents { str, agi, vit, int, per, cha } 天赋值
 * @returns {object} gene_set JSON
 */
function generateInitialGeneSet(talents) {
    const geneSet = {};
    for (const attr of rules.ATTR_KEYS) {
        const val = talents[attr];
        // 显性基因 = 天赋值, 隐性基因 = 天赋值 ± 随机偏移
        const offset = secureRandom(-3, 3);
        const recessive = Math.max(1, val + offset);
        geneSet[attr] = { dominant: val, recessive };
    }
    return geneSet;
}

/**
 * 遗传天赋基因
 * 80%: 从双亲各取一个基因（随机取显性或隐性）
 * 20%: 在父母基因基础上 ±1~3 变异
 * @param {object} parent1Genes 父方 gene_set
 * @param {object} parent2Genes 母方 gene_set
 * @returns {{ geneSet: object, talents: object, expression: object }}
 */
function inheritTalentGenes(parent1Genes, parent2Genes) {
    const geneSet = {};
    const talents = {};
    const expression = {};

    for (const attr of rules.ATTR_KEYS) {
        const p1 = parent1Genes[attr] || { dominant: 5, recessive: 5 };
        const p2 = parent2Genes[attr] || { dominant: 5, recessive: 5 };

        let dominant, recessive;

        if (secureRandom(1, 100) <= rules.GENE_INHERIT_RATE * 100) {
            /* 80% 遗传：从每个亲本随机取一个基因 */
            dominant = secureRandom(1, 2) === 1 ? p1.dominant : p1.recessive;
            recessive = secureRandom(1, 2) === 1 ? p2.dominant : p2.recessive;
        } else {
            /* 20% 变异：基于亲本均值 ± 变异幅度 */
            const base = Math.round((p1.dominant + p2.dominant) / 2);
            const mut1 = secureRandom(rules.GENE_MUTATE_MIN, rules.GENE_MUTATE_MAX);
            const mut2 = secureRandom(rules.GENE_MUTATE_MIN, rules.GENE_MUTATE_MAX);
            dominant = Math.max(1, base + (secureRandom(0, 1) === 0 ? mut1 : -mut1));
            recessive = Math.max(1, base + (secureRandom(0, 1) === 0 ? mut2 : -mut2));
        }

        /* 确保显性 >= 隐性 */
        if (dominant < recessive) {
            [dominant, recessive] = [recessive, dominant];
        }

        geneSet[attr] = { dominant, recessive };

        /* 基因表达计算 */
        let multiplier;
        if (dominant === recessive && dominant >= Math.round((p1.dominant + p2.dominant) / 2)) {
            multiplier = rules.GENE_EXPR_HOMO_DOM;  // 纯合显性
        } else if (dominant === recessive) {
            multiplier = rules.GENE_EXPR_HOMO_REC;  // 纯合隐性
        } else {
            multiplier = rules.GENE_EXPR_HETERO;    // 杂合
        }

        talents[attr] = Math.round(dominant * multiplier);
        expression[attr] = multiplier;
    }

    return { geneSet, talents, expression };
}

/* ═══════════════════════════════════════════
 * 3. 外观模块遗传
 * ═══════════════════════════════════════════ */

/**
 * 生成初代外观基因（从 pattern_seed 转换）
 * @param {object} patternSeed 外观种子
 * @returns {object} appearance_gene
 */
function generateInitialAppearanceGene(patternSeed) {
    return {
        spine: { dominant: patternSeed.bodyHue || 0, recessive: secureRandom(0, 360) },
        limbs: { dominant: patternSeed.bodyLightness || 50, recessive: secureRandom(20, 80) },
        head:  { dominant: patternSeed.headShape || 0, recessive: secureRandom(0, 2) },
        tail:  { dominant: Math.round((patternSeed.tailRatio || 0.35) * 100), recessive: secureRandom(20, 50) },
        skin:  { dominant: patternSeed.patternHue || 0, recessive: secureRandom(0, 360) },
    };
}

/**
 * 遗传外观基因
 * 80%: 按模块权重从父/母取显性基因
 * 20%: 从全局变异池随机
 * @param {object} parent1App 父方 appearance_gene
 * @param {object} parent2App 母方 appearance_gene
 * @returns {{ appearanceGene: object, patternSeed: object }}
 */
function inheritAppearance(parent1App, parent2App) {
    const appearanceGene = {};

    for (const mod of rules.APPEARANCE_MODULES) {
        const p1 = parent1App[mod] || { dominant: 0, recessive: 0 };
        const p2 = parent2App[mod] || { dominant: 0, recessive: 0 };
        const fatherWeight = rules.APPEARANCE_PARENT_WEIGHT[mod];

        let dominant, recessive;

        if (secureRandom(1, 100) <= rules.GENE_INHERIT_RATE * 100) {
            /* 80% 遗传 */
            if (secureRandom(1, 100) <= fatherWeight * 100) {
                dominant = p1.dominant;
            } else {
                dominant = p2.dominant;
            }
            recessive = secureRandom(1, 2) === 1 ? p1.recessive : p2.recessive;
        } else {
            /* 20% 变异：从变异池随机 */
            const range = rules.APPEARANCE_MUTATE_RANGE[mod];
            if (Number.isInteger(range.min)) {
                dominant = secureRandom(range.min, range.max);
                recessive = secureRandom(range.min, range.max);
            } else {
                dominant = Math.round(secureRandom(Math.round(range.min * 100), Math.round(range.max * 100)));
                recessive = Math.round(secureRandom(Math.round(range.min * 100), Math.round(range.max * 100)));
            }
        }

        appearanceGene[mod] = { dominant, recessive };
    }

    /* 从外观基因生成 pattern_seed */
    const patternSeed = _appearanceGeneToSeed(appearanceGene);
    return { appearanceGene, patternSeed };
}

/**
 * 将外观基因转换为渲染用的 pattern_seed
 */
function _appearanceGeneToSeed(gene) {
    return {
        bodyHue:        gene.spine.dominant % 361,
        bodyLightness:  Math.min(80, Math.max(20, gene.limbs.dominant)),
        patternType:    secureRandom(0, 3),
        patternHue:     gene.skin.dominant % 361,
        patternDensity: secureRandom(1, 5),
        eyeColor:       secureRandom(0, 360),
        tailRatio:      +(Math.min(0.5, Math.max(0.2, gene.tail.dominant / 100))).toFixed(2),
        headShape:      gene.head.dominant % 3,
    };
}

/* ═══════════════════════════════════════════
 * 4. 技能遗传
 * ═══════════════════════════════════════════ */

/**
 * 遗传技能
 * @param {Array} parent1Skills 父方技能列表 [{skill_code, skill_level}]
 * @param {Array} parent2Skills 母方技能列表
 * @param {number} quality 后代品质
 * @returns {Array} 后代技能列表
 */
function inheritSkills(parent1Skills, parent2Skills, quality) {
    const cap = rules.SKILL_CAP_BY_QUALITY[quality] || 1;
    const inherited = [];

    const roll = secureRandom(1, 100);

    if (roll <= rules.GENE_INHERIT_RATE * 100) {
        /* 80% 遗传分支 */
        const subRoll = secureRandom(1, 100);
        let source = [];

        if (subRoll <= 35) {
            /* 35% 仅父方 */
            source = parent1Skills;
        } else if (subRoll <= 70) {
            /* 35% 仅母方 */
            source = parent2Skills;
        } else if (subRoll <= 80) {
            /* 10% 双方 */
            source = [...parent1Skills, ...parent2Skills];
        }
        /* 20% 无遗传 → source 保持空 */

        /* 从来源中随机选取不超过上限的技能 */
        const unique = _uniqueSkills(source);
        const shuffled = _shuffle(unique);
        for (let i = 0; i < Math.min(cap, shuffled.length); i++) {
            inherited.push({ skill_code: shuffled[i].skill_code, skill_level: 1 });
        }
    } else {
        /* 20% 变异：从全局池随机 */
        const pool = rules.SKILL_MUTATION_POOL;
        const shuffled = _shuffle([...pool]);
        for (let i = 0; i < Math.min(cap, shuffled.length); i++) {
            inherited.push({ skill_code: shuffled[i].skill_code, skill_level: 1 });
        }
    }

    /* 保底：至少有 bite */
    if (inherited.length === 0) {
        inherited.push({ skill_code: 'bite', skill_level: 1 });
    }

    return inherited;
}

function _uniqueSkills(skills) {
    const seen = new Set();
    return skills.filter(s => {
        if (seen.has(s.skill_code)) return false;
        seen.add(s.skill_code);
        return true;
    });
}

function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = secureRandom(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/* ═══════════════════════════════════════════
 * 5. 隐藏基因系统
 * ═══════════════════════════════════════════ */

/**
 * 为初代宠物随机分配隐藏基因（0.1%概率）
 * @returns {string} 隐藏基因类型或空字符串
 */
function rollHiddenGene() {
    if (secureRandom(1, 1000) > 1) return '';
    const types = Object.keys(rules.HIDDEN_GENES);
    return types[secureRandom(0, types.length - 1)];
}

/**
 * 检查并尝试解锁隐藏基因
 * 条件：双亲携带同类型隐藏基因 + 变异分支(20%) + 10%触发
 * @param {string} parent1Hidden 父方隐藏基因
 * @param {string} parent2Hidden 母方隐藏基因
 * @returns {{ unlocked: boolean, geneType: string, effects: object|null }}
 */
function tryUnlockHiddenGene(parent1Hidden, parent2Hidden) {
    /* 双亲必须携带同类型 */
    if (!parent1Hidden || !parent2Hidden || parent1Hidden !== parent2Hidden) {
        return { unlocked: false, geneType: '', effects: null };
    }

    const geneType = parent1Hidden;
    const geneDef = rules.HIDDEN_GENES[geneType];
    if (!geneDef) return { unlocked: false, geneType: '', effects: null };

    /* 全局硬上限检查 */
    const db = getDB();
    const count = db.prepare('SELECT COUNT(*) as cnt FROM hidden_gene_log WHERE gene_type = ?').get(geneType).cnt;
    if (count >= geneDef.cap) {
        return { unlocked: false, geneType: '', effects: null };
    }

    /* 冷却检查：最近7天内是否有同类型解锁 */
    const ts = now();
    const recent = db.prepare(
        'SELECT id FROM hidden_gene_log WHERE gene_type = ? AND unlocked_at > ?'
    ).get(geneType, ts - rules.HIDDEN_GENE_COOLDOWN);
    if (recent) {
        return { unlocked: false, geneType: '', effects: null };
    }

    /* 必须在变异分支(20%)内，再触发10% → 总概率 2% */
    const inMutation = secureRandom(1, 100) <= rules.GENE_MUTATE_RATE * 100;
    if (!inMutation) return { unlocked: false, geneType: geneType, effects: null };

    const triggered = secureRandom(1, 100) <= rules.HIDDEN_GENE_TRIGGER_RATE * 100;
    if (!triggered) return { unlocked: false, geneType: geneType, effects: null };

    return {
        unlocked: true,
        geneType,
        effects: {
            quality_boost: geneDef.quality_boost,
            exclusive_skill: geneDef.exclusive_skill,
            name: geneDef.name,
        }
    };
}

/* ═══════════════════════════════════════════
 * 6. 完整后代生成管线
 * ═══════════════════════════════════════════ */

/**
 * 生成后代完整遗传数据
 * @param {object} parent1 父方宠物完整数据 (pet + attr + skills + gene_set + appearance_gene + hidden_gene)
 * @param {object} parent2 母方宠物完整数据
 * @returns {object} offspring 遗传结果
 */
function generateOffspring(parent1, parent2) {
    /* 1. 品质遗传 */
    let quality = inheritQuality(parent1.quality, parent2.quality);

    /* 2. 天赋基因遗传 */
    const p1Genes = _parseGeneSet(parent1.gene_set);
    const p2Genes = _parseGeneSet(parent2.gene_set);
    const { geneSet, talents, expression } = inheritTalentGenes(p1Genes, p2Genes);

    /* 3. 外观遗传 */
    const p1App = _parseAppearanceGene(parent1.appearance_gene);
    const p2App = _parseAppearanceGene(parent2.appearance_gene);
    const { appearanceGene, patternSeed } = inheritAppearance(p1App, p2App);

    /* 4. 技能遗传 */
    const skills = inheritSkills(
        parent1.skills || [],
        parent2.skills || [],
        quality
    );

    /* 5. 隐藏基因检查 */
    const hiddenResult = tryUnlockHiddenGene(parent1.hidden_gene, parent2.hidden_gene);
    let hiddenGene = '';

    if (hiddenResult.unlocked) {
        /* 品质突破 */
        quality = Math.min(5, quality + hiddenResult.effects.quality_boost);
        /* 继承隐藏基因标记 */
        hiddenGene = hiddenResult.geneType;
        /* 追加专属技能 */
        if (hiddenResult.effects.exclusive_skill) {
            skills.push({ skill_code: hiddenResult.effects.exclusive_skill, skill_level: 1 });
        }
    } else if (hiddenResult.geneType) {
        /* 未解锁但携带 */
        hiddenGene = hiddenResult.geneType;
    } else {
        /* 从父母随机继承隐藏基因标记（50%概率） */
        if (parent1.hidden_gene && secureRandom(1, 2) === 1) {
            hiddenGene = parent1.hidden_gene;
        } else if (parent2.hidden_gene && secureRandom(1, 2) === 1) {
            hiddenGene = parent2.hidden_gene;
        }
    }

    /* 6. 性别随机 */
    const gender = secureRandom(1, 2);

    /* 7. 世代 */
    const generation = Math.max(parent1.generation || 0, parent2.generation || 0) + 1;

    return {
        quality,
        gender,
        generation,
        geneSet,
        talents,
        expression,
        appearanceGene,
        patternSeed,
        skills,
        hiddenGene,
        hiddenUnlocked: hiddenResult.unlocked,
        hiddenEffects: hiddenResult.effects,
        parent1_id: parent1.id,
        parent2_id: parent2.id,
    };
}

function _parseGeneSet(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
}

function _parseAppearanceGene(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
}

module.exports = {
    inheritQuality,
    generateInitialGeneSet,
    inheritTalentGenes,
    generateInitialAppearanceGene,
    inheritAppearance,
    inheritSkills,
    rollHiddenGene,
    tryUnlockHiddenGene,
    generateOffspring,
};
