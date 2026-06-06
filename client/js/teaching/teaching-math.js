/**
 * teaching-math.js — 教学渲染器的纯物理/几何核心（UMD）
 * 无副作用（除按约定 mutate 传入的 spine 数组）、可在 Node 下单元测试。
 * 概念对齐 client/js/lizard-renderer.js 的对应算法，但为教学独立精简实现。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingMath = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function angleDiff(a, b) { return normalizeAngle(a - b); }

  function lerpAngle(a, b, t) { return normalizeAngle(a + angleDiff(b, a) * t); }

  function solveIK2Bone(hip, target, len1, len2, bendDir) {
    var dx = target.x - hip.x, dy = target.y - hip.y;
    var d = Math.hypot(dx, dy) || 1e-6;
    var reachable = d < len1 + len2 && d > Math.abs(len1 - len2);
    var cd = clamp(d, Math.abs(len1 - len2) + 1e-6, len1 + len2 - 1e-6);
    var ux = dx / d, uy = dy / d;
    if (!reachable && d >= len1 + len2) {
      return {
        knee: { x: hip.x + ux * len1, y: hip.y + uy * len1 },
        foot: { x: hip.x + ux * (len1 + len2), y: hip.y + uy * (len1 + len2) },
        reachable: false
      };
    }
    var a = (cd * cd + len1 * len1 - len2 * len2) / (2 * cd);
    var h = Math.sqrt(Math.max(0, len1 * len1 - a * a));
    var mx = hip.x + ux * a, my = hip.y + uy * a;
    var px = -uy * (bendDir || 1), py = ux * (bendDir || 1);
    var knee = { x: mx + px * h, y: my + py * h };
    var foot = { x: hip.x + ux * cd, y: hip.y + uy * cd };
    return { knee: knee, foot: foot, reachable: reachable };
  }

  function segmentLengthAt(i, count, baseLen) {
    var t = count > 1 ? i / (count - 1) : 0;
    var taper = 0.62 + 0.38 * Math.sin(Math.PI * clamp(t, 0, 1));
    return baseLen * taper;
  }

  function bodyHalfWidthAt(t, baseWidth) {
    t = clamp(t, 0, 1);
    var w;
    if (t < 0.05) w = 0.35 + (t / 0.05) * 0.30;
    else if (t < 0.35) w = 0.65 + ((t - 0.05) / 0.30) * 0.35;
    else if (t < 0.70) w = 1.00 - ((t - 0.35) / 0.35) * 0.22;
    else w = 0.78 - ((t - 0.70) / 0.30) * 0.70;
    return Math.max(0.05, w) * baseWidth;
  }

  function serpentineOffset(index, phase, amp, freq) {
    return amp * Math.sin(index * freq + phase);
  }

  function resolveSelfCollision(spine, minDist) {
    var iters = 3;
    for (var it = 0; it < iters; it++) {
      for (var i = 0; i < spine.length; i++) {
        for (var j = i + 2; j < spine.length; j++) {
          var dx = spine[j].x - spine[i].x, dy = spine[j].y - spine[i].y;
          var d = Math.hypot(dx, dy);
          if (d < minDist && d > 1e-6) {
            var push = (minDist - d) / 2;
            var ux = dx / d, uy = dy / d;
            spine[i].x -= ux * push; spine[i].y -= uy * push;
            spine[j].x += ux * push; spine[j].y += uy * push;
          }
        }
      }
    }
    return spine;
  }

  function enforceAngleConstraint(spine, maxBend) {
    for (var i = 1; i < spine.length - 1; i++) {
      var inA = Math.atan2(spine[i].y - spine[i - 1].y, spine[i].x - spine[i - 1].x);
      var bx = spine[i + 1].x - spine[i].x, by = spine[i + 1].y - spine[i].y;
      var outA = Math.atan2(by, bx);
      var diff = normalizeAngle(outA - inA);
      if (diff > maxBend) outA = inA + maxBend;
      else if (diff < -maxBend) outA = inA - maxBend;
      else continue;
      var segLen = Math.hypot(bx, by);
      spine[i + 1].x = spine[i].x + Math.cos(outA) * segLen;
      spine[i + 1].y = spine[i].y + Math.sin(outA) * segLen;
    }
    return spine;
  }

  function traceBodyOutline(spine, halfWidths) {
    var left = [], right = [];
    for (var i = 0; i < spine.length; i++) {
      var prev = spine[Math.max(0, i - 1)];
      var next = spine[Math.min(spine.length - 1, i + 1)];
      var tx = next.x - prev.x, ty = next.y - prev.y;
      var tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl;
      var hw = halfWidths[i] || 0;
      left.push({ x: spine[i].x + nx * hw, y: spine[i].y + ny * hw });
      right.push({ x: spine[i].x - nx * hw, y: spine[i].y - ny * hw });
    }
    return { left: left, right: right };
  }

  return {
    clamp: clamp, lerp: lerp, normalizeAngle: normalizeAngle, angleDiff: angleDiff,
    lerpAngle: lerpAngle, solveIK2Bone: solveIK2Bone, segmentLengthAt: segmentLengthAt,
    bodyHalfWidthAt: bodyHalfWidthAt, serpentineOffset: serpentineOffset,
    resolveSelfCollision: resolveSelfCollision, enforceAngleConstraint: enforceAngleConstraint,
    traceBodyOutline: traceBodyOutline
  };
}));
