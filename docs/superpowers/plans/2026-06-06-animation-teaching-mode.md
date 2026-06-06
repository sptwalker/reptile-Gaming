# 蜥蜴动画教学模式（渐进渲染实验室）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个完全独立、纯前端的单页「蜥蜴动画教学实验室」，把程序化蜥蜴的渲染过程切成 13 个可切换、可鼠标牵引、实时动画的阶段，并附示范提示词与对应真实代码引用。

**Architecture:** 纯隔离新增文件，不修改任何现有渲染器/游戏/服务端代码。把可单元测试的物理/几何算法抽到 UMD 模块 `teaching-math.js`（Node `node --test` 可测）；`TeachingRenderer` 是一个薄的"按阶段配置驱动"绘制壳（自带 rAF 循环 + 鼠标牵引，可在无 DOM 环境用桩 canvas 跑帧）；`teaching-stages.js` 声明每阶段的脊椎节数/特性开关/文案/提示词；`animation-lab.js` 负责浏览器端交互编排与参数面板。

**Tech Stack:** 原生 JS（无框架、无打包）、Canvas 2D、UMD 模块模式、Node 内置 `node:test` + `node:assert/strict`（仅测试用，零依赖）。

**设计依据:** `docs/superpowers/specs/2026-06-06-animation-teaching-mode-design.md`

---

## 文件结构

全部为**新增**文件（不修改任何现有文件，含 `package.json`）：

```
client/
├── animation-lab.html                          # 教学页入口
├── css/animation-lab.css                       # 自包含深色样式
└── js/
    ├── animation-lab.js                        # 控制器（浏览器交互/参数面板）
    └── teaching/
        ├── teaching-math.js                    # 纯物理/几何（UMD，可单测）
        ├── sample-creature.js                  # 固定演示参数（UMD）
        ├── teaching-stages.js                  # 13 阶段配置（UMD）
        ├── teaching-renderer.js                # TeachingRenderer 渲染壳（UMD）
        └── __tests__/
            ├── teaching-math.test.js           # 数学核心单测
            ├── teaching-stages.test.js         # 阶段配置校验
            └── teaching-renderer.test.js       # 渲染器无头冒烟测试
```

职责边界：`teaching-math` 只做无副作用/可预测的数学；`teaching-renderer` 只做"按特性开关推进状态 + 绘制"；`teaching-stages`/`sample-creature` 是声明式数据；`animation-lab` 只做 DOM 编排。

**测试运行命令（统一）：**
```
node --test client/js/teaching/__tests__/
```
（Node 内置 runner，无需安装依赖，无需改 package.json。）

---

## Task 1: 创建功能分支并提交已确认的设计文档

**Files:**
- Modify (git only): 提交已存在但未提交的 `docs/superpowers/specs/2026-06-06-animation-teaching-mode-design.md`

- [ ] **Step 1: 创建功能分支**

项目约定：`master` 为稳定分支，功能走 `feat/*`。

Run:
```
git checkout -b feat/animation-lab
```
Expected: `Switched to a new branch 'feat/animation-lab'`

- [ ] **Step 2: 提交设计文档**

```
git add docs/superpowers/specs/2026-06-06-animation-teaching-mode-design.md
git commit -m "docs: add animation teaching mode design spec"
```
Expected: 1 file changed, 新增 spec 文件。

---

## Task 2: teaching-math.js — 纯物理/几何核心（TDD）

**Files:**
- Create: `client/js/teaching/teaching-math.js`
- Test: `client/js/teaching/__tests__/teaching-math.test.js`

- [ ] **Step 1: 先写失败测试**

Create `client/js/teaching/__tests__/teaching-math.test.js`:

```js
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
  // 跨越 PI 边界时走短弧
  const d = M.angleDiff(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(Math.abs(d) - 0.2) < 1e-9);
});

test('solveIK2Bone 可达目标时膝在两骨之间、脚落在目标方向', () => {
  const hip = { x: 0, y: 0 };
  const target = { x: 30, y: 0 };
  const r = M.solveIK2Bone(hip, target, 20, 20, 1);
  // 髋->膝 长度 ≈ 20
  assert.ok(Math.abs(Math.hypot(r.knee.x - hip.x, r.knee.y - hip.y) - 20) < 1e-6);
  // 膝->脚 长度 ≈ 20
  assert.ok(Math.abs(Math.hypot(r.foot.x - r.knee.x, r.foot.y - r.knee.y) - 20) < 1e-6);
  assert.equal(r.reachable, true);
});

test('solveIK2Bone 不可达时伸直指向目标', () => {
  const hip = { x: 0, y: 0 };
  const target = { x: 100, y: 0 };
  const r = M.solveIK2Bone(hip, target, 20, 20, 1);
  assert.equal(r.reachable, false);
  // 脚应在髋与目标连线方向、总长约 40 处
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
    { x: 21, y: 0.5 } // 与节点1过近（非相邻）
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
  // 中段节点左右点应在法线方向 ±5（此处脊椎沿 x 轴，法线为 y）
  assert.ok(Math.abs(Math.abs(o.left[1].y - spine[1].y) - 5) < 1e-6);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```
node --test client/js/teaching/__tests__/teaching-math.test.js
```
Expected: FAIL — `Cannot find module '../teaching-math.js'`

- [ ] **Step 3: 实现 teaching-math.js**

Create `client/js/teaching/teaching-math.js`:

```js
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

  // 最短带符号角差 (a - b)
  function angleDiff(a, b) { return normalizeAngle(a - b); }

  function lerpAngle(a, b, t) { return normalizeAngle(a + angleDiff(b, a) * t); }

  // 解析法二骨段 IK。hip/target: {x,y}; len1: 髋->膝; len2: 膝->脚; bendDir: ±1 膝弯方向
  function solveIK2Bone(hip, target, len1, len2, bendDir) {
    var dx = target.x - hip.x, dy = target.y - hip.y;
    var d = Math.hypot(dx, dy) || 1e-6;
    var reachable = d < len1 + len2 && d > Math.abs(len1 - len2);
    var cd = clamp(d, Math.abs(len1 - len2) + 1e-6, len1 + len2 - 1e-6);
    var ux = dx / d, uy = dy / d;
    if (!reachable && d >= len1 + len2) {
      // 伸直指向目标
      return {
        knee: { x: hip.x + ux * len1, y: hip.y + uy * len1 },
        foot: { x: hip.x + ux * (len1 + len2), y: hip.y + uy * (len1 + len2) },
        reachable: false
      };
    }
    // 余弦定理：a = 髋到膝投影点的距离
    var a = (cd * cd + len1 * len1 - len2 * len2) / (2 * cd);
    var h = Math.sqrt(Math.max(0, len1 * len1 - a * a));
    var mx = hip.x + ux * a, my = hip.y + uy * a;
    var px = -uy * (bendDir || 1), py = ux * (bendDir || 1);
    var knee = { x: mx + px * h, y: my + py * h };
    var foot = { x: hip.x + ux * cd, y: hip.y + uy * cd };
    return { knee: knee, foot: foot, reachable: reachable };
  }

  // 锥形段长：首尾略短、中段略长
  function segmentLengthAt(i, count, baseLen) {
    var t = count > 1 ? i / (count - 1) : 0;
    var taper = 0.62 + 0.38 * Math.sin(Math.PI * clamp(t, 0, 1));
    return baseLen * taper;
  }

  // 身体半宽剖面：颈->肩->躯干(最宽)->胯->尾尖
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

  // 把过近的非相邻节点沿连线推开（就地修改 spine），多次迭代收敛
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

  // 单向前进式弯折角约束：固定 i-1、i，钳制 i->i+1 方向，重排后续节点（就地修改）
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

  // 沿脊椎法线取左右轮廓点
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```
node --test client/js/teaching/__tests__/teaching-math.test.js
```
Expected: PASS — all tests pass。

- [ ] **Step 5: 提交**

```
git add client/js/teaching/teaching-math.js client/js/teaching/__tests__/teaching-math.test.js
git commit -m "feat: add teaching-math pure physics/geometry core with tests"
```

---

## Task 3: sample-creature.js — 固定演示参数

**Files:**
- Create: `client/js/teaching/sample-creature.js`
- Test: `client/js/teaching/__tests__/sample-creature.test.js`

- [ ] **Step 1: 先写失败测试**

Create `client/js/teaching/__tests__/sample-creature.test.js`:

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```
node --test client/js/teaching/__tests__/sample-creature.test.js
```
Expected: FAIL — `Cannot find module '../sample-creature.js'`

- [ ] **Step 3: 实现 sample-creature.js**

Create `client/js/teaching/sample-creature.js`:

```js
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
      bodyLightness: 42,
      patternType: 'spots',
      patternHue: 90
    }
  };
}));
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```
node --test client/js/teaching/__tests__/sample-creature.test.js
```
Expected: PASS

- [ ] **Step 5: 提交**

```
git add client/js/teaching/sample-creature.js client/js/teaching/__tests__/sample-creature.test.js
git commit -m "feat: add fixed sample creature params for teaching mode"
```

---

## Task 4: teaching-stages.js — 13 阶段配置

**Files:**
- Create: `client/js/teaching/teaching-stages.js`
- Test: `client/js/teaching/__tests__/teaching-stages.test.js`

- [ ] **Step 1: 先写失败测试**

Create `client/js/teaching/__tests__/teaching-stages.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const STAGES = require('../teaching-stages.js');

const FEATURE_KEYS = ['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision',
  'serpentine', 'skin', 'spikes', 'vision', 'battle', 'params'];

test('恰好 13 个阶段', () => {
  assert.equal(STAGES.length, 13);
});

test('每阶段含必填字段且非空', () => {
  STAGES.forEach((s, i) => {
    assert.equal(typeof s.key, 'string', '#' + i + ' key');
    assert.ok(s.key.length > 0, '#' + i + ' key 非空');
    assert.ok(s.title && s.title.length > 0, '#' + i + ' title 非空');
    assert.ok(s.spineNodes >= 1, '#' + i + ' spineNodes>=1');
    assert.ok(s.prompt && s.prompt.length > 0, '#' + i + ' prompt 非空');
    assert.ok(s.explanation && s.explanation.length > 0, '#' + i + ' explanation 非空');
    assert.ok(s.codeRef && s.codeRef.length > 0, '#' + i + ' codeRef 非空');
    assert.ok(s.features && typeof s.features === 'object', '#' + i + ' features');
  });
});

test('key 唯一', () => {
  const keys = STAGES.map(s => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('每个特性开关一旦开启不再关闭（逐步完善，单调非降）', () => {
  FEATURE_KEYS.forEach(fk => {
    let seenTrue = false;
    STAGES.forEach((s, i) => {
      const v = !!s.features[fk];
      if (seenTrue) assert.ok(v, '特性 ' + fk + ' 在阶段#' + i + ' 不应回退为 false');
      if (v) seenTrue = true;
    });
  });
});

test('阶段0仅锚点（无脊椎绘制），末阶段开启 params', () => {
  assert.equal(STAGES[0].features.spine, false);
  assert.equal(STAGES[12].features.params, true);
  assert.equal(STAGES[12].features.battle, true);
});

test('脊椎节数随前三阶段递增（短->长->更长）', () => {
  assert.ok(STAGES[1].spineNodes < STAGES[2].spineNodes);
  assert.ok(STAGES[2].spineNodes <= STAGES[3].spineNodes);
  assert.ok(STAGES[3].spineNodes >= 18);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```
node --test client/js/teaching/__tests__/teaching-stages.test.js
```
Expected: FAIL — `Cannot find module '../teaching-stages.js'`

- [ ] **Step 3: 实现 teaching-stages.js**

Create `client/js/teaching/teaching-stages.js`:

```js
/**
 * teaching-stages.js — 13 个教学阶段的声明式配置（UMD）
 * 每阶段: key/title/spineNodes/features/prompt/explanation/codeRef
 * features 一旦开启保持开启（视觉上逐步完善）；spineNodes 可在阶段间变化。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TEACHING_STAGES = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function feats(on) {
    var base = {
      spine: false, legs: false, head: false, body: false, bodyCurve: false,
      collision: false, serpentine: false, skin: false, spikes: false,
      vision: false, battle: false, params: false
    };
    (on || []).forEach(function (k) { base[k] = true; });
    return base;
  }

  return [
    {
      key: 'anchor', title: '0 · 移动锚点', spineNodes: 1,
      features: feats([]),
      prompt: '先给我一个会在画布里缓慢漫游的目标点，并且我用鼠标按住拖动时，这个点要跟着光标走，松开后恢复自动漫游。',
      explanation: '一切动画都从"一个会动的点"开始。这个锚点就是蜥蜴的头要追逐的目标——之后所有身体结构都跟随它。',
      codeRef: 'lizard-renderer.js: _computeAITarget / _bindEvents'
    },
    {
      key: 'spine_short', title: '1 · 短脊椎链(6节)', spineNodes: 6,
      features: feats(['spine']),
      prompt: '在锚点后面接一条 6 个关节的链子，用正向运动学让每个关节依次跟随前一个，形成一条会甩动的短脊椎。',
      explanation: '正向运动学(FK)：头节点追锚点，其余节点按固定段长依次跟随前一节点。节点少时链条偏僵硬。',
      codeRef: 'lizard-renderer.js: _initSpine / _updateSpine'
    },
    {
      key: 'spine_long', title: '2 · 长脊椎链(12节)', spineNodes: 12,
      features: feats(['spine']),
      prompt: '把脊椎关节数增加到 12 节，让链条更长更柔顺，转弯时呈现自然的曲线拖尾。',
      explanation: '同样的 FK，节点更多 → 曲率分布更细腻、转向更顺滑。节数是"柔顺度"的关键参数。',
      codeRef: 'lizard-renderer.js: SPINE_NODE_COUNT'
    },
    {
      key: 'spine_ik', title: '3 · 更长脊椎 + IK 腿部', spineNodes: 20,
      features: feats(['spine', 'legs']),
      prompt: '脊椎加到 20 节，并在肩、胯位置各装一对腿；每条腿用二骨段反向运动学解算，配合对角步态，移动时自动迈步落脚。',
      explanation: '反向运动学(IK)：已知髋与落脚点，解析求出膝关节位置。四条腿按对角分组交替迈步，形成行走步态。',
      codeRef: 'lizard-renderer.js: _solveIK / _updateLegs'
    },
    {
      key: 'skin_outline', title: '4 · 头部 + 身体轮廓', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body']),
      prompt: '给脊椎"包上皮"：沿脊椎法线左右等宽外扩描出闭合轮廓并填充，再在头节点画一个带朝向的椭圆头。',
      explanation: '先用等宽轮廓把骨架变成连续剪影，并让头部独立朝向。这一步只求"有形"，宽度还没有变化。',
      codeRef: 'lizard-renderer.js: _drawHead / _traceBodyPath / _drawBody'
    },
    {
      key: 'bodyform', title: '5 · 体型曲线', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve']),
      prompt: '让身体不再等宽：颈细、肩到躯干最宽、再到胯收窄、尾巴渐渐变尖，按位置给出半宽剖面。',
      explanation: '体型参数化：半宽随归一化位置(颈/肩/腹/胯/尾)变化，把等宽剪影精化为有体态的锥形身躯。',
      codeRef: 'lizard-renderer.js: _segmentLengthAt / _bodyWidthAt'
    },
    {
      key: 'collision', title: '6 · 防止自碰撞', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision']),
      prompt: '急转弯时身体会自我穿插，加入两条约束：相邻段的弯折角不超过上限，非相邻节点间保持最小间距。',
      explanation: '没有约束时长身躯会打结。最小间距把过近节点推开，弯折角约束限制每节相对前一节的转角，转弯顺滑不穿插。',
      codeRef: 'lizard-renderer.js: _resolveBodyCollisions / _enforceAngleConstraints'
    },
    {
      key: 'serpentine', title: '7 · 蛇形摆动', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision', 'serpentine']),
      prompt: '沿脊椎叠加一道随时间推进的正弦横波，让身体像爬行动物那样左右蜿蜒摆动。',
      explanation: 'serpentine 波：沿身体索引施加正弦横向偏移并随时间相位推进，赋予静止/移动时的生命感。',
      codeRef: 'lizard-renderer.js: _updateSpine(波部分) / SERPENTINE_*'
    },
    {
      key: 'skin_pattern', title: '8 · 皮肤花纹', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision', 'serpentine', 'skin']),
      prompt: '根据 body_seed 的色相/明度/花纹类型给身体上色，并沿背部画一排花纹斑点，区分腹背配色。',
      explanation: '程序化外观：由 body_seed 决定配色与花纹，不依赖贴图。颜色饱和度等来自 render_params。',
      codeRef: 'lizard-renderer.js: _generateSkinColors / _drawPattern'
    },
    {
      key: 'details', title: '9 · 背刺与脚部细节', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision', 'serpentine', 'skin', 'spikes']),
      prompt: '沿脊背加一排三角背刺(中段最长)，并在每只脚的落点画出脚趾细节，增强生物感。',
      explanation: '装饰层：背刺沿脊椎法线生成、长度随体段变化；脚部细节强化"落地"的真实感。',
      codeRef: 'lizard-renderer.js: _drawSpines / _drawFoot'
    },
    {
      key: 'vision', title: '10 · 视野锥 + 光点', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision', 'serpentine', 'skin', 'spikes', 'vision']),
      prompt: '在头部前方画一个扇形视野锥(清晰区+警觉区两层)，并在场景里散布若干可被"看到"的光点。',
      explanation: '感知可视化：把 AI 的视野/感知做成可见的扇形与光点，为后续"看到目标→行动"的战斗逻辑铺垫。',
      codeRef: 'lizard-renderer.js: _drawVisionCone / _drawLightDots / _findNearestDotInFOV'
    },
    {
      key: 'battle', title: '11 · 战斗动作', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision', 'serpentine', 'skin', 'spikes', 'vision', 'battle']),
      prompt: '让蜥蜴周期性地朝一个目标发起一次扑咬/突进，命中瞬间在头部迸发一圈黄色冲击特效。',
      explanation: '动作驱动 + 特效：由外部动作目标驱动一次冲刺位移，配合命中帧的环形特效，串起"战斗表现"。',
      codeRef: 'lizard-renderer.js: setExternalMoveTarget / _applyTestEffect / triggerSkillTest'
    },
    {
      key: 'params', title: '12 · 参数化', spineNodes: 20,
      features: feats(['spine', 'legs', 'head', 'body', 'bodyCurve', 'collision', 'serpentine', 'skin', 'spikes', 'vision', 'battle', 'params']),
      prompt: '把外观接到一组滑块：体型、头部大小、肢体粗细、身体色相、花纹类型、脊椎节数——拖动即实时改变这只蜥蜴。',
      explanation: 'render_params → 外观映射：服务端用属性算出这些参数，前端据此渲染千变万化的个体。这里直接用滑块演示该映射。',
      codeRef: 'lizard-renderer.js: applyRenderParams / applyHiddenGene'
    }
  ];
}));
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```
node --test client/js/teaching/__tests__/teaching-stages.test.js
```
Expected: PASS

- [ ] **Step 5: 提交**

```
git add client/js/teaching/teaching-stages.js client/js/teaching/__tests__/teaching-stages.test.js
git commit -m "feat: add 13-stage teaching config with prompts and code refs"
```

---

## Task 5: teaching-renderer.js — 渲染器（无头冒烟测试）

**Files:**
- Create: `client/js/teaching/teaching-renderer.js`
- Test: `client/js/teaching/__tests__/teaching-renderer.test.js`

- [ ] **Step 1: 先写失败测试（含桩 canvas / ctx）**

Create `client/js/teaching/__tests__/teaching-renderer.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TeachingRenderer = require('../teaching-renderer.js');
const STAGES = require('../teaching-stages.js');
const SAMPLE = require('../sample-creature.js');

// 无操作的 2D 上下文桩（吞掉所有绘制调用，记录属性赋值）
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
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```
node --test client/js/teaching/__tests__/teaching-renderer.test.js
```
Expected: FAIL — `Cannot find module '../teaching-renderer.js'`

- [ ] **Step 3: 实现 teaching-renderer.js**

Create `client/js/teaching/teaching-renderer.js`:

```js
/**
 * teaching-renderer.js — 按阶段配置驱动的教学渲染器（UMD）
 * 自带 rAF 循环与鼠标牵引；可在无 DOM 环境用桩 canvas 调用 tick(dt) 跑帧。
 * 依赖 teaching-math.js（浏览器经全局 TeachingMath，Node 经 require）。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TeachingRenderer = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var M = root.TeachingMath || (typeof require === 'function' ? require('./teaching-math.js') : null);

  var DEFAULT_FEATURES = {
    spine: false, legs: false, head: false, body: false, bodyCurve: false,
    collision: false, serpentine: false, skin: false, spikes: false,
    vision: false, battle: false, params: false
  };

  function rand() { return Math.random(); } // 纯装饰性动画随机（非游戏逻辑，符合 sync-rules）

  function TeachingRenderer(canvas, sample) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._w = canvas.width || canvas.clientWidth || 960;
    this._h = canvas.height || canvas.clientHeight || 560;
    sample = sample || {};
    var rp = sample.render_params || {};
    var seed = sample.body_seed || {};
    this.params = {
      spineNodes: rp.spineNodes || 20,
      segmentLength: rp.segmentLength || 16,
      bodyScale: rp.bodyScale || 1.0,
      headScale: rp.headScale || 1.0,
      limbThickness: rp.limbThickness || 1.0,
      serpentineAmp: rp.serpentineAmp || 1.5,
      serpentineFreq: rp.serpentineFreq || 0.3,
      serpentineSpeed: rp.serpentineSpeed || 0.2,
      fovAngle: rp.fovAngle || 60,
      fovClearDist: rp.fovClearDist || 220,
      fovMaxDist: rp.fovMaxDist || 360,
      bodyHue: seed.bodyHue != null ? seed.bodyHue : 120,
      bodyLightness: seed.bodyLightness != null ? seed.bodyLightness : 42,
      colorSaturation: rp.colorSaturation || 1.0,
      patternType: seed.patternType || 'spots',
      patternHue: seed.patternHue != null ? seed.patternHue : 90
    };
    this.features = Object.assign({}, DEFAULT_FEATURES);
    this.speed = 1;
    this._rafId = null;
    this.state = {
      time: 0, serpentinePhase: 0, gaitPhase: 0,
      target: { x: this._w * 0.5, y: this._h * 0.5 },
      pointerActive: false, wanderTimer: 0, battleTimer: 0, fx: null, dots: null,
      spine: [], legs: []
    };
    this._buildSpine(this.params.spineNodes);
    this._buildLegs();
    this._colors = this._makeColors();
    this._bindPointer();
  }

  TeachingRenderer.prototype._buildSpine = function (count) {
    count = Math.max(1, count | 0);
    var spine = [], cx = this._w * 0.5, cy = this._h * 0.5, seg = this.params.segmentLength;
    for (var i = 0; i < count; i++) spine.push({ x: cx - i * seg, y: cy });
    this.state.spine = spine;
  };

  TeachingRenderer.prototype._buildLegs = function () {
    var n = this.state.spine.length;
    function idx(f) { return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))); }
    this.state.legs = [
      { hip: idx(0.18), side: 1, group: 0, foot: null, plant: null, stepping: false, t: 0, hipPos: null },
      { hip: idx(0.18), side: -1, group: 1, foot: null, plant: null, stepping: false, t: 0, hipPos: null },
      { hip: idx(0.46), side: 1, group: 1, foot: null, plant: null, stepping: false, t: 0, hipPos: null },
      { hip: idx(0.46), side: -1, group: 0, foot: null, plant: null, stepping: false, t: 0, hipPos: null }
    ];
  };

  TeachingRenderer.prototype._makeColors = function () {
    var s = Math.round(55 * this.params.colorSaturation);
    var h = this.params.bodyHue, l = this.params.bodyLightness;
    return {
      body: 'hsl(' + h + ',' + s + '%,' + l + '%)',
      belly: 'hsl(' + h + ',' + s + '%,' + Math.min(80, l + 18) + '%)',
      outline: 'hsl(' + h + ',' + s + '%,' + Math.max(8, l - 22) + '%)',
      pattern: 'hsla(' + this.params.patternHue + ',' + s + '%,' + Math.max(12, l - 10) + '%,0.55)'
    };
  };

  TeachingRenderer.prototype.applyStage = function (cfg) {
    cfg = cfg || {};
    this.features = Object.assign({}, DEFAULT_FEATURES, cfg.features || {});
    var want = cfg.spineNodes || this.params.spineNodes;
    if (!this.state.spine.length || this.state.spine.length !== want) {
      this._buildSpine(want);
      this._buildLegs();
    }
    this.state.serpentinePhase = 0;
    this.state.gaitPhase = 0;
    this.state.battleTimer = 0;
    this.state.fx = null;
    this.reset();
    return this;
  };

  TeachingRenderer.prototype.reset = function () {
    var sp = this.state.spine, seg = this.params.segmentLength;
    var hx = sp[0] ? sp[0].x : this._w * 0.5, hy = sp[0] ? sp[0].y : this._h * 0.5;
    for (var i = 0; i < sp.length; i++) { sp[i].x = hx - i * seg; sp[i].y = hy; }
    this._buildLegs();
  };

  TeachingRenderer.prototype.setParams = function (p) {
    if (!p) return;
    var rebuild = (p.spineNodes != null && (p.spineNodes | 0) !== this.state.spine.length);
    Object.assign(this.params, p);
    if (rebuild) { this._buildSpine(this.params.spineNodes); this._buildLegs(); this.reset(); }
    this._colors = this._makeColors();
  };

  TeachingRenderer.prototype.setSpeed = function (m) { this.speed = Math.max(0.1, Number(m) || 1); };

  TeachingRenderer.prototype._setPointer = function (clientX, clientY, active) {
    var rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: this._w, height: this._h };
    var sx = this._w / (rect.width || this._w), sy = this._h / (rect.height || this._h);
    this.state.target = { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    this.state.pointerActive = !!active;
  };

  TeachingRenderer.prototype._bindPointer = function () {
    if (!this.canvas.addEventListener || typeof window === 'undefined') return;
    var self = this, down = false;
    function pos(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }
    this._onDown = function (e) { down = true; var t = pos(e); self._setPointer(t.x, t.y, true); };
    this._onMove = function (e) { if (!down) return; var t = pos(e); self._setPointer(t.x, t.y, true); };
    this._onUp = function () { down = false; self.state.pointerActive = false; };
    this.canvas.addEventListener('mousedown', this._onDown);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
    this.canvas.addEventListener('touchstart', this._onDown, { passive: true });
    this.canvas.addEventListener('touchmove', this._onMove, { passive: true });
    window.addEventListener('touchend', this._onUp);
  };

  TeachingRenderer.prototype.play = function () {
    if (typeof requestAnimationFrame === 'undefined' || this._rafId) return;
    var self = this, last = 0;
    function loop(ts) {
      if (!last) last = ts;
      var dt = Math.min(3, (ts - last) / 16.67); last = ts;
      try { self.tick(dt * self.speed); } catch (e) { console.error('[TeachingRenderer]', e); }
      self._rafId = requestAnimationFrame(loop);
    }
    this._rafId = requestAnimationFrame(loop);
  };

  TeachingRenderer.prototype.pause = function () {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  };

  TeachingRenderer.prototype.tick = function (dt) {
    if (!(dt > 0)) dt = 1;
    this._update(dt);
    this._draw();
  };

  TeachingRenderer.prototype._update = function (dt) {
    var s = this.state, p = this.params;
    s.time += dt;
    if (!s.pointerActive) {
      s.wanderTimer -= dt;
      if (s.wanderTimer <= 0) {
        s.wanderTimer = 90 + rand() * 120;
        s.target = { x: this._w * (0.2 + rand() * 0.6), y: this._h * (0.25 + rand() * 0.5) };
      }
    }
    if (this.features.battle) this._updateBattle(dt);

    var sp = s.spine;
    if (sp.length) {
      var head = sp[0];
      var dx = s.target.x - head.x, dy = s.target.y - head.y, d = Math.hypot(dx, dy);
      var maxStep = 4.2 * (this.features.battle && s.fx ? 1.8 : 1);
      if (d > 1) { var step = Math.min(maxStep, d * 0.12); head.x += dx / d * step; head.y += dy / d * step; }
      for (var i = 1; i < sp.length; i++) {
        var ax = sp[i].x - sp[i - 1].x, ay = sp[i].y - sp[i - 1].y, al = Math.hypot(ax, ay) || 1;
        var seg = M.segmentLengthAt(i - 1, sp.length, p.segmentLength);
        sp[i].x = sp[i - 1].x + ax / al * seg;
        sp[i].y = sp[i - 1].y + ay / al * seg;
      }
      if (this.features.serpentine) {
        s.serpentinePhase += p.serpentineSpeed * dt;
        for (var j = 1; j < sp.length; j++) {
          var tx = sp[j].x - sp[j - 1].x, ty = sp[j].y - sp[j - 1].y, tl = Math.hypot(tx, ty) || 1;
          var nx = -ty / tl, ny = tx / tl;
          var off = M.serpentineOffset(j, s.serpentinePhase, p.serpentineAmp, p.serpentineFreq);
          sp[j].x += nx * off; sp[j].y += ny * off;
        }
      }
      if (this.features.collision) {
        M.resolveSelfCollision(sp, p.segmentLength * 0.7);
        M.enforceAngleConstraint(sp, 0.5);
      }
    }
    if (this.features.legs) this._updateLegs(dt);
  };

  TeachingRenderer.prototype._updateBattle = function (dt) {
    var s = this.state;
    s.battleTimer -= dt;
    if (s.fx) { s.fx.t -= dt; if (s.fx.t <= 0) s.fx = null; }
    if (s.battleTimer <= 0) {
      s.battleTimer = 150;
      s.pointerActive = false;
      s.target = { x: this._w * (0.3 + rand() * 0.4), y: this._h * (0.35 + rand() * 0.3) };
      s.fx = { t: 24, dur: 24 };
    }
  };

  TeachingRenderer.prototype._updateLegs = function (dt) {
    var s = this.state, sp = s.spine, p = this.params;
    s.gaitPhase += dt;
    var reach = p.segmentLength * 1.4;
    for (var k = 0; k < s.legs.length; k++) {
      var leg = s.legs[k];
      var hip = sp[Math.min(sp.length - 1, leg.hip)]; if (!hip) continue;
      var prev = sp[Math.min(sp.length - 1, Math.max(0, leg.hip - 1))] || hip;
      var bx = hip.x - prev.x, by = hip.y - prev.y, bl = Math.hypot(bx, by) || 1;
      var nx = -by / bl, ny = bx / bl;
      var restX = hip.x + nx * leg.side * reach * 0.6 + bx / bl * reach * 0.2;
      var restY = hip.y + ny * leg.side * reach * 0.6 + by / bl * reach * 0.2;
      if (!leg.plant) { leg.plant = { x: restX, y: restY }; leg.foot = { x: restX, y: restY }; }
      var dpl = Math.hypot(restX - leg.plant.x, restY - leg.plant.y);
      var groupActive = (Math.floor(s.gaitPhase / 14) % 2) === leg.group;
      if (dpl > reach * 0.9 && groupActive && !leg.stepping) {
        leg.stepping = true; leg.t = 0;
        leg.from = { x: leg.foot.x, y: leg.foot.y };
        leg.to = { x: restX, y: restY };
      }
      if (leg.stepping) {
        leg.t += 0.18 * dt; var tt = Math.min(1, leg.t);
        leg.foot.x = leg.from.x + (leg.to.x - leg.from.x) * tt;
        leg.foot.y = leg.from.y + (leg.to.y - leg.from.y) * tt - Math.sin(tt * Math.PI) * 6;
        if (tt >= 1) { leg.stepping = false; leg.plant = { x: leg.to.x, y: leg.to.y }; }
      }
      leg.hipPos = { x: hip.x, y: hip.y };
    }
  };

  TeachingRenderer.prototype._draw = function () {
    var ctx = this.ctx; if (!ctx) return;
    ctx.clearRect(0, 0, this._w, this._h);
    ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, this._w, this._h);
    if (this.features.vision) this._drawVision(ctx);
    if (!this.features.spine) { this._drawAnchor(ctx); this._drawHint(ctx); return; }
    if (this.features.legs) this._drawLegs(ctx);
    if (this.features.body) this._drawBody(ctx); else this._drawSpineLine(ctx);
    if (this.features.skin) this._drawPattern(ctx);
    if (this.features.head) this._drawHead(ctx);
    if (this.features.spikes) this._drawSpikes(ctx);
    if (this.features.battle && this.state.fx) this._drawFx(ctx);
    this._drawHint(ctx);
  };

  TeachingRenderer.prototype._drawAnchor = function (ctx) {
    var t = this.state.target, r = 8 + Math.sin(this.state.time * 0.15) * 3;
    ctx.strokeStyle = '#6cf'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI * 2); ctx.fill();
  };

  TeachingRenderer.prototype._drawSpineLine = function (ctx) {
    var sp = this.state.spine; if (!sp.length) return;
    ctx.strokeStyle = '#7fd1c0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y);
    for (var i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.stroke();
    ctx.fillStyle = '#bfeee0';
    for (var j = 0; j < sp.length; j++) { ctx.beginPath(); ctx.arc(sp[j].x, sp[j].y, 2.5, 0, Math.PI * 2); ctx.fill(); }
  };

  TeachingRenderer.prototype._halfWidths = function () {
    var sp = this.state.spine, p = this.params, base = 14 * p.bodyScale, out = [];
    for (var i = 0; i < sp.length; i++) {
      var t = sp.length > 1 ? i / (sp.length - 1) : 0;
      out.push(this.features.bodyCurve ? M.bodyHalfWidthAt(t, base) : base * 0.7);
    }
    return out;
  };

  TeachingRenderer.prototype._drawBody = function (ctx) {
    var sp = this.state.spine; if (sp.length < 2) return;
    var o = M.traceBodyOutline(sp, this._halfWidths());
    ctx.beginPath(); ctx.moveTo(o.left[0].x, o.left[0].y);
    for (var i = 1; i < o.left.length; i++) ctx.lineTo(o.left[i].x, o.left[i].y);
    for (var j = o.right.length - 1; j >= 0; j--) ctx.lineTo(o.right[j].x, o.right[j].y);
    ctx.closePath();
    ctx.fillStyle = this.features.skin ? this._colors.body : '#3a4a55'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = this.features.skin ? this._colors.outline : '#22303a'; ctx.stroke();
  };

  TeachingRenderer.prototype._drawPattern = function (ctx) {
    var sp = this.state.spine, hw = this._halfWidths();
    ctx.fillStyle = this._colors.pattern;
    for (var i = 2; i < sp.length - 1; i += 2) {
      var r = Math.max(2, hw[i] * 0.4);
      ctx.beginPath(); ctx.arc(sp[i].x, sp[i].y, r, 0, Math.PI * 2); ctx.fill();
    }
  };

  TeachingRenderer.prototype._drawHead = function (ctx) {
    var sp = this.state.spine, p = this.params, h = sp[0], n = sp[1] || h;
    var ang = Math.atan2(h.y - n.y, h.x - n.x), hs = 13 * p.headScale * p.bodyScale;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
    ctx.fillStyle = this.features.skin ? this._colors.body : '#46586a';
    ctx.beginPath(); ctx.ellipse(hs * 0.4, 0, hs, hs * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = this.features.skin ? this._colors.outline : '#22303a'; ctx.stroke();
    ctx.fillStyle = '#10151c';
    ctx.beginPath(); ctx.arc(hs * 0.6, -hs * 0.35, 2.2, 0, Math.PI * 2);
    ctx.arc(hs * 0.6, hs * 0.35, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  TeachingRenderer.prototype._drawLegs = function (ctx) {
    var s = this.state, p = this.params;
    ctx.lineWidth = 4 * p.limbThickness; ctx.lineCap = 'round';
    ctx.strokeStyle = this.features.skin ? this._colors.outline : '#2c3a44';
    for (var k = 0; k < s.legs.length; k++) {
      var leg = s.legs[k]; if (!leg.hipPos || !leg.foot) continue;
      var ik = M.solveIK2Bone(leg.hipPos, leg.foot, p.segmentLength * 0.9, p.segmentLength * 0.8, leg.side);
      ctx.beginPath(); ctx.moveTo(leg.hipPos.x, leg.hipPos.y);
      ctx.lineTo(ik.knee.x, ik.knee.y); ctx.lineTo(ik.foot.x, ik.foot.y); ctx.stroke();
      if (this.features.spikes) {
        ctx.fillStyle = this.features.skin ? this._colors.outline : '#2c3a44';
        ctx.beginPath(); ctx.arc(ik.foot.x, ik.foot.y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  TeachingRenderer.prototype._drawSpikes = function (ctx) {
    var sp = this.state.spine;
    ctx.fillStyle = this.features.skin ? this._colors.outline : '#2c3a44';
    for (var i = 1; i < sp.length - 1; i++) {
      var a = sp[i - 1], b = sp[i + 1];
      var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl;
      var t = i / (sp.length - 1), len = 7 * (1 - Math.abs(0.4 - t));
      if (len < 1.5) continue;
      ctx.beginPath();
      ctx.moveTo(sp[i].x - nx * 2, sp[i].y - ny * 2);
      ctx.lineTo(sp[i].x + nx * len, sp[i].y + ny * len);
      ctx.lineTo(sp[i].x + nx * 2, sp[i].y + ny * 2);
      ctx.closePath(); ctx.fill();
    }
  };

  TeachingRenderer.prototype._drawVision = function (ctx) {
    var sp = this.state.spine; if (!sp.length) return;
    var h = sp[0], n = sp[1] || h, p = this.params;
    var ang = Math.atan2(h.y - n.y, h.x - n.x), half = (p.fovAngle * Math.PI / 180) / 2;
    ctx.fillStyle = 'rgba(120,200,255,0.07)';
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    ctx.arc(h.x, h.y, p.fovMaxDist * 0.5, ang - half, ang + half); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(120,200,255,0.10)';
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    ctx.arc(h.x, h.y, p.fovClearDist * 0.5, ang - half, ang + half); ctx.closePath(); ctx.fill();
    if (!this.state.dots) {
      this.state.dots = [];
      for (var i = 0; i < 6; i++) this.state.dots.push({ x: rand() * this._w, y: rand() * this._h });
    }
    ctx.fillStyle = '#ffe08a';
    for (var d = 0; d < this.state.dots.length; d++) {
      var dot = this.state.dots[d];
      ctx.beginPath(); ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  };

  TeachingRenderer.prototype._drawFx = function (ctx) {
    var h = this.state.spine[0], fx = this.state.fx, prog = fx.t / fx.dur;
    ctx.strokeStyle = 'rgba(255,210,90,' + prog + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(h.x, h.y, 40 * (1 - prog + 0.2), 0, Math.PI * 2); ctx.stroke();
  };

  TeachingRenderer.prototype._drawHint = function (ctx) {
    ctx.fillStyle = 'rgba(180,200,220,0.45)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('按住并拖动可牵引', 12, this._h - 12);
  };

  TeachingRenderer.prototype.destroy = function () {
    this.pause();
    if (this.canvas.removeEventListener && typeof window !== 'undefined') {
      this.canvas.removeEventListener('mousedown', this._onDown);
      window.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('mouseup', this._onUp);
      this.canvas.removeEventListener('touchstart', this._onDown);
      this.canvas.removeEventListener('touchmove', this._onMove);
      window.removeEventListener('touchend', this._onUp);
    }
  };

  return TeachingRenderer;
}));
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```
node --test client/js/teaching/__tests__/teaching-renderer.test.js
```
Expected: PASS — 全部通过。

- [ ] **Step 5: 全量测试 + 语法检查**

Run:
```
node --test client/js/teaching/__tests__/
node --check client/js/teaching/teaching-renderer.js
```
Expected: 所有测试 PASS；`node --check` 无输出（语法正确）。

- [ ] **Step 6: 提交**

```
git add client/js/teaching/teaching-renderer.js client/js/teaching/__tests__/teaching-renderer.test.js
git commit -m "feat: add TeachingRenderer stage-driven drawing shell with headless tests"
```

---

## Task 6: animation-lab.html — 页面骨架

**Files:**
- Create: `client/animation-lab.html`

- [ ] **Step 1: 创建 HTML**

Create `client/animation-lab.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>蜥蜴动画教学实验室</title>
  <link rel="stylesheet" href="css/animation-lab.css">
</head>
<body>
  <header class="lab-header">
    <h1>🦎 蜥蜴动画教学实验室</h1>
    <details class="genesis">
      <summary>本项目的"创世提示词"（点击展开）</summary>
      <pre id="genesisText">加载中…</pre>
    </details>
  </header>

  <main class="lab-main">
    <section class="stage-view">
      <canvas id="labCanvas" width="900" height="560"></canvas>
      <div class="param-panel" id="paramPanel" hidden>
        <h3>参数化</h3>
        <label>体型 <input type="range" id="pBodyScale" min="0.6" max="1.6" step="0.05" value="1"></label>
        <label>头部 <input type="range" id="pHeadScale" min="0.6" max="1.8" step="0.05" value="1"></label>
        <label>肢体粗细 <input type="range" id="pLimb" min="0.5" max="2" step="0.05" value="1"></label>
        <label>身体色相 <input type="range" id="pHue" min="0" max="360" step="1" value="120"></label>
        <label>花纹
          <select id="pPattern">
            <option value="spots">斑点</option>
            <option value="stripes">条纹</option>
            <option value="none">无</option>
          </select>
        </label>
        <label>脊椎节数 <input type="range" id="pNodes" min="8" max="26" step="1" value="20"></label>
      </div>
    </section>

    <aside class="stage-card">
      <div class="card-title" id="cardTitle">—</div>
      <div class="card-block">
        <div class="card-label">① 示范提示词</div>
        <p class="card-prompt" id="cardPrompt">—</p>
      </div>
      <div class="card-block">
        <div class="card-label">② 技术讲解</div>
        <p class="card-explain" id="cardExplain">—</p>
      </div>
      <div class="card-block">
        <div class="card-label">③ 对应真实代码</div>
        <code class="card-coderef" id="cardCodeRef">—</code>
      </div>
    </aside>
  </main>

  <footer class="lab-footer">
    <div class="timeline" id="timeline"></div>
    <div class="controls">
      <button id="btnPrev">⏮ 上一步</button>
      <button id="btnNext">下一步 ⏭</button>
      <button id="btnPlay">⏸ 暂停动画</button>
      <label class="speed">速度
        <select id="selSpeed">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="2">2x</option>
        </select>
      </label>
      <button id="btnAuto">⏩ 自动演进</button>
    </div>
  </footer>

  <script src="js/teaching/teaching-math.js"></script>
  <script src="js/teaching/sample-creature.js"></script>
  <script src="js/teaching/teaching-stages.js"></script>
  <script src="js/teaching/teaching-renderer.js"></script>
  <script src="js/animation-lab.js"></script>
</body>
</html>
```

- [ ] **Step 2: 提交**

```
git add client/animation-lab.html
git commit -m "feat: add animation lab page skeleton"
```

---

## Task 7: animation-lab.css — 深色样式

**Files:**
- Create: `client/css/animation-lab.css`

- [ ] **Step 1: 创建 CSS**

Create `client/css/animation-lab.css`:

```css
* { box-sizing: border-box; }
body {
  margin: 0; background: #0a0c12; color: #d7dee8;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  display: flex; flex-direction: column; min-height: 100vh;
}
.lab-header { padding: 14px 20px; border-bottom: 1px solid #1c2230; }
.lab-header h1 { margin: 0 0 8px; font-size: 20px; }
.genesis summary { cursor: pointer; color: #8fb7e0; font-size: 13px; }
.genesis pre {
  margin-top: 8px; max-height: 220px; overflow: auto; padding: 12px;
  background: #11151f; border: 1px solid #1c2230; border-radius: 6px;
  font-size: 12px; line-height: 1.5; white-space: pre-wrap;
}
.lab-main { flex: 1; display: flex; gap: 16px; padding: 16px 20px; align-items: flex-start; }
.stage-view { position: relative; }
#labCanvas {
  background: #0d1018; border: 1px solid #1c2230; border-radius: 8px;
  cursor: grab; display: block;
}
#labCanvas:active { cursor: grabbing; }
.param-panel {
  position: absolute; top: 12px; right: 12px; width: 200px; padding: 12px;
  background: rgba(17,21,31,0.92); border: 1px solid #2a3344; border-radius: 8px;
  display: flex; flex-direction: column; gap: 8px;
}
.param-panel h3 { margin: 0 0 4px; font-size: 14px; }
.param-panel label { display: flex; flex-direction: column; font-size: 12px; gap: 3px; }
.param-panel input[type=range] { width: 100%; }
.stage-card {
  flex: 1; min-width: 280px; padding: 16px;
  background: #11151f; border: 1px solid #1c2230; border-radius: 8px;
}
.card-title { font-size: 17px; font-weight: 600; margin-bottom: 14px; color: #eaf2ff; }
.card-block { margin-bottom: 14px; }
.card-label { font-size: 12px; color: #7c93b0; margin-bottom: 5px; }
.card-prompt {
  margin: 0; padding: 10px 12px; background: #161d2b; border-left: 3px solid #4a90d9;
  border-radius: 4px; font-size: 14px; line-height: 1.6;
}
.card-explain { margin: 0; font-size: 13px; line-height: 1.7; color: #b9c4d4; }
.card-coderef {
  display: block; padding: 8px 10px; background: #0e1420; border-radius: 4px;
  font-size: 12px; color: #7fd1c0; word-break: break-all;
}
.lab-footer { padding: 12px 20px; border-top: 1px solid #1c2230; }
.timeline { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.timeline button {
  padding: 5px 10px; font-size: 12px; background: #161d2b; color: #aab8c8;
  border: 1px solid #2a3344; border-radius: 14px; cursor: pointer;
}
.timeline button.active { background: #2a6cc0; color: #fff; border-color: #3a7cd0; }
.controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.controls button, .controls select {
  padding: 7px 14px; font-size: 13px; background: #1a2230; color: #d7dee8;
  border: 1px solid #2a3344; border-radius: 6px; cursor: pointer;
}
.controls button:hover { background: #222c3e; }
.controls .speed { font-size: 12px; display: flex; align-items: center; gap: 6px; }
@media (max-width: 920px) {
  .lab-main { flex-direction: column; }
  #labCanvas { width: 100%; height: auto; }
}
```

- [ ] **Step 2: 提交**

```
git add client/css/animation-lab.css
git commit -m "feat: add animation lab dark theme styles"
```

---

## Task 8: animation-lab.js — 控制器

**Files:**
- Create: `client/js/animation-lab.js`

- [ ] **Step 1: 创建控制器**

Create `client/js/animation-lab.js`:

```js
/**
 * animation-lab.js — 教学页控制器
 * 编排 TeachingRenderer + 13 阶段：时间轴、上一步/下一步、播放/暂停、调速、
 * 自动演进、第12步参数面板、创世提示词加载。不含任何游戏/网络逻辑。
 */
(function () {
  'use strict';

  var STAGES = window.TEACHING_STAGES;
  var SAMPLE = window.SAMPLE_CREATURE;
  var canvas = document.getElementById('labCanvas');
  var renderer = new window.TeachingRenderer(canvas, SAMPLE);

  var stageIndex = 0;
  var autoTimer = null;

  // DOM 引用
  var el = {
    title: document.getElementById('cardTitle'),
    prompt: document.getElementById('cardPrompt'),
    explain: document.getElementById('cardExplain'),
    codeRef: document.getElementById('cardCodeRef'),
    timeline: document.getElementById('timeline'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnPlay: document.getElementById('btnPlay'),
    btnAuto: document.getElementById('btnAuto'),
    selSpeed: document.getElementById('selSpeed'),
    paramPanel: document.getElementById('paramPanel'),
    genesis: document.getElementById('genesisText')
  };

  // 构建时间轴按钮
  STAGES.forEach(function (s, i) {
    var b = document.createElement('button');
    b.textContent = i;
    b.title = s.title;
    b.addEventListener('click', function () { goTo(i); });
    el.timeline.appendChild(b);
  });

  function goTo(i) {
    stageIndex = Math.max(0, Math.min(STAGES.length - 1, i));
    var stage = STAGES[stageIndex];
    renderer.applyStage(stage);
    el.title.textContent = stage.title;
    el.prompt.textContent = stage.prompt;
    el.explain.textContent = stage.explanation;
    el.codeRef.textContent = stage.codeRef;
    Array.prototype.forEach.call(el.timeline.children, function (btn, idx) {
      btn.classList.toggle('active', idx === stageIndex);
    });
    el.paramPanel.hidden = !stage.features.params;
  }

  el.btnPrev.addEventListener('click', function () { stopAuto(); goTo(stageIndex - 1); });
  el.btnNext.addEventListener('click', function () { stopAuto(); goTo(stageIndex + 1); });

  el.btnPlay.addEventListener('click', function () {
    if (renderer._rafId) { renderer.pause(); el.btnPlay.textContent = '▶ 播放动画'; }
    else { renderer.play(); el.btnPlay.textContent = '⏸ 暂停动画'; }
  });

  el.selSpeed.addEventListener('change', function () { renderer.setSpeed(parseFloat(el.selSpeed.value)); });

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; el.btnAuto.textContent = '⏩ 自动演进'; }
  }
  el.btnAuto.addEventListener('click', function () {
    if (autoTimer) { stopAuto(); return; }
    el.btnAuto.textContent = '⏹ 停止演进';
    goTo(0);
    autoTimer = setInterval(function () {
      if (stageIndex >= STAGES.length - 1) { stopAuto(); return; }
      goTo(stageIndex + 1);
    }, 3500);
  });

  // 键盘左右切换
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { stopAuto(); goTo(stageIndex - 1); }
    else if (e.key === 'ArrowRight') { stopAuto(); goTo(stageIndex + 1); }
  });

  // 参数面板 → renderer.setParams
  function bindParam(id, key, transform) {
    var input = document.getElementById(id);
    input.addEventListener('input', function () {
      var v = transform ? transform(input.value) : parseFloat(input.value);
      var patch = {}; patch[key] = v;
      renderer.setParams(patch);
    });
  }
  bindParam('pBodyScale', 'bodyScale');
  bindParam('pHeadScale', 'headScale');
  bindParam('pLimb', 'limbThickness');
  bindParam('pHue', 'bodyHue');
  bindParam('pNodes', 'spineNodes', function (v) { return parseInt(v, 10); });
  document.getElementById('pPattern').addEventListener('change', function (e) {
    renderer.setParams({ patternType: e.target.value });
  });

  // 创世提示词：尝试 fetch prompt.txt，失败则用内置摘录
  var fallbackGenesis =
    '我想在此玩法基础上设计一套灵活的可供玩家自由拼装、自我AI进化的爬虫生物生成网络游戏系统……\n' +
    '（完整内容见项目根目录 prompt.txt）';
  fetch('../prompt.txt')
    .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
    .then(function (t) { el.genesis.textContent = t; })
    .catch(function () { el.genesis.textContent = fallbackGenesis; });

  // 启动
  goTo(0);
  renderer.play();
  el.btnPlay.textContent = '⏸ 暂停动画';

  // 页面隐藏时暂停省电
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) renderer.pause();
  });
})();
```

- [ ] **Step 2: 语法检查**

Run:
```
node --check client/js/animation-lab.js
```
Expected: 无输出（语法正确）。

- [ ] **Step 3: 提交**

```
git add client/js/animation-lab.js
git commit -m "feat: add animation lab controller wiring stages, controls, params"
```

---

## Task 9: 手动浏览器验收

**Files:** 无（仅验证）

- [ ] **Step 1: 全量自动化检查**

Run:
```
node --test client/js/teaching/__tests__/
node --check client/js/animation-lab.js
node --check client/js/teaching/teaching-renderer.js
node --check client/js/teaching/teaching-math.js
node --check client/js/teaching/teaching-stages.js
node --check client/js/teaching/sample-creature.js
```
Expected: 测试全 PASS；所有 `node --check` 无输出。

- [ ] **Step 2: 浏览器打开页面**

直接用浏览器打开 `client/animation-lab.html`（双击或 `file://` 路径）。
> 注：若 `file://` 下创世提示词显示为内置摘录属正常（fetch 被 CORS 拦截）；如需真实内容，可用 `npx serve client` 或现有服务静态托管后访问。

- [ ] **Step 3: 逐项核对验收标准**

对照设计文档第 8 节，逐项确认：
1. [ ] 打开即运行，无需登录/服务端。
2. [ ] 13 个时间轴按钮可点击切换，画面按阶段正确叠加（节数 6→12→20 变化可见）。
3. [ ] **每一步**按住画布拖动都能牵引蜥蜴/锚点，松开恢复漫游。
4. [ ] 播放/暂停、0.5x/1x/2x 调速生效。
5. [ ] ⏩ 自动演进能从第 0 步走到第 12 步后停止。
6. [ ] 第 12 步参数滑块实时改变体型/头部/肢体/色相/花纹/节数。
7. [ ] 每步卡片正确显示提示词/讲解/对应真实代码。
8. [ ] 浏览器控制台无报错。
9. [ ] `git status` 仅显示新增文件，无任何现有文件被修改。

- [ ] **Step 4: 记录验收结果并合并准备**

若全部通过，本功能开发完成，分支 `feat/animation-lab` 可供合并。若某项不达标，回到对应 Task 修复后重测。

---

## 风险与注意事项（实现期参考）

- **鼠标坐标换算/DPR**：`_setPointer` 已用 `getBoundingClientRect` 做 CSS→canvas 像素缩放；canvas 用固定 `width/height` 属性而非 CSS 拉伸时最稳。若后续改自适应尺寸，需同步更新 `_w/_h`。
- **节数变化重建**：`applyStage`/`setParams` 在节数变化时重建脊椎与腿并 `reset()`，避免索引越界或残留打结。
- **装饰性随机**：渲染器内 `Math.random` 仅用于漫游/光点等纯视觉，不参与任何游戏数值，符合 `docs/05-sync-rules.md` 的"前端不做游戏随机"约束。
- **编码**：所有新增文件保存为 UTF-8，避免与项目中 GBK 文档混淆。
- **隔离**：全程未 import 现有 `lizard-renderer.js` 等；如发现需要复用，应复制最小片段而非引用，保持纯隔离。
