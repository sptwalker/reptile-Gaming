'use strict';

const rules = require('../models/game-rules');

function parseBodySeed(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return { ...raw };
    try { return JSON.parse(raw); }
    catch { return {}; }
}

function sumAttrTotals(attr) {
    const totals = {};
    for (const key of rules.ATTR_KEYS) {
        totals[key] = Number(attr[key + '_base'] || 0) + Number(attr[key + '_talent'] || 0);
    }
    return totals;
}

function buildAttrs(attr) {
    const attrs = {};
    for (const key of rules.ATTR_KEYS) {
        const base = Number(attr[key + '_base'] || 0);
        const talent = Number(attr[key + '_talent'] || 0);
        attrs[key] = { base, talent, total: base + talent };
    }
    return attrs;
}

function buildAppearance(pet, attr) {
    const bodySeed = parseBodySeed(pet.body_seed);
    const attrTotals = sumAttrTotals(attr);
    const rb = rules.RENDER_BASE;
    const stage = Number(pet.stage || 0);
    const evolveSpineBonus = Number.isFinite(Number(bodySeed.evolveSpineBonus)) ? Number(bodySeed.evolveSpineBonus) : stage * 2;
    const legGapByStage = { 0: 1.35, 1: 1.25, 2: 1.12, 3: 1.0, 4: 1.0 };
    if (Number.isFinite(Number(bodySeed.lightness))) {
        bodySeed.lightness = Math.max(16, Math.min(58, Number(bodySeed.lightness)));
    }
    return {
        body_seed: bodySeed,
        hidden_gene: pet.hidden_gene || bodySeed.hiddenGene || '',
        render_params: {
            bodyWidth: Number.isFinite(Number(bodySeed.bodyWidth)) ? Number(bodySeed.bodyWidth) : rb.bodyWidth,
            headScale: Number.isFinite(Number(bodySeed.headScale)) ? Number(bodySeed.headScale) : rb.headScale,
            moveSpeed: +(rb.moveSpeed * (1 + attrTotals.agi * 0.015)).toFixed(3),
            legFrequency: +(rb.legFrequency * (1 + attrTotals.agi * 0.02)).toFixed(3),
            spineNodes: Number.isFinite(Number(bodySeed.spineNodes)) ? Math.round(Number(bodySeed.spineNodes)) : rb.spineNodes,
            segmentWidth: Number.isFinite(Number(bodySeed.segmentWidth)) ? Number(bodySeed.segmentWidth) : rb.segmentWidth,
            fovAngle: +(rb.fovAngle * (1 + attrTotals.int * 0.01)).toFixed(3),
            fovDistance: +(rb.fovDistance * (1 + attrTotals.per * 0.02)).toFixed(3),
            colorSaturation: +(rb.colorSaturation * (1 + attrTotals.cha * 0.01) * (1 + stage * 0.05)).toFixed(3),
            patternComplexity: rb.patternComplexity + Math.floor(attrTotals.cha / 8) + stage,
            legGapRatio: Number.isFinite(Number(bodySeed.legGapRatio)) ? Number(bodySeed.legGapRatio) : (legGapByStage[stage] || 1.0),
            spineCount: Number.isFinite(Number(bodySeed.spineCount)) ? Number(bodySeed.spineCount) : Math.max(0, Math.round(evolveSpineBonus)),
            spineLength: Number.isFinite(Number(bodySeed.spineLength)) ? Number(bodySeed.spineLength) : +(0.75 + stage * 0.08).toFixed(2),
            patternType: bodySeed.patternType || 'spots',
            patternColor: bodySeed.patternColor || null,
            limbThickness: Number.isFinite(Number(bodySeed.limbThickness)) ? Number(bodySeed.limbThickness) : 1
        }
    };
}

module.exports = { parseBodySeed, sumAttrTotals, buildAttrs, buildAppearance };
