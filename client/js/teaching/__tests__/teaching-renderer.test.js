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

test('_addFood 把屏幕坐标映射为食物点并入队（初始未被察觉）', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r._addFood(300, 200);
  assert.equal(r.state.food.length, 1);
  assert.ok(Math.abs(r.state.food[0].x - 300) < 1e-6);
  assert.ok(Math.abs(r.state.food[0].y - 200) < 1e-6);
  assert.equal(r.state.food[0].aware, 0, '刚放置的食物察觉度为 0');
});

test('视野阶段：刚放置的食物不会立即锁定（需扫视累积察觉度）', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  const head = r.state.spine[0]; // 复位后头部朝 +x
  r._addFood(head.x + 200, head.y); // 正前方、视野内（但起步未被察觉）
  r.tick(1);
  assert.equal(r.state.foodTarget, null, '单帧内不应锁定');
  assert.equal(r.state.foodSeeking, false, '尚未发现，不应进入觅食');
  assert.equal(r.state.searching, true, '场上有未发现食物时进入搜索状态');
  assert.ok(r.state.food[0].aware > 0 && r.state.food[0].aware < 1, '视野内应在累积察觉度');
});

test('视野阶段：扫视发现后锁定→慢速靠近→吃掉后移除', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  const head = r.state.spine[0];
  r._addFood(head.x + 200, head.y); // 正前方、视野内
  let seekingSeen = false, eaten = false;
  for (let i = 0; i < 2500 && !eaten; i++) {
    r.tick(1);
    if (r.state.foodSeeking) seekingSeen = true;
    if (r.state.food.length === 0) eaten = true;
  }
  assert.ok(seekingSeen, '发现后应进入觅食(追踪)状态');
  assert.ok(eaten, '靠近接触后应吃掉食物');
  assert.equal(r.state.foodTarget, null, '吃掉后解除锁定');
});

test('视野阶段：视野锥外（正后方）的食物当帧不会被锁定', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  const head = r.state.spine[0];
  r._addFood(head.x - 200, head.y); // 正后方，超出视野角
  r.tick(1);
  assert.equal(r.state.foodTarget, null, '身后食物不应被锁定');
  assert.equal(r.state.foodSeeking, false);
  assert.equal(r.state.food[0].aware, 0, '视野外不累积察觉度');
});

test('视野阶段：身后的食物需先转身搜索发现，且不会瞬间锁定', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  const head = r.state.spine[0];
  r._addFood(head.x - 220, head.y); // 正后方
  // 起步若干帧内必须仍处于“搜索而未锁定”（不能一放即追）
  let lockedEarly = false;
  for (let i = 0; i < 20; i++) { r.tick(1); if (r.state.foodTarget) lockedEarly = true; }
  assert.equal(lockedEarly, false, '身后食物在最初转身阶段不应被锁定');
  // 持续搜索/转身后最终应发现并吃掉（不会卡死）
  let searchSeen = false, eaten = false;
  for (let i = 0; i < 6000 && !eaten; i++) {
    r.tick(1);
    if (r.state.searching) searchSeen = true;
    if (r.state.food.length === 0) eaten = true;
  }
  assert.ok(searchSeen, '应出现搜索状态');
  assert.ok(eaten, '转身搜索发现后最终应吃掉身后的食物');
});

test('切换离开视野阶段会清空已放置的食物', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('vision'));
  r._addFood(100, 100);
  assert.equal(r.state.food.length, 1);
  r.applyStage(findStage('battle'));
  assert.equal(r.state.food, null, 'applyStage 应重置食物');
});

test('战斗阶段：小虫带扭动相位/朝向并缓慢爬行', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('battle'));
  const head = r.state.spine[0];
  r._addFood(head.x - 320, head.y); // 远在身后：60 帧内蜥蜴来不及捕获，可观察小虫自身运动
  const w = r.state.food[0];
  assert.equal(typeof w.phase, 'number', '小虫应有扭动相位');
  assert.equal(typeof w.dir, 'number', '小虫应有爬行朝向');
  const x0 = w.x, y0 = w.y, ph0 = w.phase;
  for (let i = 0; i < 60; i++) r.tick(1);
  assert.ok(w.phase > ph0, '相位应推进（扭动）');
  assert.ok(Math.hypot(w.x - x0, w.y - y0) > 0.5, '应缓慢爬行位移');
});

test('战斗阶段：发现小虫→潜近→猛扑→捕获并复位', () => {
  const r = new TeachingRenderer(stubCanvas(960, 560), SAMPLE);
  r.applyStage(findStage('battle'));
  const head = r.state.spine[0];
  r._addFood(head.x + 150, head.y); // 正前方、视野内
  let locked = false, lookedAt = false, pounced = false, caught = false;
  for (let i = 0; i < 4000 && !caught; i++) {
    r.tick(1);
    if (r.state.foodTarget) locked = true;
    if (r.state.lookAt) lookedAt = true;
    if (r.state.pouncing) pounced = true;
    if (r.state.food.length === 0) caught = true;
  }
  assert.ok(locked, '应发现并锁定小虫');
  assert.ok(lookedAt, '战斗中头部应盯住猎物(lookAt)');
  assert.ok(pounced, '应进入猛扑阶段');
  assert.ok(caught, '最终应捕获小虫');
  assert.equal(r.state.battlePhase, null, '捕获后状态机复位');
});
