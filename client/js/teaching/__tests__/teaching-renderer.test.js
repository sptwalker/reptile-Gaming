'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TeachingRenderer = require('../teaching-renderer.js');
const STAGES = require('../teaching-stages.js');
const SAMPLE = require('../sample-creature.js');

function stubCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (p === 'measureText') return () => ({ width: 0 });
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

function stubCanvas(w, h) {
  const ctx = stubCtx();
  return {
    width: w, height: h, clientWidth: w, clientHeight: h, style: {},
    getContext() { return ctx; },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: w, bottom: h, width: w, height: h }; }
  };
}

function findStage(key) { return STAGES.find(s => s.key === key); }

test('构造不抛错', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  assert.ok(r);
});

test('applyStage 按配置重建脊椎节数', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('spine_short'));
  assert.equal(r.state.spine.length, 6);
  r.applyStage(findStage('spine_long'));
  assert.equal(r.state.spine.length, 12);
  r.applyStage(findStage('spine_ik'));
  assert.equal(r.state.spine.length, 20);
});

test('启用 legs 阶段有 4 条腿', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('spine_ik'));
  assert.equal(r.state.legs.length, 4);
});

test('tick 多帧不抛错，头部朝目标移动', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('serpentine'));
  r.state.pointerActive = true;
  r.state.target = { x: 900, y: 100 };
  const before = { x: r.state.spine[0].x, y: r.state.spine[0].y };
  for (let i = 0; i < 30; i++) r.tick(1);
  const after = { x: r.state.spine[0].x, y: r.state.spine[0].y };
  const movedToward =
    Math.hypot(900 - after.x, 100 - after.y) < Math.hypot(900 - before.x, 100 - before.y);
  assert.ok(movedToward, '头部应朝目标靠近');
});

test('_setPointer 把屏幕坐标映射为内部 target 并置 active', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r._setPointer(480, 280, true);
  assert.ok(Math.abs(r.state.target.x - 480) < 1e-6);
  assert.ok(Math.abs(r.state.target.y - 280) < 1e-6);
  assert.equal(r.state.pointerActive, true);
});

test('setParams 改 spineNodes 触发重建', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('params'));
  r.setParams({ spineNodes: 14 });
  assert.equal(r.state.spine.length, 14);
});

test('每个阶段都能 applyStage + tick 而不抛错', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  for (const s of STAGES) {
    r.applyStage(s);
    for (let i = 0; i < 5; i++) r.tick(1);
  }
  assert.ok(true);
});
