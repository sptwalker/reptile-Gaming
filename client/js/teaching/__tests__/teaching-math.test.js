'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../teaching-math.js');

test('clamp 限制范围', () => {
  assert.equal(M.clamp(5, 0, 10), 5);
  assert.equal(M.clamp(-3, 0, 10), 0);
  assert.equal(M.clamp(99, 0, 10), 10);
});

test('lerp 线性插值', () => {
  assert.equal(M.lerp(0, 10, 0.5), 5);
  assert.equal(M.lerp(0, 10, 0), 0);
  assert.equal(M.lerp(0, 10, 1), 10);
});

test('normalizeAngle 归一到 [-PI, PI]', () => {
  assert.ok(Math.abs(M.normalizeAngle(Math.PI * 3) - Math.PI) < 1e-9);
  assert.ok(Math.abs(M.normalizeAngle(-Math.PI * 3) + Math.PI) < 1e-9 ||
            Math.abs(M.normalizeAngle(-Math.PI * 3) - Math.PI) < 1e-9);
});

test('angleDiff 返回最短带符号差', () => {
  assert.ok(Math.abs(M.angleDiff(0.1, -0.1) - 0.2) < 1e-9);
  const d = M.angleDiff(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(Math.abs(d) - 0.2) < 1e-9);
});

test('solveIK2Bone 可达目标时膝在两骨之间、脚落在目标方向', () => {
  const hip = { x: 0, y: 0 };
  const target = { x: 30, y: 0 };
  const r = M.solveIK2Bone(hip, target, 20, 20, 1);
  assert.ok(Math.abs(Math.hypot(r.knee.x - hip.x, r.knee.y - hip.y) - 20) < 1e-6);
  assert.ok(Math.abs(Math.hypot(r.foot.x - r.knee.x, r.foot.y - r.knee.y) - 20) < 1e-6);
  assert.equal(r.reachable, true);
});

test('solveIK2Bone 不可达时伸直指向目标', () => {
  const hip = { x: 0, y: 0 };
  const target = { x: 100, y: 0 };
  const r = M.solveIK2Bone(hip, target, 20, 20, 1);
  assert.equal(r.reachable, false);
  assert.ok(Math.abs(r.foot.y) < 1e-6);
  assert.ok(Math.abs(r.foot.x - 40) < 1e-6);
});

test('segmentLengthAt 始终为正、首尾短于中段', () => {
  const mid = M.segmentLengthAt(10, 20, 16);
  const head = M.segmentLengthAt(0, 20, 16);
  const tail = M.segmentLengthAt(18, 20, 16);
  assert.ok(mid > 0 && head > 0 && tail > 0);
  assert.ok(mid >= head && mid >= tail);
});

test('bodyHalfWidthAt 尾部窄于躯干、全程为正', () => {
  const torso = M.bodyHalfWidthAt(0.3, 14);
  const tailTip = M.bodyHalfWidthAt(1.0, 14);
  assert.ok(torso > 0 && tailTip > 0);
  assert.ok(tailTip < torso);
});

test('serpentineOffset 确定性正弦', () => {
  const a = M.serpentineOffset(3, 0, 2, 0.3);
  assert.ok(Math.abs(a - 2 * Math.sin(3 * 0.3)) < 1e-9);
});

test('resolveSelfCollision 把过近的非相邻节点推开', () => {
  const spine = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
    { x: 21, y: 0.5 }
  ];
  M.resolveSelfCollision(spine, 8);
  const d = Math.hypot(spine[3].x - spine[1].x, spine[3].y - spine[1].y);
  assert.ok(d > 7, '推开后距离应接近 minDist，实际 ' + d);
});

test('enforceAngleConstraint 使相邻段夹角不超过上限', () => {
  const spine = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }
  ];
  M.enforceAngleConstraint(spine, 0.3);
  for (let i = 1; i < spine.length - 1; i++) {
    const inA = Math.atan2(spine[i].y - spine[i - 1].y, spine[i].x - spine[i - 1].x);
    const outA = Math.atan2(spine[i + 1].y - spine[i].y, spine[i + 1].x - spine[i].x);
    assert.ok(Math.abs(M.angleDiff(outA, inA)) <= 0.3 + 1e-6);
  }
});

test('traceBodyOutline 左右点数等于脊椎、按半宽外扩', () => {
  const spine = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
  const hw = [5, 5, 5];
  const o = M.traceBodyOutline(spine, hw);
  assert.equal(o.left.length, 3);
  assert.equal(o.right.length, 3);
  assert.ok(Math.abs(Math.abs(o.left[1].y - spine[1].y) - 5) < 1e-6);
});
