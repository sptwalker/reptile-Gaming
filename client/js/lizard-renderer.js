/**
 * LizardRenderer - Lizard renderer module
 * Extracted from game.html for reuse in main game UI
 * Supports render_params from server for per-pet appearance customization
 */
"use strict";

class LizardRenderer {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.SPINE_NODE_COUNT = 22;
    /* --- 基准参数（基于 1920×1080 全屏原型） --- */
    this._BASE_REF_W = 1200;
    this._BASE_SEGMENT_LENGTH = opts.segmentLength || 18;
    this._BASE_MAX_SPEED = opts.maxSpeed || 10;
    this._BASE_LEG_LENGTH1 = opts.legLength1 || 38;
    this._BASE_LEG_LENGTH2 = opts.legLength2 || 34;
    this._BASE_STEP_DISTANCE = opts.stepDistance || 50;
    this._BASE_FOV_CLEAR_DIST = opts.fovClearDist || 300;
    this._BASE_FOV_MAX_DIST = opts.fovMaxDist || 500;
    this._BASE_COLLISION_MARGIN = 6;
    this._BASE_LIGHT_DOT_RADIUS = 6;
    /* 初始值（_applyScale 会根据 Canvas 尺寸覆盖） */
    this.SEGMENT_LENGTH = this._BASE_SEGMENT_LENGTH;
    this.MAX_SPEED = this._BASE_MAX_SPEED;
    this.LEG_LENGTH1 = this._BASE_LEG_LENGTH1;
    this.LEG_LENGTH2 = this._BASE_LEG_LENGTH2;
    this.STEP_DISTANCE = this._BASE_STEP_DISTANCE;
    this.STEP_SPEED = opts.stepSpeed || 0.18;
    this.SERPENTINE_AMP = opts.serpentineAmp || 1.5;
    this.SERPENTINE_FREQ = opts.serpentineFreq || 0.3;
    this.SERPENTINE_SPEED = opts.serpentineSpeed || 0.2;
    this.FOV_ANGLE = opts.fovAngle || 60;
    this.FOV_CLEAR_DIST = this._BASE_FOV_CLEAR_DIST;
    this.FOV_MAX_DIST = this._BASE_FOV_MAX_DIST;
    this.ALERT_SPEED = opts.alertSpeed || 2.5;
    this.COLLISION_MARGIN = this._BASE_COLLISION_MARGIN;
    this.HEAD_SKIP_NODES = 4;
    this.STEER_STRENGTH = 0.85;
    /* render_params from server (RB-1/RB-2/RB-5) */
    this._bodyScale = 1.0;
    this._headScale = 1.0;
    this._colorSaturation = 1.0;
    this._patternComplexity = 1;
    this._bodySeed = null;
    /* 弯折约束（弧度）— DEVLOG v0.7 原始紧凑值 */
    this.BEND_NECK = 0.455;
    this.BEND_SHOULDER = 0.286;
    this.BEND_TORSO = 0.234;
    this.BEND_HIP = 0.286;
    this.BEND_TAIL = 0.52;
    this.MAX_LIGHT_DOTS = 20;
    this.LIGHT_DOT_RADIUS = 6;
    this.LIGHT_DOT_SPEED = 0.4;
    this.CHASE_SPEED_MULT = 1.8;
    this.spine = [];
    this.legs = [
      {spineIndex:5,side:1,pairId:0,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0},
      {spineIndex:5,side:-1,pairId:0,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0},
      {spineIndex:11,side:1,pairId:1,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0},
      {spineIndex:11,side:-1,pairId:1,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0}
    ];
    this.lightDots = [];
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false; this.mouseDragStart = null;
    this.serpentinePhase = 0; this.headSpeed = 0;
    this.prevHeadX = 0; this.prevHeadY = 0;
    this.lookOffsets = [];
    this.aiActive = false; this.aiWanderAngle = 0;
    this.aiTurnTimer = 0; this.aiSpeedRamp = 1;
    this.aiPauseTimer = 0; this.aiPauseCooldown = 0;
    this.aiPauseDone = 0; this.aiWillLook = false;
    this.aiLookBaseAngle = 0; this.aiLookOffset = 0;
    this.aiLookTarget = 0; this.aiLookSpeed = 0;
    this.aiLookHoldTimer = 0;
    this.aiAlertTarget = null; this.aiAlertTimer = 0;
    this.activity = opts.activity || 5;
    this._rafId = null;
    this._boundRender = this._loop.bind(this);
    this._boundVisibility = this._onVisibility.bind(this);
    this._boundResize = this._resize.bind(this);
    this._evH = {};
    this._w = 0; this._h = 0;
    this._initCanvas();
    this._initSpine();
    this._initLegs();
    this._bindEvents();
  }

  start() {
    if (!this._rafId) this._rafId = requestAnimationFrame(this._boundRender);
    document.addEventListener("visibilitychange", this._boundVisibility);
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    document.removeEventListener("visibilitychange", this._boundVisibility);
    this._removeCanvasEvents();
  }

  setActivity(v) { this.activity = Math.max(1, Math.min(10, v)); }

  toggleAI(force) {
    this.aiActive = force !== undefined ? !!force : !this.aiActive;
    if (this.aiActive) {
      this.aiWanderAngle = Math.atan2(this.spine[0].y - this.spine[2].y, this.spine[0].x - this.spine[2].x);
    } else {
      this.aiPauseTimer = 0; this.aiPauseDone = 0; this.aiWillLook = false;
      this.aiLookOffset = 0; this.aiLookTarget = 0; this.aiLookHoldTimer = 0;
      this.aiAlertTarget = null; this.aiAlertTimer = 0;
    }
  }

  /**
   * 应用服务端渲染参数 (RB-1/RB-2/RB-5)
   * @param {object} renderParams  来自 /api/pet/detail 的 render_params
   * @param {object} [bodySeed]    来自 /api/pet/detail 的 body_seed
   */
  applyRenderParams(renderParams, bodySeed) {
    if (!renderParams) return;
    /* bodyWidth / headScale / colorSaturation 本身就是倍率，直接赋值 */
    if (renderParams.bodyWidth)         this._bodyScale = renderParams.bodyWidth;
    if (renderParams.headScale)         this._headScale = renderParams.headScale;
    if (renderParams.colorSaturation)   this._colorSaturation = renderParams.colorSaturation;
    if (renderParams.patternComplexity) this._patternComplexity = renderParams.patternComplexity;
    /* 以下参数服务端返回的是倍率，需要乘以基准值再乘以缩放因子 */
    var sf = this._scaleFactor || 1;
    if (renderParams.moveSpeed)         this.MAX_SPEED = this._BASE_MAX_SPEED * renderParams.moveSpeed * sf;
    if (renderParams.legFrequency)      this.STEP_SPEED = 0.18 * renderParams.legFrequency;
    if (renderParams.segmentWidth)      this.SEGMENT_LENGTH = this._BASE_SEGMENT_LENGTH * renderParams.segmentWidth * sf;
    if (renderParams.fovAngle)          this.FOV_ANGLE = 60 * renderParams.fovAngle;
    if (renderParams.fovDistance)        this.FOV_MAX_DIST = this._BASE_FOV_MAX_DIST * renderParams.fovDistance * sf;
    if (bodySeed) this._bodySeed = bodySeed;
    this._skinColors = this._generateSkinColors();
  }

  /** 基于 colorSaturation + bodySeed 生成皮肤色系 (RB-5) */
  _generateSkinColors() {
    var seed = this._bodySeed || {};
    var hueBase = seed.hue != null ? seed.hue : 110;
    var sat = Math.min(100, Math.round(35 * this._colorSaturation));
    var light = seed.lightness != null ? seed.lightness : 32;
    return {
      bodyTop:    "hsl(" + hueBase + "," + sat + "%," + (light + 8) + "%)",
      bodyMid:    "hsl(" + hueBase + "," + sat + "%," + light + "%)",
      bodyBottom: "hsl(" + hueBase + "," + sat + "%," + (light - 8) + "%)",
      head:       "hsl(" + hueBase + "," + Math.round(sat * 0.9) + "%," + (light + 4) + "%)",
      leg:        "hsl(" + hueBase + "," + sat + "%," + (light - 2) + "%)",
      outline:    "hsl(" + hueBase + "," + sat + "%," + (light - 12) + "%)",
      stripe:     "hsla(" + hueBase + "," + Math.round(sat * 0.6) + "%," + (light + 18) + "%,0.25)",
      dot:        "hsla(" + hueBase + "," + sat + "%," + (light - 14) + "%,0.5)"
    };
  }

  destroy() {
    this.stop();
    this._removeCanvasEvents();
  }

  _removeCanvasEvents() {
    var c = this.canvas, h = this._evH;
    if (h.m) c.removeEventListener("mousemove", h.m);
    if (h.d) c.removeEventListener("mousedown", h.d);
    if (h.u) c.removeEventListener("mouseup", h.u);
    if (h.l) c.removeEventListener("mouseleave", h.l);
    window.removeEventListener("resize", this._boundResize);
  }

  _initCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width; this._h = rect.height;
    this._applyScale();
    window.addEventListener("resize", this._boundResize);
  }

  _resize() {
    var dpr = window.devicePixelRatio || 1;
    var rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width; this._h = rect.height;
    this._applyScale();
  }

  /** 根据 Canvas 实际宽度与基准宽度的比值缩放所有像素参数 */
  _applyScale() {
    var s = Math.max(0.35, Math.min(1, this._w / this._BASE_REF_W));
    this._scaleFactor = s;
    this.SEGMENT_LENGTH = this._BASE_SEGMENT_LENGTH * s;
    this.MAX_SPEED = this._BASE_MAX_SPEED * s;
    this.LEG_LENGTH1 = this._BASE_LEG_LENGTH1 * s;
    this.LEG_LENGTH2 = this._BASE_LEG_LENGTH2 * s;
    this.STEP_DISTANCE = this._BASE_STEP_DISTANCE * s;
    this.FOV_CLEAR_DIST = this._BASE_FOV_CLEAR_DIST * s;
    this.FOV_MAX_DIST = this._BASE_FOV_MAX_DIST * s;
    this.COLLISION_MARGIN = this._BASE_COLLISION_MARGIN * s;
    this.LIGHT_DOT_RADIUS = this._BASE_LIGHT_DOT_RADIUS * s;
  }

  _initSpine() {
    this.spine = [];
    for (var i = 0; i < this.SPINE_NODE_COUNT; i++) {
      this.spine.push({x: this._w / 2 - i * this.SEGMENT_LENGTH, y: this._h / 2});
    }
    this.prevHeadX = this.spine[0].x; this.prevHeadY = this.spine[0].y;
    this.mouseX = this._w / 2; this.mouseY = this._h / 2;
  }

  _initLegs() {
    var self = this;
    this.legs.forEach(function(leg) {
      var hip = self._getHip(leg);
      leg.target.x = hip.x; leg.target.y = hip.y;
      leg.foot.x = hip.x; leg.foot.y = hip.y;
    });
  }

  _bindEvents() {
    var self = this, c = this.canvas;
    this._evH.m = function(e) {
      var r = c.getBoundingClientRect();
      self.mouseX = e.clientX - r.left; self.mouseY = e.clientY - r.top;
    };
    this._evH.d = function(e) {
      if (e.button === 0) {
        self.mouseDown = true;
        var r = c.getBoundingClientRect();
        self.mouseDragStart = {x: e.clientX - r.left, y: e.clientY - r.top, time: Date.now()};
      }
    };
    this._evH.u = function(e) {
      if (e.button === 0) {
        self.mouseDown = false;
        if (self.mouseDragStart) {
          var r = c.getBoundingClientRect();
          var ux = e.clientX - r.left, uy = e.clientY - r.top;
          var dd = Math.hypot(ux - self.mouseDragStart.x, uy - self.mouseDragStart.y);
          var dt = Date.now() - self.mouseDragStart.time;
          if (dd < 10 && dt < 300 && self.lightDots.length < self.MAX_LIGHT_DOTS) {
            self.lightDots.push({x:ux,y:uy,vx:(Math.random()-0.5)*self.LIGHT_DOT_SPEED*2,vy:(Math.random()-0.5)*self.LIGHT_DOT_SPEED*2,phase:Math.random()*Math.PI*2});
          }
          self.mouseDragStart = null;
        }
      }
    };
    this._evH.l = function() { self.mouseDown = false; self.mouseDragStart = null; };
    c.addEventListener("mousemove", this._evH.m);
    c.addEventListener("mousedown", this._evH.d);
    c.addEventListener("mouseup", this._evH.u);
    c.addEventListener("mouseleave", this._evH.l);
  }

  _onVisibility() {
    if (document.hidden) { if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; } }
    else { if (!this._rafId) this._rafId = requestAnimationFrame(this._boundRender); }
  }

  _loop() { this._render(); this._rafId = requestAnimationFrame(this._boundRender); }

  _lerp(a, b, t) { return a + (b - a) * t; }

  _angleDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _bodyWidthAt(i) {
    var n = this.SPINE_NODE_COUNT - 1, t = i / n, s = this._bodyScale, sc = this._scaleFactor || 1, w;
    if (t < 0.05) w = this._lerp(10, 14, t / 0.05);
    else if (t < 0.12) w = this._lerp(14, 18, (t - 0.05) / 0.07);
    else if (t < 0.18) w = this._lerp(18, 10, (t - 0.12) / 0.06);
    else if (t < 0.28) w = this._lerp(10, 16, (t - 0.18) / 0.10);
    else if (t < 0.38) w = this._lerp(16, 14, (t - 0.28) / 0.10);
    else if (t < 0.50) w = this._lerp(14, 15, (t - 0.38) / 0.12);
    else if (t < 0.60) w = this._lerp(15, 12, (t - 0.50) / 0.10);
    else w = this._lerp(12, 1, (t - 0.60) / 0.40);
    return w * s * sc;
  }

  _spineAngleAt(idx) {
    var prev = this.spine[Math.max(0, idx - 1)];
    var next = this.spine[Math.min(this.spine.length - 1, idx + 1)];
    return Math.atan2(prev.y - next.y, prev.x - next.x);
  }

  _getHip(leg) {
    var node = this.spine[leg.spineIndex];
    var angle = this._spineAngleAt(leg.spineIndex);
    var perp = angle + Math.PI / 2 * leg.side;
    var w = this._bodyWidthAt(leg.spineIndex);
    return {x: node.x + Math.cos(perp) * w, y: node.y + Math.sin(perp) * w};
  }

  _getHeadAngle() {
    return Math.atan2(this.spine[0].y - this.spine[2].y, this.spine[0].x - this.spine[2].x);
  }

  _maxBendAngleAt(i) {
    var t = i / (this.SPINE_NODE_COUNT - 1);
    if (t < 0.15) return this.BEND_NECK;
    if (t < 0.30) return this.BEND_SHOULDER;
    if (t < 0.55) return this.BEND_TORSO;
    if (t < 0.65) return this.BEND_HIP;
    return this.BEND_TAIL;
  }

  _segmentIntersectsCircle(p1x, p1y, p2x, p2y, cx, cy, r) {
    var ex = p2x - p1x, ey = p2y - p1y;
    var fx = p1x - cx, fy = p1y - cy;
    var a = ex * ex + ey * ey;
    var b = 2 * (fx * ex + fy * ey);
    var c = fx * fx + fy * fy - r * r;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    var t1 = (-b - disc) / (2 * a);
    var t2 = (-b + disc) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
  }

  _computeAvoidanceDir(head, targetX, targetY) {
    var dx = targetX - head.x, dy = targetY - head.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 1) return {x: 0, y: 0, blocked: false};
    var dirX = dx / dist, dirY = dy / dist;
    var lookAhead = Math.min(dist, this.MAX_SPEED * 4);
    var aheadX = head.x + dirX * lookAhead, aheadY = head.y + dirY * lookAhead;
    var blocked = false, bestSteerX = 0, bestSteerY = 0, closestBlockDist = Infinity;
    for (var i = this.HEAD_SKIP_NODES; i < this.spine.length - 3; i++) {
      var node = this.spine[i], r = this._bodyWidthAt(i) + this.COLLISION_MARGIN;
      if (this._segmentIntersectsCircle(head.x, head.y, aheadX, aheadY, node.x, node.y, r)) {
        var dToNode = Math.hypot(node.x - head.x, node.y - head.y);
        if (dToNode < closestBlockDist) {
          closestBlockDist = dToNode; blocked = true;
          var toNodeX = node.x - head.x, toNodeY = node.y - head.y;
          var toNodeDist = Math.hypot(toNodeX, toNodeY) || 1;
          var perpLX = -toNodeY / toNodeDist, perpLY = toNodeX / toNodeDist;
          var perpRX = toNodeY / toNodeDist, perpRY = -toNodeX / toNodeDist;
          var dotL = perpLX * dirX + perpLY * dirY;
          var dotR = perpRX * dirX + perpRY * dirY;
          if (dotL >= dotR) { bestSteerX = perpLX; bestSteerY = perpLY; }
          else { bestSteerX = perpRX; bestSteerY = perpRY; }
        }
      }
    }
    if (blocked) {
      var blendX = dirX * (1 - this.STEER_STRENGTH) + bestSteerX * this.STEER_STRENGTH;
      var blendY = dirY * (1 - this.STEER_STRENGTH) + bestSteerY * this.STEER_STRENGTH;
      var blendDist = Math.hypot(blendX, blendY) || 1;
      return {x: blendX / blendDist, y: blendY / blendDist, blocked: true};
    }
    return {x: dirX, y: dirY, blocked: false};
  }

  _resolveBodyCollisions() {
    for (var i = 0; i < this.spine.length; i++) {
      var ri = this._bodyWidthAt(i);
      for (var j = i + 3; j < this.spine.length; j++) {
        var rj = this._bodyWidthAt(j);
        var minDist = (ri + rj) * 0.7;
        var dx = this.spine[j].x - this.spine[i].x;
        var dy = this.spine[j].y - this.spine[i].y;
        var dist = Math.hypot(dx, dy);
        if (dist < minDist && dist > 0.1) {
          var overlap = (minDist - dist) * 0.3;
          var nx = dx / dist, ny = dy / dist;
          this.spine[j].x += nx * overlap; this.spine[j].y += ny * overlap;
        }
      }
    }
  }

  _enforceAngleConstraints() {
    for (var i = 1; i < this.spine.length - 1; i++) {
      var prev = this.spine[i - 1], curr = this.spine[i], next = this.spine[i + 1];
      var anglePrev = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      var angleCurr = Math.atan2(next.y - curr.y, next.x - curr.x);
      var bend = this._angleDiff(anglePrev, angleCurr);
      var maxBend = this._maxBendAngleAt(i);
      if (Math.abs(bend) > maxBend) {
        var clampedBend = Math.sign(bend) * maxBend;
        var newAngle = anglePrev + clampedBend;
        next.x = curr.x + Math.cos(newAngle) * this.SEGMENT_LENGTH;
        next.y = curr.y + Math.sin(newAngle) * this.SEGMENT_LENGTH;
      }
    }
  }

  _updateLightDots() {
    for (var i = this.lightDots.length - 1; i >= 0; i--) {
      var dot = this.lightDots[i];
      dot.phase += 0.03;
      dot.vx += (Math.random() - 0.5) * 0.08;
      dot.vy += (Math.random() - 0.5) * 0.08;
      var spd = Math.hypot(dot.vx, dot.vy);
      if (spd > this.LIGHT_DOT_SPEED) {
        dot.vx = (dot.vx / spd) * this.LIGHT_DOT_SPEED;
        dot.vy = (dot.vy / spd) * this.LIGHT_DOT_SPEED;
      }
      dot.x += dot.vx; dot.y += dot.vy;
      if (dot.x < 20 || dot.x > this._w - 20) dot.vx *= -1;
      if (dot.y < 20 || dot.y > this._h - 20) dot.vy *= -1;
      dot.x = Math.max(10, Math.min(this._w - 10, dot.x));
      dot.y = Math.max(10, Math.min(this._h - 10, dot.y));
      var hd = Math.hypot(dot.x - this.spine[0].x, dot.y - this.spine[0].y);
      if (hd < this._bodyWidthAt(0) + this.LIGHT_DOT_RADIUS + 5) {
        this.lightDots.splice(i, 1);
      }
    }
  }

  _drawLightDots() {
    var ctx = this.ctx;
    for (var i = 0; i < this.lightDots.length; i++) {
      var dot = this.lightDots[i];
      var pulse = 0.6 + 0.4 * Math.sin(dot.phase * 4);
      var r = this.LIGHT_DOT_RADIUS * pulse;
      var glow = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, r * 4);
      glow.addColorStop(0, "rgba(255,220,100,0.5)");
      glow.addColorStop(0.5, "rgba(255,180,50,0.15)");
      glow.addColorStop(1, "rgba(255,150,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(dot.x, dot.y, r * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,240,180," + (0.7 + 0.3 * pulse) + ")";
      ctx.beginPath(); ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  _dotInFOV(dot, head) {
    var dx = dot.x - head.x, dy = dot.y - head.y;
    var dist = Math.hypot(dx, dy);
    if (dist > this.FOV_MAX_DIST) return null;
    var headAngle = this._getHeadAngle();
    var dotAngle = Math.atan2(dy, dx);
    var diff = dotAngle - headAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    var halfFOV = (this.FOV_ANGLE / 2) * Math.PI / 180;
    if (Math.abs(diff) > halfFOV) return null;
    return dist <= this.FOV_CLEAR_DIST ? "clear" : "alert";
  }

  _findNearestDotInFOV(head) {
    var bestClear = null, bestClearDist = Infinity;
    var bestAlert = null, bestAlertDist = Infinity;
    for (var i = 0; i < this.lightDots.length; i++) {
      var dot = this.lightDots[i];
      var zone = this._dotInFOV(dot, head);
      if (!zone) continue;
      var d = Math.hypot(dot.x - head.x, dot.y - head.y);
      if (zone === "clear" && d < bestClearDist) { bestClearDist = d; bestClear = dot; }
      else if (zone === "alert" && d < bestAlertDist) { bestAlertDist = d; bestAlert = dot; }
    }
    if (bestClear) return {dot: bestClear, zone: "clear"};
    if (bestAlert) return {dot: bestAlert, zone: "alert"};
    return null;
  }

  _computeAITarget(head) {
    var activity = this.activity;
    var wanderSpeed = this.MAX_SPEED * (0.15 + activity * 0.06);
    var turnChance = 0.005 + activity * 0.004;
    var found = this._findNearestDotInFOV(head);
    if (found && found.zone === "clear") {
      this.aiPauseTimer = 0; this.aiAlertTarget = null; this.aiAlertTimer = 0;
      var dot = found.dot;
      var dx = dot.x - head.x, dy = dot.y - head.y, dist = Math.hypot(dx, dy);
      var chaseSpeed = Math.min(dist, this.MAX_SPEED * this.CHASE_SPEED_MULT);
      return {tx: head.x + (dx / dist) * chaseSpeed, ty: head.y + (dy / dist) * chaseSpeed, speed: chaseSpeed};
    }
    if (found && found.zone === "alert") {
      this.aiAlertTarget = found.dot; this.aiPauseTimer = 0;
      var dot2 = found.dot;
      var dx2 = dot2.x - head.x, dy2 = dot2.y - head.y, dist2 = Math.hypot(dx2, dy2);
      this.aiAlertTimer++;
      if (this.aiAlertTimer < 30) {
        var tAngle = Math.atan2(dy2, dx2);
        var diff = tAngle - this.aiWanderAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.aiWanderAngle += diff * 0.08;
        return {tx: head.x, ty: head.y, speed: 0};
      }
      var approachSpeed = Math.min(dist2, this.ALERT_SPEED);
      return {tx: head.x + (dx2 / dist2) * approachSpeed, ty: head.y + (dy2 / dist2) * approachSpeed, speed: approachSpeed};
    }
    if (this.aiAlertTarget) { this.aiAlertTarget = null; this.aiAlertTimer = 0; }
    if (this.aiPauseCooldown > 0) this.aiPauseCooldown--;
    if (this.aiPauseTimer > 0) {
      this.aiPauseTimer--;
      var total = this.aiPauseDone, elapsed = total - this.aiPauseTimer;
      var waitFrames = total * 0.15;
      if (!this.aiWillLook || elapsed < waitFrames) {
        this.aiLookOffset *= 0.92;
      } else {
        var fadeIn = Math.min(1, (elapsed - waitFrames) / 20);
        var fadeOut = Math.min(1, this.aiPauseTimer / 20);
        var envelope = fadeIn * fadeOut;
        if (this.aiLookHoldTimer > 0) { this.aiLookHoldTimer--; }
        else {
          this.aiLookTarget = (Math.random() - 0.5) * 1.4;
          var rr = Math.random();
          this.aiLookSpeed = rr < 0.6 ? (0.008 + rr * 0.03) : rr < 0.85 ? (0.03 + (rr - 0.6) * 0.2) : (0.1 + (rr - 0.85) * 0.7);
          this.aiLookHoldTimer = Math.floor(10 + Math.random() * 70);
        }
        this.aiLookOffset += (this.aiLookTarget * envelope - this.aiLookOffset) * this.aiLookSpeed;
      }
      if (this.aiPauseTimer <= 0) {
        this.aiWanderAngle = this.aiLookBaseAngle + this.aiLookOffset * 2.0;
        this.aiLookOffset = 0; this.aiPauseDone = 0; this.aiSpeedRamp = 0;
      }
      return {tx: head.x, ty: head.y, speed: 0};
    }
    this.aiLookOffset *= 0.92;
    if (this.aiPauseCooldown <= 0) {
      var pauseChance = 0.002 + (10 - activity) * 0.003;
      if (Math.random() < pauseChance) {
        var duration = Math.floor(80 + Math.random() * (160 - activity * 12));
        this.aiPauseTimer = duration; this.aiPauseDone = duration;
        this.aiPauseCooldown = 150 + activity * 30;
        this.aiWillLook = Math.random() < 0.4;
        this.aiLookTarget = 0; this.aiLookHoldTimer = 0;
        this.aiLookBaseAngle = Math.atan2(this.spine[0].y - this.spine[2].y, this.spine[0].x - this.spine[2].x);
        return {tx: head.x, ty: head.y, speed: 0};
      }
    }
    this.aiSpeedRamp = Math.min(1, this.aiSpeedRamp + 0.02);
    this.aiTurnTimer--;
    if (this.aiTurnTimer <= 0 || Math.random() < turnChance) {
      this.aiWanderAngle += (Math.random() - 0.5) * (0.5 + activity * 0.15);
      this.aiTurnTimer = 30 + Math.random() * 60;
    }
    var softMargin = 100, hardMargin = 30, bx = 0, by = 0;
    if (head.x < softMargin) bx += Math.pow(1 - Math.max(0, head.x - hardMargin) / (softMargin - hardMargin), 2);
    if (head.x > this._w - softMargin) bx -= Math.pow(1 - Math.max(0, (this._w - head.x) - hardMargin) / (softMargin - hardMargin), 2);
    if (head.y < softMargin) by += Math.pow(1 - Math.max(0, head.y - hardMargin) / (softMargin - hardMargin), 2);
    if (head.y > this._h - softMargin) by -= Math.pow(1 - Math.max(0, (this._h - head.y) - hardMargin) / (softMargin - hardMargin), 2);
    var bLen = Math.hypot(bx, by);
    if (bLen > 0.01) {
      var tA = Math.atan2(by, bx);
      var bf = Math.min(1, bLen * 0.6);
      var dd = tA - this.aiWanderAngle;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      this.aiWanderAngle += dd * bf;
    }
    var rampedSpeed = wanderSpeed * this.aiSpeedRamp;
    return {tx: head.x + Math.cos(this.aiWanderAngle) * rampedSpeed, ty: head.y + Math.sin(this.aiWanderAngle) * rampedSpeed, speed: rampedSpeed};
  }

  _updateSpine() {
    var head = this.spine[0];
    var hdx = head.x - this.prevHeadX, hdy = head.y - this.prevHeadY;
    this.headSpeed = Math.hypot(hdx, hdy);
    this.prevHeadX = head.x; this.prevHeadY = head.y;
    if (this.mouseDown && this.mouseDragStart && Math.hypot(this.mouseX - this.mouseDragStart.x, this.mouseY - this.mouseDragStart.y) > 8) {
      var av = this._computeAvoidanceDir(head, this.mouseX, this.mouseY);
      var dx = this.mouseX - head.x, dy = this.mouseY - head.y, dist = Math.hypot(dx, dy);
      if (dist > 1) { var move = Math.min(dist, this.MAX_SPEED); head.x += av.x * move; head.y += av.y * move; }
    } else if (this.aiActive) {
      var ai = this._computeAITarget(head);
      var av2 = this._computeAvoidanceDir(head, ai.tx, ai.ty);
      var dx2 = ai.tx - head.x, dy2 = ai.ty - head.y, dist2 = Math.hypot(dx2, dy2);
      if (dist2 > 1) { var move2 = Math.min(dist2, ai.speed); head.x += av2.x * move2; head.y += av2.y * move2; }
    }
    var FENCE = 10, BZ = 40, BF = 2.5, pushX = 0, pushY = 0;
    if (head.x < FENCE + BZ) pushX += Math.pow(1 - Math.max(0, head.x - FENCE) / BZ, 2) * BF;
    if (head.x > this._w - FENCE - BZ) pushX -= Math.pow(1 - Math.max(0, (this._w - FENCE) - head.x) / BZ, 2) * BF;
    if (head.y < FENCE + BZ) pushY += Math.pow(1 - Math.max(0, head.y - FENCE) / BZ, 2) * BF;
    if (head.y > this._h - FENCE - BZ) pushY -= Math.pow(1 - Math.max(0, (this._h - FENCE) - head.y) / BZ, 2) * BF;
    head.x += pushX; head.y += pushY;
    if (this.aiActive && (Math.abs(pushX) > 0.1 || Math.abs(pushY) > 0.1)) this.aiWanderAngle = Math.atan2(pushY, pushX);
    head.x = Math.max(FENCE, Math.min(this._w - FENCE, head.x));
    head.y = Math.max(FENCE, Math.min(this._h - FENCE, head.y));
    this.serpentinePhase += this.headSpeed * 0.12;
    for (var i = 1; i < this.spine.length; i++) {
      var prev = this.spine[i - 1], curr = this.spine[i];
      var angle = Math.atan2(prev.y - curr.y, prev.x - curr.x);
      curr.x = prev.x - Math.cos(angle) * this.SEGMENT_LENGTH;
      curr.y = prev.y - Math.sin(angle) * this.SEGMENT_LENGTH;
    }
    var moveRatio = Math.min(1, this.headSpeed / (this.MAX_SPEED * 0.3));
    if (moveRatio > 0.01) {
      for (var i2 = 3; i2 < this.spine.length; i2++) {
        var prev2 = this.spine[i2 - 1], curr2 = this.spine[i2];
        var segAngle = Math.atan2(prev2.y - curr2.y, prev2.x - curr2.x);
        var perpX = -Math.sin(segAngle), perpY = Math.cos(segAngle);
        var t = i2 / (this.spine.length - 1);
        var ampRamp = Math.min(1, (t - 0.12) / 0.15);
        var tailBoost = 1 + t * 0.8;
        var amp = this.SERPENTINE_AMP * ampRamp * tailBoost * moveRatio;
        var wave = Math.sin(this.serpentinePhase * this.SERPENTINE_SPEED - i2 * this.SERPENTINE_FREQ);
        curr2.x += perpX * wave * amp; curr2.y += perpY * wave * amp;
      }
    }
    for (var iter = 0; iter < 3; iter++) {
      this._enforceAngleConstraints();
      for (var i3 = 1; i3 < this.spine.length; i3++) {
        var p = this.spine[i3 - 1], c = this.spine[i3];
        var a = Math.atan2(p.y - c.y, p.x - c.x);
        c.x = p.x - Math.cos(a) * this.SEGMENT_LENGTH;
        c.y = p.y - Math.sin(a) * this.SEGMENT_LENGTH;
      }
    }
    this._resolveBodyCollisions();
    this.lookOffsets.length = 0;
    if (Math.abs(this.aiLookOffset) > 0.01) {
      var lookNodes = 3, pivot = this.spine[lookNodes];
      for (var i4 = 0; i4 < lookNodes; i4++) {
        var node = this.spine[i4];
        var ddx = node.x - pivot.x, ddy = node.y - pivot.y;
        var dd = Math.hypot(ddx, ddy);
        var baseAngle = Math.atan2(ddy, ddx);
        var factor = (lookNodes - i4) / lookNodes;
        var rotAngle = this.aiLookOffset * factor;
        this.lookOffsets[i4] = {
          x: pivot.x + Math.cos(baseAngle + rotAngle) * dd - node.x,
          y: pivot.y + Math.sin(baseAngle + rotAngle) * dd - node.y
        };
      }
    }
    for (var i5 = 0; i5 < this.spine.length; i5++) {
      this.spine[i5].x = Math.max(10, Math.min(this._w - 10, this.spine[i5].x));
      this.spine[i5].y = Math.max(10, Math.min(this._h - 10, this.spine[i5].y));
    }
  }

  _solveIK(hip, foot, len1, len2, bendDir) {
    var dx = foot.x - hip.x, dy = foot.y - hip.y;
    var dist = Math.hypot(dx, dy);
    var clampedDist = Math.max(Math.abs(len1 - len2) + 1, Math.min(len1 + len2 - 1, dist));
    var angleTarget = Math.atan2(dy, dx);
    var cosA = (len1 * len1 + clampedDist * clampedDist - len2 * len2) / (2 * len1 * clampedDist);
    var angleHip = Math.acos(Math.min(1, Math.max(-1, cosA)));
    var kneeAngle = angleTarget + angleHip * bendDir;
    return {x: hip.x + Math.cos(kneeAngle) * len1, y: hip.y + Math.sin(kneeAngle) * len1};
  }

  _updateLegs() {
    var self = this;
    this.legs.forEach(function(leg) {
      var hip = self._getHip(leg);
      var dirAngle = self._spineAngleAt(leg.spineIndex);
      var perpAngle = dirAngle + Math.PI / 2 * leg.side;
      var distToFoot = Math.hypot(hip.x - leg.target.x, hip.y - leg.target.y);
      var partner = self.legs.find(function(l) { return l.pairId === leg.pairId && l.side !== leg.side; });
      var canStep = !partner || !partner.stepping;
      if (!leg.stepping && distToFoot > self.STEP_DISTANCE && canStep) {
        leg.stepping = true; leg.stepT = 0;
        leg.startX = leg.target.x; leg.startY = leg.target.y;
        var reach = self.LEG_LENGTH1 + self.LEG_LENGTH2 - 15;
        leg.endX = hip.x + Math.cos(perpAngle) * reach * 0.6 + Math.cos(dirAngle) * reach * 0.3;
        leg.endY = hip.y + Math.sin(perpAngle) * reach * 0.6 + Math.sin(dirAngle) * reach * 0.3;
      }
      if (leg.stepping) {
        leg.stepT += self.STEP_SPEED;
        var t = Math.min(1, leg.stepT);
        var lift = Math.sin(t * Math.PI) * 14 * (self._scaleFactor || 1);
        leg.foot.x = self._lerp(leg.startX, leg.endX, t);
        leg.foot.y = self._lerp(leg.startY, leg.endY, t) - lift;
        if (t >= 1) { leg.stepping = false; leg.target.x = leg.endX; leg.target.y = leg.endY; }
      } else {
        leg.foot.x = leg.target.x; leg.foot.y = leg.target.y;
      }
    });
  }

  _drawBody() {
    var ctx = this.ctx, leftPts = [], rightPts = [];
    for (var i = 0; i < this.spine.length; i++) {
      var node = this.spine[i];
      var next = this.spine[Math.min(i + 1, this.spine.length - 1)];
      var prev = this.spine[Math.max(0, i - 1)];
      var angle = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2;
      var w = this._bodyWidthAt(i);
      leftPts.push({x: node.x + Math.cos(angle) * w, y: node.y + Math.sin(angle) * w});
      rightPts.push({x: node.x - Math.cos(angle) * w, y: node.y - Math.sin(angle) * w});
    }
    var sc = this._skinColors || {bodyTop:"#5a8a3c",bodyMid:"#3d6b2e",bodyBottom:"#2a4d1f",outline:"#2a4d1f",stripe:"rgba(120,180,80,0.25)",dot:"rgba(30,60,20,0.5)"};
    var grad = ctx.createLinearGradient(this.spine[0].x, this.spine[0].y - 20, this.spine[0].x, this.spine[0].y + 20);
    grad.addColorStop(0, sc.bodyTop); grad.addColorStop(0.5, sc.bodyMid); grad.addColorStop(1, sc.bodyBottom);
    ctx.fillStyle = grad; ctx.strokeStyle = sc.outline; ctx.lineWidth = Math.max(1, 2 * (this._scaleFactor || 1));
    ctx.beginPath(); ctx.moveTo(leftPts[0].x, leftPts[0].y);
    for (var i2 = 1; i2 < leftPts.length - 1; i2++) {
      var cx = (leftPts[i2].x + leftPts[i2 + 1].x) / 2, cy = (leftPts[i2].y + leftPts[i2 + 1].y) / 2;
      ctx.quadraticCurveTo(leftPts[i2].x, leftPts[i2].y, cx, cy);
    }
    ctx.lineTo(leftPts[leftPts.length - 1].x, leftPts[leftPts.length - 1].y);
    ctx.lineTo(this.spine[this.spine.length - 1].x, this.spine[this.spine.length - 1].y);
    ctx.lineTo(rightPts[rightPts.length - 1].x, rightPts[rightPts.length - 1].y);
    for (var i3 = rightPts.length - 2; i3 > 0; i3--) {
      var cx2 = (rightPts[i3].x + rightPts[i3 - 1].x) / 2, cy2 = (rightPts[i3].y + rightPts[i3 - 1].y) / 2;
      ctx.quadraticCurveTo(rightPts[i3].x, rightPts[i3].y, cx2, cy2);
    }
    ctx.lineTo(rightPts[0].x, rightPts[0].y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sc.stripe; ctx.beginPath();
    for (var i4 = 0; i4 < this.spine.length; i4++) {
      var n = this.spine[i4];
      var nx = this.spine[Math.min(i4 + 1, this.spine.length - 1)];
      var pv = this.spine[Math.max(0, i4 - 1)];
      var a = Math.atan2(nx.y - pv.y, nx.x - pv.x) + Math.PI / 2;
      var ww = this._bodyWidthAt(i4) * 0.45;
      var px = n.x + Math.cos(a) * ww, py = n.y + Math.sin(a) * ww;
      i4 === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    for (var i5 = this.spine.length - 1; i5 >= 0; i5--) {
      var n2 = this.spine[i5];
      var nx2 = this.spine[Math.min(i5 + 1, this.spine.length - 1)];
      var pv2 = this.spine[Math.max(0, i5 - 1)];
      var a2 = Math.atan2(nx2.y - pv2.y, nx2.x - pv2.x) + Math.PI / 2;
      var ww2 = this._bodyWidthAt(i5) * 0.45;
      ctx.lineTo(n2.x - Math.cos(a2) * ww2, n2.y - Math.sin(a2) * ww2);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = sc.dot;
    for (var i6 = 2; i6 < this.spine.length - 4; i6 += 2) {
      var sw = this._bodyWidthAt(i6) * 0.3;
      if (sw > 2) { ctx.beginPath(); ctx.arc(this.spine[i6].x, this.spine[i6].y, sw, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  _drawHead() {
    var ctx = this.ctx, head = this.spine[0], neck = this.spine[2];
    var angle = Math.atan2(head.y - neck.y, head.x - neck.x);
    var sc = this._skinColors || {head:"#4a7a30",outline:"#2a4d1f"};
    var hs = this._headScale * (this._scaleFactor || 1);
    ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(angle);
    ctx.fillStyle = sc.head;
    ctx.beginPath(); ctx.ellipse(8 * hs, 0, 16 * hs, 12 * hs, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sc.outline; ctx.lineWidth = Math.max(1, 2 * (this._scaleFactor || 1)); ctx.stroke();
    ctx.fillStyle = "#ff8800";
    ctx.beginPath(); ctx.ellipse(12 * hs, -8 * hs, 5 * hs, 4 * hs, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12 * hs, 8 * hs, 5 * hs, 4 * hs, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.ellipse(13 * hs, -8 * hs, 2 * hs, 3.5 * hs, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(13 * hs, 8 * hs, 2 * hs, 3.5 * hs, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a3010";
    ctx.beginPath(); ctx.arc(22 * hs, -3 * hs, 1.5 * hs, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(22 * hs, 3 * hs, 1.5 * hs, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawLegs() {
    var self = this, ctx = this.ctx;
    var sc = this._skinColors || {leg:"#3d6b2e",outline:"#2a4d1f"};
    var sf = this._scaleFactor || 1;
    this.legs.forEach(function(leg) {
      var hip = self._getHip(leg);
      var knee = self._solveIK(hip, leg.foot, self.LEG_LENGTH1, self.LEG_LENGTH2, -leg.side);
      ctx.strokeStyle = sc.leg; ctx.lineWidth = Math.max(2, 6 * sf); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, 4 * sf);
      ctx.beginPath(); ctx.moveTo(knee.x, knee.y); ctx.lineTo(leg.foot.x, leg.foot.y); ctx.stroke();
      ctx.fillStyle = sc.outline;
      ctx.beginPath(); ctx.arc(knee.x, knee.y, Math.max(2, 4 * sf), 0, Math.PI * 2); ctx.fill();
      self._drawFoot(leg.foot, hip);
    });
  }

  _drawFoot(foot, hip) {
    var ctx = this.ctx;
    var sc = this._skinColors || {leg:"#3d6b2e"};
    var sf = this._scaleFactor || 1;
    var angle = Math.atan2(foot.y - hip.y, foot.x - hip.x);
    var toeLen = Math.max(4, 10 * sf);
    ctx.save(); ctx.translate(foot.x, foot.y); ctx.rotate(angle);
    ctx.fillStyle = sc.leg;
    for (var t = -2; t <= 2; t++) {
      var spread = t * 0.35;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(spread) * toeLen, Math.sin(spread) * toeLen);
      ctx.lineWidth = Math.max(1, 2.5 * sf); ctx.strokeStyle = sc.leg; ctx.stroke();
      ctx.beginPath(); ctx.arc(Math.cos(spread) * toeLen, Math.sin(spread) * toeLen, Math.max(0.8, 1.5 * sf), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawVisionCone() {
    if (!(this.aiActive && (this.headSpeed < 0.5 || this.aiAlertTarget))) return;
    var ctx = this.ctx, head = this.spine[0];
    var headAngle = this._getHeadAngle();
    var halfFOV = (this.FOV_ANGLE / 2) * Math.PI / 180;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(head.x, head.y);
    ctx.arc(head.x, head.y, this.FOV_MAX_DIST, headAngle - halfFOV, headAngle + halfFOV);
    ctx.closePath(); ctx.fillStyle = "rgba(30,80,30,0.12)"; ctx.fill();
    ctx.strokeStyle = "rgba(30,80,30,0.25)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(head.x, head.y);
    ctx.arc(head.x, head.y, this.FOV_CLEAR_DIST, headAngle - halfFOV, headAngle + halfFOV);
    ctx.closePath(); ctx.fillStyle = "rgba(100,220,100,0.08)"; ctx.fill();
    ctx.strokeStyle = "rgba(100,220,100,0.2)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  _render() {
    var ctx = this.ctx;
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(0, 0, this._w, this._h);
    this._updateLightDots();
    this._updateSpine();
    this._updateLegs();
    var saved = [];
    if (this.lookOffsets.length > 0) {
      for (var i = 0; i < this.lookOffsets.length; i++) {
        saved[i] = {x: this.spine[i].x, y: this.spine[i].y};
        this.spine[i].x += this.lookOffsets[i].x;
        this.spine[i].y += this.lookOffsets[i].y;
      }
    }
    this._drawLightDots();
    this._drawVisionCone();
    this._drawLegs();
    this._drawBody();
    this._drawHead();
    if (saved.length > 0) {
      for (var j = 0; j < saved.length; j++) {
        this.spine[j].x = saved[j].x;
        this.spine[j].y = saved[j].y;
      }
    }
  }
}
