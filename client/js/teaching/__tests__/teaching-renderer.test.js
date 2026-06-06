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

test('_addFood 把屏幕坐标映射为食物点并入队', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r._addFood(300, 200);
  assert.equal(r.state.food.length, 1);
  assert.ok(Math.abs(r.state.food[0].x - 300) < 1e-6);
  assert.ok(Math.abs(r.state.food[0].y - 200) < 1e-6);
});

test('视野阶段：视野锥内的食物被锁定→慢速靠近→吃掉后移除', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  const head = r.state.spine[0]; // 复位后头部朝 +x
  r.state.food = [{ x: head.x + 200, y: head.y }]; // 正前方、视野内
  r.tick(1);
  assert.equal(r.state.foodTarget, r.state.food[0], '视野内食物应被锁定');
  assert.equal(r.state.foodSeeking, true, '锁定后进入觅食状态');
  let eaten = false;
  for (let i = 0; i < 400 && !eaten; i++) { r.tick(1); if (r.state.food.length === 0) eaten = true; }
  assert.ok(eaten, '靠近接触后应吃掉食物');
  assert.equal(r.state.foodTarget, null, '吃掉后解除锁定');
  assert.equal(r.state.foodSeeking, false);
});

test('视野阶段：视野锥外（身后）的食物不会被锁定', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  const head = r.state.spine[0];
  r.state.food = [{ x: head.x - 200, y: head.y }]; // 正后方，超出视野角
  r.tick(1);
  assert.equal(r.state.foodTarget, null, '身后食物不应被锁定');
  assert.equal(r.state.foodSeeking, false);
});

test('切换离开视野阶段会清空已放置的食物', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  r._addFood(100, 100);
  assert.equal(r.state.food.length, 1);
  r.applyStage(findStage('battle'));
  assert.equal(r.state.food, null, 'applyStage 应重置食物');
});
