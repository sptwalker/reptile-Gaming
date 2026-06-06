/**
 * teaching-renderer.js — 按阶段配置驱动的教学渲染器（UMD）
 * 自带 rAF 循环与鼠标牵引；可在无 DOM 环境用桩 canvas 调用 tick(dt) 跑帧。
 * 依赖 teaching-math.js（浏览器经全局 TeachingMath，Node 经 require）。
 * 几何尺寸统一放大 SCALE 倍（节点大小/间距/腿长/体宽等）。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.TeachingRenderer = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var M = root.TeachingMath || (typeof require === 'function' ? require('./teaching-math.js') : null);

  var SCALE = 3; // 全局动画尺寸放大倍数（节点/间距/腿/体型）

  var DEFAULT_FEATURES = {
    spine: false, legs: false, head: false, body: false, bodyCurve: false,
    collision: false, serpentine: false, skin: false, spikes: false,
    vision: false, battle: false, params: false, headTurn: false
  };

  function rand() { return Math.random(); }

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
      segmentLength: (rp.segmentLength || 16) * SCALE,
      bodyScale: rp.bodyScale || 1.0,
      headScale: rp.headScale || 1.0,
      limbThickness: rp.limbThickness || 1.0,
      serpentineAmp: (rp.serpentineAmp || 1.5),
      serpentineFreq: rp.serpentineFreq || 0.3,
      serpentineSpeed: rp.serpentineSpeed || 0.2,
      fovAngle: rp.fovAngle || 60,
      fovClearDist: rp.fovClearDist || 220,
      fovMaxDist: rp.fovMaxDist || 360,
      bodyHue: seed.bodyHue != null ? seed.bodyHue : 120,
      bodyLightness: seed.bodyLightness != null ? seed.bodyLightness : 30,
      colorSaturation: rp.colorSaturation || 1.0,
      patternComplexity: rp.patternComplexity || 2,
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
      prevHead: null, headSpeed: 0,
      headReady: false, headAngle: 0, moveAngle: null,
      lookOffset: 0, lookTarget: 0, lookSpeed: 0.03, lookHold: 0,
      spine: [], legs: []
    };
    this._buildSpine(this.params.spineNodes);
    this._buildLegs();
    this._colors = this._makeColors();
    this._bindPointer();
  }

  /* 让画布的绘制缓冲匹配 CSS 像素尺寸（支持全屏 + 高 DPR 清晰度）。 */
  TeachingRenderer.prototype.resize = function () {
    var c = this.canvas;
    var cssW = c.clientWidth || c.width || 960;
    var cssH = c.clientHeight || c.height || 560;
    var dpr = (root.devicePixelRatio || 1);
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    this._w = cssW; this._h = cssH;
    if (this.ctx && this.ctx.setTransform) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  TeachingRenderer.prototype._lerp = function (a, b, t) { return a + (b - a) * t; };

  // 第5步（体型曲线）起即视为已上色：用绿色皮肤而非灰色骨架色
  TeachingRenderer.prototype._colored = function () {
    return this.features.skin || this.features.bodyCurve;
  };

  TeachingRenderer.prototype._buildSpine = function (count) {
    count = Math.max(1, count | 0);
    var spine = [], cx = this._w * 0.5, cy = this._h * 0.5, seg = this.params.segmentLength;
    for (var i = 0; i < count; i++) spine.push({ x: cx - i * seg, y: cy });
    this.state.spine = spine;
  };

  TeachingRenderer.prototype._buildLegs = function () {
    var n = this.state.spine.length;
    function idx(f) { return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))); }
    // pairId 0 = 前肢, 1 = 后肢; gaitGroup 对角分组（0/1 交替迈步）
    this.state.legs = [
      { hip: idx(0.20), side: 1, pairId: 0, gaitGroup: 0, foot: null, plant: null, stepping: false, footAngle: undefined },
      { hip: idx(0.20), side: -1, pairId: 0, gaitGroup: 1, foot: null, plant: null, stepping: false, footAngle: undefined },
      { hip: idx(0.48), side: 1, pairId: 1, gaitGroup: 1, foot: null, plant: null, stepping: false, footAngle: undefined },
      { hip: idx(0.48), side: -1, pairId: 1, gaitGroup: 0, foot: null, plant: null, stepping: false, footAngle: undefined }
    ];
  };

  TeachingRenderer.prototype._makeColors = function () {
    var s = Math.round(55 * this.params.colorSaturation);
    var h = this.params.bodyHue, l = this.params.bodyLightness;
    return {
      body: 'hsl(' + h + ',' + s + '%,' + l + '%)',
      belly: 'hsl(' + h + ',' + s + '%,' + Math.min(80, l + 18) + '%)',
      outline: 'hsl(' + h + ',' + s + '%,' + Math.max(8, l - 16) + '%)',
      pattern: 'hsla(' + this.params.patternHue + ',' + s + '%,' + Math.max(12, l - 8) + '%,0.55)'
    };
  };

  TeachingRenderer.prototype.applyStage = function (cfg) {
    cfg = cfg || {};
    this.features = Object.assign({}, DEFAULT_FEATURES, cfg.features || {});
    var want = cfg.spineNodes || this.params.spineNodes;
    if (!this.state.spine.length || this.state.spine.length !== want) {
      this._buildSpine(want);
      this.params.spineNodes = want;
    }
    this.state.serpentinePhase = 0;
    this.state.gaitPhase = 0;
    this.state.battleTimer = 0;
    this.state.fx = null;
    this.state.prevHead = null;
    this.state.headSpeed = 0;
    this.state.headReady = false;
    this.state.moveAngle = null;
    this.state.lookOffset = 0;
    this.state.lookHold = 0;
    this.reset();
    return this;
  };

  TeachingRenderer.prototype.reset = function () {
    var sp = this.state.spine, seg = this.params.segmentLength;
    var hx = sp[0] ? sp[0].x : this._w * 0.5, hy = sp[0] ? sp[0].y : this._h * 0.5;
    for (var i = 0; i < sp.length; i++) { sp[i].x = hx - i * seg; sp[i].y = hy; }
    this.state.prevHead = null;
    this._buildLegs();
  };

  TeachingRenderer.prototype.setParams = function (p) {
    if (!p) return;
    var rebuild = (p.spineNodes != null && (p.spineNodes | 0) !== this.state.spine.length);
    Object.assign(this.params, p);
    if (rebuild) { this._buildSpine(this.params.spineNodes); this.reset(); }
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
      var px = head.x, py = head.y;
      var dx = s.target.x - head.x, dy = s.target.y - head.y, d = Math.hypot(dx, dy);
      var maxStep = 4.2 * SCALE * (this.features.battle && s.fx ? 1.8 : 1);
      if (d > 1) { var step = Math.min(maxStep, d * 0.12); head.x += dx / d * step; head.y += dy / d * step; }
      // 头部本帧实际位移 = 运动速度（驱动步态频率与蛇形波幅）
      s.headSpeed = Math.hypot(head.x - px, head.y - py);
      if (s.headSpeed > 0.5) s.moveAngle = Math.atan2(head.y - py, head.x - px);

      // FK：身体跟随头部
      for (var i = 1; i < sp.length; i++) {
        var ax = sp[i].x - sp[i - 1].x, ay = sp[i].y - sp[i - 1].y, al = Math.hypot(ax, ay) || 1;
        var seg = M.segmentLengthAt(i - 1, sp.length, p.segmentLength);
        sp[i].x = sp[i - 1].x + ax / al * seg;
        sp[i].y = sp[i - 1].y + ay / al * seg;
      }

      // 蛇形波（参考 lizard-renderer.js 的 _updateSpine）：
      //  · 相位随“运动距离”推进 → 停止时相位不动、身体不抖；
      //  · 幅度随速度 moveRatio 缩放 → 静止时无波，移动越快波越明显；
      //  · sin(phase·speed − i·freq) 随相位增大令波峰移向尾部 → 正弦波向后传递。
      if (this.features.serpentine) {
        s.serpentinePhase += s.headSpeed * 0.12;
        var maxHeadSpeed = 4.2 * SCALE;
        var moveRatio = Math.min(1, s.headSpeed / (maxHeadSpeed * 0.3));
        if (moveRatio > 0.01) {
          for (var w = 3; w < sp.length; w++) {
            var pv = sp[w - 1], cu = sp[w];
            var segAngle = Math.atan2(pv.y - cu.y, pv.x - cu.x);
            var perpX = -Math.sin(segAngle), perpY = Math.cos(segAngle);
            var tt = w / (sp.length - 1);
            var ampRamp = Math.max(0, Math.min(1, (tt - 0.12) / 0.15));
            var tailBoost = 1 + tt * 0.8;
            var amp = p.serpentineAmp * ampRamp * tailBoost * moveRatio;
            var wave = Math.sin(s.serpentinePhase * p.serpentineSpeed - w * p.serpentineFreq);
            cu.x += perpX * wave * amp; cu.y += perpY * wave * amp;
          }
        }
      }

      // 角约束 + 段长再投影（平滑波形、维持节距），再自碰撞
      if (this.features.collision) {
        for (var iter = 0; iter < 3; iter++) {
          M.enforceAngleConstraint(sp, 0.5);
          for (var r = 1; r < sp.length; r++) {
            var rx = sp[r].x - sp[r - 1].x, ry = sp[r].y - sp[r - 1].y, rl = Math.hypot(rx, ry) || 1;
            var rseg = M.segmentLengthAt(r - 1, sp.length, p.segmentLength);
            sp[r].x = sp[r - 1].x + rx / rl * rseg;
            sp[r].y = sp[r - 1].y + ry / rl * rseg;
          }
        }
        M.resolveSelfCollision(sp, p.segmentLength * 0.7);
      }
    }
    if (this.features.headTurn) this._updateHead(dt);
    if (this.features.legs) this._updateLegs(dt);
  };

  // 头部独立转动（参考 lizard-renderer.js 的 _updateHeadTurn 与停留扫视 aiLook）：
  //  · 移动时头领先转向运动方向；
  //  · 停留时在最大转角范围内做随机缓动的左右扫视；
  //  · 视觉头角始终被钳制在相对身体方向的限定范围内。
  TeachingRenderer.prototype._updateHead = function (dt) {
    var s = this.state, sp = s.spine;
    if (sp.length < 3) { s.headAngle = 0; s.headReady = false; return; }
    var bodyAngle = Math.atan2(sp[0].y - sp[2].y, sp[0].x - sp[2].x);
    if (!s.headReady) { s.headAngle = bodyAngle; s.headReady = true; s.lookOffset = 0; s.lookHold = 0; }
    var limit = 85 * Math.PI / 180; // 最大头部转角（相对身体）
    var desired, speed;
    if (s.headSpeed > 0.8) {
      desired = (s.moveAngle != null) ? s.moveAngle : bodyAngle;
      s.lookOffset *= 0.9; s.lookHold = 0;
      speed = 0.34;
    } else {
      s.lookHold -= dt;
      if (s.lookHold <= 0) {
        var maxLook = Math.min(2.2, limit * 1.6);
        s.lookTarget = (rand() - 0.5) * maxLook;
        var rr = rand();
        s.lookSpeed = rr < 0.6 ? 0.02 + rr * 0.03 : rr < 0.85 ? 0.05 + (rr - 0.6) * 0.25 : 0.12 + (rr - 0.85) * 0.6;
        s.lookHold = Math.floor(25 + rand() * 80);
      }
      s.lookOffset += (s.lookTarget - s.lookOffset) * Math.min(0.5, s.lookSpeed * dt);
      desired = bodyAngle + s.lookOffset;
      speed = 0.22;
    }
    var off = M.angleDiff(desired, bodyAngle);
    if (off > limit) desired = bodyAngle + limit;
    else if (off < -limit) desired = bodyAngle - limit;
    s.headAngle += M.angleDiff(desired, s.headAngle) * Math.min(1, speed * dt);
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

  /* ── 腿/脚 IK（参考 lizard-renderer.js 的步态实现，避免快速移动时拖脚） ── */

  TeachingRenderer.prototype._legLen = function () {
    // 第8步（皮肤）起，四肢所有关节段长度加倍
    var mult = this.features.skin ? 2 : 1;
    return { L1: this.params.segmentLength * 0.9 * mult, L2: this.params.segmentLength * 0.8 * mult };
  };

  TeachingRenderer.prototype._legReach = function () {
    var ll = this._legLen();
    return (ll.L1 + ll.L2) * 0.8;
  };

  // 髋部锚点 + 体轴方向（dir 指向头部）+ 侧向法线 perp
  TeachingRenderer.prototype._legHip = function (leg) {
    var sp = this.state.spine;
    var i = Math.max(0, Math.min(sp.length - 1, leg.hip));
    var node = sp[i];
    var prev = sp[Math.max(0, i - 1)], next = sp[Math.min(sp.length - 1, i + 1)];
    var dir = Math.atan2(prev.y - next.y, prev.x - next.x);
    var perp = dir + Math.PI / 2 * leg.side;
    var t = sp.length > 1 ? i / (sp.length - 1) : 0;
    var base = 14 * SCALE * this.params.bodyScale;
    var hw = this.features.bodyCurve ? M.bodyHalfWidthAt(t, base) : base * 0.55;
    return { x: node.x + Math.cos(perp) * hw, y: node.y + Math.sin(perp) * hw, dir: dir, perp: perp };
  };

  // 落脚目标：髋 + 侧向 + 沿体轴前后（strideSign 控制前伸/后蹬）
  TeachingRenderer.prototype._legStride = function (leg, hip, strideSign) {
    var reach = this._legReach();
    var forwardBase = leg.pairId === 0 ? 0.62 : -0.42;
    var forwardAmp = leg.pairId === 0 ? 0.42 : 0.34;
    var lateral = leg.pairId === 0 ? 0.42 : 0.50;
    var along = forwardBase + forwardAmp * strideSign;
    return {
      x: hip.x + Math.cos(hip.perp) * reach * lateral + Math.cos(hip.dir) * reach * along,
      y: hip.y + Math.sin(hip.perp) * reach * lateral + Math.sin(hip.dir) * reach * along
    };
  };

  TeachingRenderer.prototype._clampFoot = function (hip, foot, maxReach) {
    var dx = foot.x - hip.x, dy = foot.y - hip.y, d = Math.hypot(dx, dy);
    if (d <= maxReach || d < 0.001) return { x: foot.x, y: foot.y };
    return { x: hip.x + dx / d * maxReach, y: hip.y + dy / d * maxReach };
  };

  TeachingRenderer.prototype._updateLegs = function (dt) {
    var s = this.state, legs = s.legs;
    var reach = this._legReach();
    var moving = s.headSpeed > 0.8;
    if (!moving) {
      for (var i0 = 0; i0 < legs.length; i0++) {
        var lg = legs[i0], hp = this._legHip(lg);
        var rest = this._legStride(lg, hp, 0);
        if (!lg.foot) lg.foot = { x: rest.x, y: rest.y };
        lg.foot.x += (rest.x - lg.foot.x) * 0.16;
        lg.foot.y += (rest.y - lg.foot.y) * 0.16;
        lg.plant = { x: lg.foot.x, y: lg.foot.y };
        lg.stepping = false;
      }
      return;
    }
    var stance = 0.62;
    var strideDist = Math.max(1, reach * 0.42 * 2);
    var phaseDelta = s.headSpeed * stance / strideDist;
    s.gaitPhase = ((s.gaitPhase || 0) + Math.max(0.012, Math.min(0.075, phaseDelta))) % 1;
    for (var k = 0; k < legs.length; k++) {
      var leg = legs[k], hip = this._legHip(leg);
      var phase = (s.gaitPhase + (leg.gaitGroup === 1 ? 0.5 : 0)) % 1;
      if (!leg.foot) leg.foot = { x: hip.x, y: hip.y };
      if (!leg.plant) leg.plant = { x: leg.foot.x, y: leg.foot.y };
      if (phase < stance) {
        var stanceT = phase / stance;
        var rest2 = this._legStride(leg, hip, this._lerp(0.55, -0.35, stanceT));
        leg.stepping = false;
        leg.foot.x = leg.plant.x + (rest2.x - leg.plant.x) * 0.08;
        leg.foot.y = leg.plant.y + (rest2.y - leg.plant.y) * 0.08;
        var c = this._clampFoot(hip, leg.foot, reach * 1.05);
        leg.foot.x = c.x; leg.foot.y = c.y;
      } else {
        var swingT = (phase - stance) / (1 - stance);
        var ease = swingT * swingT * (3 - 2 * swingT);
        var tgt = this._legStride(leg, hip, this._lerp(-1, 1, ease));
        tgt.y -= Math.sin(swingT * Math.PI) * 7 * SCALE;
        leg.stepping = true;
        leg.foot.x += (tgt.x - leg.foot.x) * 0.88;
        leg.foot.y += (tgt.y - leg.foot.y) * 0.88;
        if (swingT > 0.88) leg.plant = { x: leg.foot.x, y: leg.foot.y };
      }
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
    var t = this.state.target, r = (8 + Math.sin(this.state.time * 0.15) * 3) * SCALE;
    ctx.strokeStyle = '#6cf'; ctx.lineWidth = SCALE;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    ctx.beginPath(); ctx.arc(t.x, t.y, 3 * SCALE, 0, Math.PI * 2); ctx.fill();
  };

  TeachingRenderer.prototype._drawSpineLine = function (ctx) {
    var sp = this.state.spine; if (!sp.length) return;
    ctx.strokeStyle = '#7fd1c0'; ctx.lineWidth = 1.5 * SCALE;
    ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y);
    for (var i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.stroke();
    ctx.fillStyle = '#bfeee0';
    for (var j = 0; j < sp.length; j++) { ctx.beginPath(); ctx.arc(sp[j].x, sp[j].y, 2.2 * SCALE, 0, Math.PI * 2); ctx.fill(); }
  };

  TeachingRenderer.prototype._halfWidths = function () {
    var sp = this.state.spine, p = this.params, base = 14 * SCALE * p.bodyScale, out = [];
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
    ctx.fillStyle = this._colored() ? this._colors.body : '#3a4a55'; ctx.fill();
    ctx.lineWidth = 1.5 * SCALE; ctx.strokeStyle = this._colored() ? this._colors.outline : '#22303a'; ctx.stroke();
  };

  TeachingRenderer.prototype._drawPattern = function (ctx) {
    var type = this.params.patternType;
    if (type === 'none') return;
    var sp = this.state.spine, hw = this._halfWidths();
    var step = Math.max(2, 4 - Math.round((this.params.patternComplexity || 1) / 2));
    ctx.fillStyle = this._colors.pattern;
    ctx.strokeStyle = this._colors.pattern;
    if (type === 'stripes') {
      ctx.lineWidth = 2 * SCALE;
      for (var i = 2; i < sp.length - 1; i += step) {
        var a = sp[i - 1], b = sp[i + 1];
        var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
        var nx = -ty / tl, ny = tx / tl, w = hw[i];
        ctx.beginPath();
        ctx.moveTo(sp[i].x - nx * w, sp[i].y - ny * w);
        ctx.lineTo(sp[i].x + nx * w, sp[i].y + ny * w);
        ctx.stroke();
      }
      return;
    }
    for (var j = 2; j < sp.length - 1; j += step) {
      var r = Math.max(2, hw[j] * 0.4);
      ctx.beginPath(); ctx.arc(sp[j].x, sp[j].y, r, 0, Math.PI * 2); ctx.fill();
    }
  };

  TeachingRenderer.prototype._drawHead = function (ctx) {
    var sp = this.state.spine, p = this.params, h = sp[0], n = sp[1] || h;
    var ang = (this.features.headTurn && this.state.headReady)
      ? this.state.headAngle
      : Math.atan2(h.y - n.y, h.x - n.x);
    var hs = 13 * SCALE * p.headScale * p.bodyScale;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
    ctx.fillStyle = this._colored() ? this._colors.body : '#46586a';
    ctx.beginPath(); ctx.ellipse(hs * 0.4, 0, hs, hs * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5 * SCALE; ctx.strokeStyle = this._colored() ? this._colors.outline : '#22303a'; ctx.stroke();
    ctx.fillStyle = '#10151c';
    ctx.beginPath(); ctx.arc(hs * 0.6, -hs * 0.35, 0.7 * SCALE, 0, Math.PI * 2);
    ctx.arc(hs * 0.6, hs * 0.35, 0.7 * SCALE, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // 由细到粗的填充四肢：髋宽 hipW、膝宽 kneeW、脚端 footW，二次曲线圆滑过膝。
  TeachingRenderer.prototype._drawSkinnedLeg = function (ctx, hip, knee, foot, hipW, kneeW, footW) {
    var a1 = Math.atan2(knee.y - hip.y, knee.x - hip.x);
    var a2 = Math.atan2(foot.y - knee.y, foot.x - knee.x);
    var p1 = a1 + Math.PI / 2, p2 = a2 + Math.PI / 2;
    var hu = hipW / 2, ku = kneeW / 2, fu = footW / 2;
    function path() {
      ctx.beginPath();
      ctx.moveTo(hip.x + Math.cos(p1) * hu, hip.y + Math.sin(p1) * hu);
      ctx.quadraticCurveTo(knee.x + Math.cos(p1) * ku, knee.y + Math.sin(p1) * ku,
        knee.x + Math.cos(p2) * ku, knee.y + Math.sin(p2) * ku);
      ctx.lineTo(foot.x + Math.cos(p2) * fu, foot.y + Math.sin(p2) * fu);
      ctx.lineTo(foot.x - Math.cos(p2) * fu, foot.y - Math.sin(p2) * fu);
      ctx.quadraticCurveTo(knee.x - Math.cos(p2) * ku, knee.y - Math.sin(p2) * ku,
        knee.x - Math.cos(p1) * ku, knee.y - Math.sin(p1) * ku);
      ctx.lineTo(hip.x - Math.cos(p1) * hu, hip.y - Math.sin(p1) * hu);
      ctx.closePath();
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path();
    ctx.fillStyle = this._colors.body; ctx.fill();
    ctx.lineWidth = 1.6 * SCALE; ctx.strokeStyle = this._colors.outline; ctx.stroke();
  };

  TeachingRenderer.prototype._drawLegs = function (ctx) {
    var p = this.params, legs = this.state.legs;
    var ll = this._legLen(), L1 = ll.L1, L2 = ll.L2;
    var skinned = this.features.skin; // 第8步起：腿覆盖同色皮肤、关节段加倍
    ctx.lineCap = 'round';
    for (var k = 0; k < legs.length; k++) {
      var leg = legs[k]; if (!leg.foot) continue;
      var hip = this._legHip(leg);
      var drawFoot = this._clampFoot(hip, leg.foot, (L1 + L2) * 0.98);
      var bendDir = leg.pairId === 0 ? leg.side : -leg.side;
      var ik = M.solveIK2Bone(hip, drawFoot, L1, L2, bendDir);
      if (skinned) {
        // 覆盖同色皮肤：填充一条由细到粗的四肢——大腿(髋)最粗、脚趾处最细，
        // 关节用二次曲线圆滑过渡（参考 lizard-renderer.js 的 _drawLegOutline）。
        var hipW = Math.max(4, 11 * SCALE * p.limbThickness);  // 大腿（最粗）
        var kneeW = Math.max(3, 7.5 * SCALE * p.limbThickness); // 膝
        var footW = Math.max(1.6, 3 * SCALE * p.limbThickness); // 脚趾端（最细）
        this._drawSkinnedLeg(ctx, hip, ik.knee, drawFoot, hipW, kneeW, footW);
      } else {
        // 骨架阶段（3–7步）：细线条 IK 骨骼，便于教学观察
        ctx.strokeStyle = this._colored() ? this._colors.body : '#6f8a99';
        ctx.lineWidth = Math.max(2, 3.2 * SCALE * p.limbThickness);
        ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(ik.knee.x, ik.knee.y); ctx.stroke();
        ctx.lineWidth = Math.max(1.5, 2.3 * SCALE * p.limbThickness);
        ctx.beginPath(); ctx.moveTo(ik.knee.x, ik.knee.y); ctx.lineTo(drawFoot.x, drawFoot.y); ctx.stroke();
      }
      this._drawFoot(ctx, drawFoot, hip, leg);
    }
  };

  // 明亮配色的脚/爪，平滑朝向，行走时清晰可见
  TeachingRenderer.prototype._drawFoot = function (ctx, foot, hip, leg) {
    var bright = '#ffe14d';
    var angle = Math.atan2(foot.y - hip.y, foot.x - hip.x);
    if (leg.footAngle === undefined) leg.footAngle = angle;
    leg.footAngle += M.angleDiff(angle, leg.footAngle) * 0.35;
    var a = leg.footAngle, toe = 5 * SCALE * this.params.limbThickness;
    ctx.save(); ctx.translate(foot.x, foot.y); ctx.rotate(a);
    ctx.strokeStyle = bright; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, 1.4 * SCALE * this.params.limbThickness);
    for (var t = -1; t <= 1; t++) {
      var spread = t * 0.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(spread) * toe, Math.sin(spread) * toe); ctx.stroke();
    }
    ctx.fillStyle = bright;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(2, 1.8 * SCALE), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  TeachingRenderer.prototype._drawSpikes = function (ctx) {
    var sp = this.state.spine;
    ctx.fillStyle = this._colored() ? this._colors.outline : '#2c3a44';
    for (var i = 1; i < sp.length - 1; i++) {
      var a = sp[i - 1], b = sp[i + 1];
      var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl;
      var t = i / (sp.length - 1), len = 7 * SCALE * (1 - Math.abs(0.4 - t));
      if (len < 1.5 * SCALE) continue;
      ctx.beginPath();
      ctx.moveTo(sp[i].x - nx * 2 * SCALE, sp[i].y - ny * 2 * SCALE);
      ctx.lineTo(sp[i].x + nx * len, sp[i].y + ny * len);
      ctx.lineTo(sp[i].x + nx * 2 * SCALE, sp[i].y + ny * 2 * SCALE);
      ctx.closePath(); ctx.fill();
    }
  };

  TeachingRenderer.prototype._drawVision = function (ctx) {
    var sp = this.state.spine; if (!sp.length) return;
    var h = sp[0], n = sp[1] || h, p = this.params;
    var ang = (this.features.headTurn && this.state.headReady)
      ? this.state.headAngle
      : Math.atan2(h.y - n.y, h.x - n.x);
    var half = (p.fovAngle * Math.PI / 180) / 2;
    var coneScale = 0.5 * 1.7 * 2; // 视线范围加大一倍
    // 外圈（警觉区）+ 内圈（清晰区），配色与 lizard-renderer.js 一致（绿色）
    ctx.save();
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    ctx.arc(h.x, h.y, p.fovMaxDist * coneScale, ang - half, ang + half); ctx.closePath();
    ctx.fillStyle = 'rgba(30,80,30,0.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(30,80,30,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    ctx.arc(h.x, h.y, p.fovClearDist * coneScale, ang - half, ang + half); ctx.closePath();
    ctx.fillStyle = 'rgba(100,220,100,0.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(100,220,100,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    if (!this.state.dots) {
      this.state.dots = [];
      for (var i = 0; i < 6; i++) this.state.dots.push({ x: rand() * this._w, y: rand() * this._h });
    }
    ctx.fillStyle = '#ffe08a';
    for (var d = 0; d < this.state.dots.length; d++) {
      var dot = this.state.dots[d];
      ctx.beginPath(); ctx.arc(dot.x, dot.y, 2.4 * SCALE, 0, Math.PI * 2); ctx.fill();
    }
  };

  TeachingRenderer.prototype._drawFx = function (ctx) {
    var h = this.state.spine[0], fx = this.state.fx, prog = fx.t / fx.dur;
    ctx.strokeStyle = 'rgba(255,210,90,' + prog + ')'; ctx.lineWidth = 1.5 * SCALE;
    ctx.beginPath(); ctx.arc(h.x, h.y, 16 * SCALE * (1 - prog + 0.2), 0, Math.PI * 2); ctx.stroke();
  };

  TeachingRenderer.prototype._drawHint = function (ctx) {
    ctx.fillStyle = 'rgba(180,200,220,0.4)'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('按住并拖动可牵引', this._w / 2, this._h - 14);
    ctx.textAlign = 'left';
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
