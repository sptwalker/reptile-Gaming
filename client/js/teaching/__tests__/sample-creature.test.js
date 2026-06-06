'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SAMPLE = require('../sample-creature.js');

test('sample 含 render_params 与 body_seed', () => {
  assert.ok(SAMPLE.render_params, 'render_params 存在');
  assert.ok(SAMPLE.body_seed, 'body_seed 存在');
});

test('render_params 字段量级合理', () => {
  const rp = SAMPLE.render_params;
  assert.ok(rp.spineNodes >= 6 && rp.spineNodes <= 30);
  assert.ok(rp.segmentLength > 0);
  assert.ok(rp.bodyScale > 0);
});

test('body_seed 含色相/花纹', () => {
  const s = SAMPLE.body_seed;
  assert.equal(typeof s.bodyHue, 'number');
  assert.equal(typeof s.patternType, 'string');
});
