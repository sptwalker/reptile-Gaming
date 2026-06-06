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
      this.params.spineNodes = want;
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
