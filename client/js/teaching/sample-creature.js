/**
 * sample-creature.js — 教学演示用固定蜥蜴参数（UMD）
 * 结构对齐服务端 render_params / body_seed（见 docs/05-sync-rules.md），数值写死。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SAMPLE_CREATURE = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    render_params: {
      spineNodes: 20,
      segmentLength: 16,
      bodyScale: 1.0,
      headScale: 1.0,
      limbThickness: 1.0,
      serpentineAmp: 1.5,
      serpentineFreq: 0.3,
      serpentineSpeed: 0.2,
      fovAngle: 60,
      fovClearDist: 220,
      fovMaxDist: 360,
      colorSaturation: 1.0,
      patternComplexity: 2
    },
    body_seed: {
      bodyHue: 120,
      bodyLightness: 28,
      patternType: 'spots',
      patternHue: 90
    }
  };
}));
