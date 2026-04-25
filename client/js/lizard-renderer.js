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
    this.SPINE_NODE_COUNT = opts.spineNodes || 22;
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
    this._headShape = "ellipse";
    this._headRotationLimit = 90;
    this._headTurnOffset = 0;
    this._headTurnTarget = 0;
    this._visualHeadAngle = 0;
    this._visualHeadAngleReady = false;
    this._mouseLookAngle = 0;
    this._mouseLookAngleReady = false;
    this._mouseTurnBaseAngle = 0;
    this._mouseTurnBaseReady = false;
    this._colorSaturation = 1.0;
    this._patternComplexity = 1;
    this._patternType = "spots";
    this._patternColor = "rgba(30,60,20,0.5)";
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
    this.CHASE_SPEED_MULT = opts.chaseSpeedMult || 1.8;
    this.WANDER_SPEED_BASE = opts.wanderSpeedBase || 0.15;
    this.WANDER_SPEED_ACTIVITY = opts.wanderSpeedActivity || 0.06;
    this.TURN_CHANCE_BASE = opts.turnChanceBase || 0.005;
    this.TURN_CHANCE_ACTIVITY = opts.turnChanceActivity || 0.004;
    this.PAUSE_CHANCE_BASE = opts.pauseChanceBase || 0.002;
    this.PAUSE_LOW_ACTIVITY_BONUS = opts.pauseLowActivityBonus || 0.003;
    this.PAUSE_DURATION_MIN = opts.pauseDurationMin || 80;
    this.PAUSE_DURATION_MAX = opts.pauseDurationMax || 160;
    this.PAUSE_DURATION_ACTIVITY_REDUCE = opts.pauseDurationActivityReduce || 12;
    this.PAUSE_COOLDOWN_BASE = opts.pauseCooldownBase || 150;
    this.PAUSE_COOLDOWN_ACTIVITY = opts.pauseCooldownActivity || 30;
    this.PAUSE_LOOK_CHANCE = opts.pauseLookChance || 0.4;
    this.spine = [];
    this.legs = [
      {spineIndex:this._legIndexAt(0.05),side:1,pairId:0,gaitGroup:0,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0},
      {spineIndex:this._legIndexAt(0.05),side:-1,pairId:0,gaitGroup:1,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0},
      {spineIndex:this._legIndexAt(0.242),side:1,pairId:1,gaitGroup:1,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0},
      {spineIndex:this._legIndexAt(0.242),side:-1,pairId:1,gaitGroup:0,target:{x:0,y:0},foot:{x:0,y:0},stepping:false,stepT:0}
    ];
    this.lightDots = [];
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false; this.mouseDragStart = null;
    this.serpentinePhase = 0; this.headSpeed = 0;
    this._gaitPhase = 0;
    this._gaitActiveGroup = 0;
    this._legsWereMoving = false;
    this._forceStep = false;
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
    /* ── 跑步机状态 ── */
    this._treadmillActive = false;
    this._treadmillBeltOffset = 0;
    this._treadmillZone = null;       // {x, y, w, h} — 在 _applyScale 中计算
    this._treadmillOnIt = false;      // 蜥蜴是否已到达跑步机上
    this._rafId = null;
    this._boundRender = this._loop.bind(this);
    this._boundVisibility = this._onVisibility.bind(this);
    this._boundResize = this._resize.bind(this);
    this._evH = {};
    this._evBound = false;
    this._w = 0; this._h = 0;
    this._initCanvas();
    this._initSpine();
    this._initLegs();
    this._bindEvents();
  }

  start() {
    var self = this;
    /* 每次 start 都重新测量 canvas 尺寸（stop 会移除 resize 监听） */
    var prevW = this._w, prevH = this._h;
    this._resize();
    /* 父容器尚未布局 → 延迟重试 */
    if (this._w === 0 || this._h === 0) {
      requestAnimationFrame(function() { self.start(); });
      return;
    }
    /* 尺寸从 0 恢复、或首次获得有效尺寸 → 重新初始化脊柱和腿 */
    if (prevW === 0 || prevH === 0) {
      this._initSpine();
      this._initLegs();
    }
    /* stop() 会移除 canvas 事件，这里重新绑定 */
    this._ensureCanvasEvents();
    if (!this._rafId) this._rafId = requestAnimationFrame(this._boundRender);
    document.addEventListener("visibilitychange", this._boundVisibility);
    window.addEventListener("resize", this._boundResize);
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    document.removeEventListener("visibilitychange", this._boundVisibility);
    this._removeCanvasEvents();
  }

  _legIndexAt(ratio) {
    return Math.max(2, Math.min(this.SPINE_NODE_COUNT - 3, Math.round((this.SPINE_NODE_COUNT - 1) * ratio)));
  }

  _redistributeLegs() {
    if (!this.legs || this.legs.length < 4) return;
    var front = this._legIndexAt(0.05);
    var rear = this._legIndexAt(0.242);
    this.legs[0].spineIndex = front;
    this.legs[1].spineIndex = front;
    this.legs[2].spineIndex = rear;
    this.legs[3].spineIndex = rear;
  }

  setActivity(v) { this.activity = Math.max(1, Math.min(10, v)); }

  /** 开启/关闭跑步机模式 */
  setTreadmill(active) {
    this._treadmillActive = !!active;
    if (!active) { this._treadmillOnIt = false; this._treadmillBeltOffset = 0; }
  }

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
    if (renderParams.spineNodes) {
      var nodes = Math.max(8, Math.min(40, Math.round(renderParams.spineNodes)));
      if (nodes !== this.SPINE_NODE_COUNT) {
        this.SPINE_NODE_COUNT = nodes;
        this._redistributeLegs();
        this._initSpine();
        this._initLegs();
      }
    }
    if (renderParams.legLength1 !== undefined) this._BASE_LEG_LENGTH1 = renderParams.legLength1;
    if (renderParams.legLength2 !== undefined) this._BASE_LEG_LENGTH2 = renderParams.legLength2;
    if (renderParams.stepDistance !== undefined) this._BASE_STEP_DISTANCE = renderParams.stepDistance;
    if (renderParams.stepSpeed !== undefined) this.STEP_SPEED = renderParams.stepSpeed;
    if (renderParams.serpentineAmp !== undefined) this.SERPENTINE_AMP = renderParams.serpentineAmp;
    if (renderParams.serpentineFreq !== undefined) this.SERPENTINE_FREQ = renderParams.serpentineFreq;
    if (renderParams.serpentineSpeed !== undefined) this.SERPENTINE_SPEED = renderParams.serpentineSpeed;
    if (renderParams.collisionMargin !== undefined) this.COLLISION_MARGIN = renderParams.collisionMargin * (this._scaleFactor || 1);
    if (renderParams.headSkipNodes !== undefined) this.HEAD_SKIP_NODES = Math.max(1, Math.round(renderParams.headSkipNodes));
    if (renderParams.steerStrength !== undefined) this.STEER_STRENGTH = renderParams.steerStrength;
    if (renderParams.bendNeck !== undefined) this.BEND_NECK = renderParams.bendNeck;
    if (renderParams.bendShoulder !== undefined) this.BEND_SHOULDER = renderParams.bendShoulder;
    if (renderParams.bendTorso !== undefined) this.BEND_TORSO = renderParams.bendTorso;
    if (renderParams.bendHip !== undefined) this.BEND_HIP = renderParams.bendHip;
    if (renderParams.bendTail !== undefined) this.BEND_TAIL = renderParams.bendTail;
    if (renderParams.fovClearDist !== undefined) this.FOV_CLEAR_DIST = renderParams.fovClearDist * (this._scaleFactor || 1);
    if (renderParams.fovMaxDist !== undefined) this.FOV_MAX_DIST = renderParams.fovMaxDist * (this._scaleFactor || 1);
    if (renderParams.alertSpeed !== undefined) this.ALERT_SPEED = renderParams.alertSpeed;
    if (renderParams.chaseSpeedMult !== undefined) this.CHASE_SPEED_MULT = renderParams.chaseSpeedMult;
    if (renderParams.wanderSpeedBase !== undefined) this.WANDER_SPEED_BASE = renderParams.wanderSpeedBase;
    if (renderParams.wanderSpeedActivity !== undefined) this.WANDER_SPEED_ACTIVITY = renderParams.wanderSpeedActivity;
    if (renderParams.turnChanceBase !== undefined) this.TURN_CHANCE_BASE = renderParams.turnChanceBase;
    if (renderParams.turnChanceActivity !== undefined) this.TURN_CHANCE_ACTIVITY = renderParams.turnChanceActivity;
    if (renderParams.pauseChanceBase !== undefined) this.PAUSE_CHANCE_BASE = renderParams.pauseChanceBase;
    if (renderParams.pauseLowActivityBonus !== undefined) this.PAUSE_LOW_ACTIVITY_BONUS = renderParams.pauseLowActivityBonus;
    if (renderParams.pauseDurationMin !== undefined) this.PAUSE_DURATION_MIN = renderParams.pauseDurationMin;
    if (renderParams.pauseDurationMax !== undefined) this.PAUSE_DURATION_MAX = renderParams.pauseDurationMax;
    if (renderParams.pauseDurationActivityReduce !== undefined) this.PAUSE_DURATION_ACTIVITY_REDUCE = renderParams.pauseDurationActivityReduce;
    if (renderParams.pauseCooldownBase !== undefined) this.PAUSE_COOLDOWN_BASE = renderParams.pauseCooldownBase;
    if (renderParams.pauseCooldownActivity !== undefined) this.PAUSE_COOLDOWN_ACTIVITY = renderParams.pauseCooldownActivity;
    if (renderParams.pauseLookChance !== undefined) this.PAUSE_LOOK_CHANCE = renderParams.pauseLookChance;
    /* bodyWidth / headScale / colorSaturation 本身就是倍率，直接赋值 */
    if (renderParams.bodyWidth !== undefined)         this._bodyScale = renderParams.bodyWidth;
    if (renderParams.headScale !== undefined)         this._headScale = renderParams.headScale;
    if (renderParams.headShape !== undefined)         this._headShape = renderParams.headShape;
    if (renderParams.headRotationLimit !== undefined) this._headRotationLimit = Math.max(0, Math.min(300, renderParams.headRotationLimit));
    if (renderParams.colorSaturation !== undefined)   this._colorSaturation = renderParams.colorSaturation;
    if (renderParams.patternComplexity !== undefined) this._patternComplexity = renderParams.patternComplexity;
    if (renderParams.patternType !== undefined)       this._patternType = renderParams.patternType;
    if (renderParams.patternColor !== undefined)      this._patternColor = renderParams.patternColor;
    /* 以下参数服务端返回的是倍率，需要乘以基准值再乘以缩放因子 */
    var sf = this._scaleFactor || 1;
    if (renderParams.moveSpeed !== undefined)         this.MAX_SPEED = this._BASE_MAX_SPEED * renderParams.moveSpeed * sf;
    if (renderParams.legFrequency !== undefined)      this.STEP_SPEED = 0.18 * renderParams.legFrequency;
    if (renderParams.segmentWidth !== undefined)      this.SEGMENT_LENGTH = this._BASE_SEGMENT_LENGTH * renderParams.segmentWidth * sf;
    if (renderParams.legLength1 !== undefined)        this.LEG_LENGTH1 = renderParams.legLength1 * sf;
    if (renderParams.legLength2 !== undefined)        this.LEG_LENGTH2 = renderParams.legLength2 * sf;
    if (renderParams.stepDistance !== undefined)      this.STEP_DISTANCE = renderParams.stepDistance * sf;
    if (renderParams.fovAngle !== undefined)          this.FOV_ANGLE = 60 * renderParams.fovAngle;
    if (renderParams.fovDistance !== undefined)        this.FOV_MAX_DIST = this._BASE_FOV_MAX_DIST * renderParams.fovDistance * sf;
    if (bodySeed) this._bodySeed = bodySeed;
    this._skinColors = this._generateSkinColors();
  }

  /** 基于 colorSaturation + bodySeed 生成皮肤色系 (RB-5) */
  _generateSkinColors() {
    var seed = this._bodySeed || {};
    var hueBase = seed.hue != null ? seed.hue : 110;
    var sat = Math.min(100, Math.round(35 * this._colorSaturation));
    var light = seed.lightness != null ? seed.lightness : 32;
    var head = seed.headColor || "hsl(" + hueBase + "," + Math.round(sat * 0.9) + "%," + (light + 4) + "%)";
    var body = seed.bodyColor || "hsl(" + hueBase + "," + sat + "%," + light + "%)";
    var tail = seed.tailColor || "hsl(" + hueBase + "," + sat + "%," + (light - 8) + "%)";
    var eye = seed.eyeColor || "#ff8800";
    var pattern = seed.patternColor || this._patternColor;
    return {
      bodyTop:    seed.bodyColor || "hsl(" + hueBase + "," + sat + "%," + (light + 8) + "%)",
      bodyMid:    body,
      bodyBottom: tail,
      head:       head,
      eye:        eye,
      leg:        body,
      outline:    "hsl(" + hueBase + "," + sat + "%," + Math.max(8, light - 12) + "%)",
      stripe:     pattern,
      dot:        pattern,
      pattern:    pattern
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
    this._evBound = false;
  }

  /** 确保 canvas 事件已绑定（stop 会移除，start 需要重新绑定） */
  _ensureCanvasEvents() {
    if (this._evBound) return;
    var c = this.canvas, h = this._evH;
    if (h.m) c.addEventListener("mousemove", h.m);
    if (h.d) c.addEventListener("mousedown", h.d);
    if (h.u) c.addEventListener("mouseup", h.u);
    if (h.l) c.addEventListener("mouseleave", h.l);
    this._evBound = true;
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
    this._treadmillZone = {
      x: this._w * 0.55,
      y: this._h * 0.60,
      w: this._w * 0.32,
      h: this._h * 0.18
    };
  }

  _initSpine() {
    this.spine = [];
    var x = this._w / 2;
    for (var i = 0; i < this.SPINE_NODE_COUNT; i++) {
      this.spine.push({x: x, y: this._h / 2});
      if (i < this.SPINE_NODE_COUNT - 1) x -= this._segmentLengthAt(i);
    }
    this.prevHeadX = this.spine[0].x; this.prevHeadY = this.spine[0].y;
    this.mouseX = this._w / 2; this.mouseY = this._h / 2;
    this._visualHeadAngle = this._getHeadAngle();
    this._visualHeadAngleReady = true;
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
    this._evBound = true;
  }

  _onVisibility() {
    if (document.hidden) { if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; } }
    else { if (!this._rafId) this._rafId = requestAnimationFrame(this._boundRender); }
  }

  _loop() { try { this._render(); } catch(e) { console.error('[LizardRenderer]', e); } this._rafId = requestAnimationFrame(this._boundRender); }


  _lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * 按解剖图比例返回第 i 节脊椎的关节间距
   * 躯干区域（Head+Trunk≈40% TL）间距较大，尾部（60% TL）间距逐渐减小
   */
  _segmentLengthAt(i) {
    var n = this.SPINE_NODE_COUNT - 1, t = i / n;
    /* 解剖图比例：Head≈5.2% TL, Trunk≈34.8% TL, Tail≈60% TL */
    if (t < 0.052) {
      /* 头部：吻尖到下颌关节，间距中等（颈椎短粗） */
      return this.SEGMENT_LENGTH * this._lerp(0.85, 1.0, t / 0.052);
    } else if (t < 0.40) {
      /* 躯干（不含头）：颈椎后段到泄殖腔前，间距最大（椎骨最长） */
      return this.SEGMENT_LENGTH * this._lerp(1.05, 0.92, (t - 0.052) / 0.348);
    } else if (t < 0.60) {
      /* 尾部前段：泄殖腔到中段，间距快速减小 */
      return this.SEGMENT_LENGTH * this._lerp(0.92, 0.72, (t - 0.40) / 0.20);
    } else if (t < 0.80) {
      /* 尾部中段：间距继续减小 */
      return this.SEGMENT_LENGTH * this._lerp(0.72, 0.55, (t - 0.60) / 0.20);
    } else {
      /* 尾部末端：间距最小，尖锐尾尖 */
      return this.SEGMENT_LENGTH * this._lerp(0.55, 0.30, (t - 0.80) / 0.20);
    }
  }

  _angleDiff(a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _bodyWidthAt(i) {
    /* 基于解剖图比例：Head≈5.2% TL, Trunk≈34.8% TL, Tail≈60% TL */
    var n = this.SPINE_NODE_COUNT - 1, t = i / n, s = this._bodyScale, sc = this._scaleFactor || 1, w;
    if (t < 0.052) {
      /* 头部区域：从吻尖到下颌关节，宽度逐渐增大 */
      w = this._lerp(8, 14, t / 0.052);
    } else if (t < 0.10) {
      /* 颈部过渡：从下颌到前肢附着点，宽度收窄 */
      w = this._lerp(14, 12, (t - 0.052) / 0.048);
    } else if (t < 0.18) {
      /* 躯干前段：前肢附着区域，宽度增大 */
      w = this._lerp(12, 16, (t - 0.10) / 0.08);
    } else if (t < 0.30) {
      /* 躯干中段：胸腔/腹腔区域，保持较宽 */
      w = this._lerp(16, 15, (t - 0.18) / 0.12);
    } else if (t < 0.40) {
      /* 躯干后段：到泄殖腔开口，宽度略收窄 */
      w = this._lerp(15, 12, (t - 0.30) / 0.10);
    } else if (t < 0.50) {
      /* 尾根区域：泄殖腔后，尾根较粗 */
      w = this._lerp(12, 10, (t - 0.40) / 0.10);
    } else if (t < 0.70) {
      /* 尾部中段：逐渐变细 */
      w = this._lerp(10, 5, (t - 0.50) / 0.20);
    } else {
      /* 尾部末端：急剧变细到尾尖 */
      w = this._lerp(5, 1, (t - 0.70) / 0.30);
    }
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

  _getVisualHeadAngle() {
    if (!this._visualHeadAngleReady) {
      this._visualHeadAngle = this._getHeadAngle();
      this._visualHeadAngleReady = true;
    }
    return this._visualHeadAngle;
  }

  _getHeadRotationLimitRad() {
    return Math.max(0, Math.min(300, this._headRotationLimit || 0)) * Math.PI / 180;
  }

  _updateHeadTurn(targetAngle, speed, clampToBody, clampBaseAngle) {
    var bodyAngle = this._getHeadAngle();
    if (!this._visualHeadAngleReady) {
      this._visualHeadAngle = bodyAngle;
      this._visualHeadAngleReady = true;
    }
    var shouldClamp = clampToBody !== false;
    var baseAngle = clampBaseAngle !== undefined ? clampBaseAngle : bodyAngle;
    var maxOffset = this._getHeadRotationLimitRad();
    var desired = targetAngle;
    if (shouldClamp) {
      var desiredOffset = this._angleDiff(baseAngle, targetAngle);
      if (desiredOffset > maxOffset) desired = baseAngle + maxOffset;
      else if (desiredOffset < -maxOffset) desired = baseAngle - maxOffset;
    }
    this._headTurnTarget = this._angleDiff(bodyAngle, desired);
    this._visualHeadAngle += this._angleDiff(this._visualHeadAngle, desired) * (speed || 0.24);
    this._headTurnOffset = this._angleDiff(bodyAngle, this._visualHeadAngle);
  }

  _headLeadMoveFactor(targetAngle) {
    var limit = this._getHeadRotationLimitRad();
    if (limit < 0.01) return 1;
    var err = Math.abs(this._angleDiff(this._getVisualHeadAngle(), targetAngle));
    var range = Math.max(0.28, Math.min(limit, Math.PI * 0.75));
    var ready = Math.max(0, Math.min(1, 1 - err / range));
    return 0.04 + ready * 0.96;
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
        next.x = curr.x + Math.cos(newAngle) * this._segmentLengthAt(i);
        next.y = curr.y + Math.sin(newAngle) * this._segmentLengthAt(i);
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
    var headAngle = this._getVisualHeadAngle();
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
    /* ── 跑步机模式：引导蜥蜴到跑步机中心并保持 ── */
    if (this._treadmillActive && this._treadmillZone) {
      var tz = this._treadmillZone;
      var cx = tz.x + tz.w / 2, cy = tz.y + tz.h / 2;
      var dx = cx - head.x, dy = cy - head.y;
      var dist = Math.hypot(dx, dy);
      if (dist < 15) {
        this._treadmillOnIt = true;
        return {tx: head.x, ty: head.y, speed: 0, lookAngle: this._getVisualHeadAngle()};
      }
      this._treadmillOnIt = false;
      var spd = Math.min(dist, this.MAX_SPEED * 0.8);
      return {tx: head.x + (dx / dist) * spd, ty: head.y + (dy / dist) * spd, speed: spd};
    }
    var activity = this.activity;
    var wanderSpeed = this.MAX_SPEED * (this.WANDER_SPEED_BASE + activity * this.WANDER_SPEED_ACTIVITY);
    var turnChance = this.TURN_CHANCE_BASE + activity * this.TURN_CHANCE_ACTIVITY;
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
        return {tx: head.x, ty: head.y, speed: 0, lookAngle: tAngle};
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
          var maxLook = Math.min(2.6, this._getHeadRotationLimitRad());
          this.aiLookTarget = (Math.random() - 0.5) * maxLook * 2;
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
      return {tx: head.x, ty: head.y, speed: 0, lookAngle: this.aiLookBaseAngle + this.aiLookOffset};
    }
    this.aiLookOffset *= 0.92;
    if (this.aiPauseCooldown <= 0) {
      var pauseChance = this.PAUSE_CHANCE_BASE + (10 - activity) * this.PAUSE_LOW_ACTIVITY_BONUS;
      if (Math.random() < pauseChance) {
        var duration = Math.floor(this.PAUSE_DURATION_MIN + Math.random() * (this.PAUSE_DURATION_MAX - activity * this.PAUSE_DURATION_ACTIVITY_REDUCE));
        this.aiPauseTimer = duration; this.aiPauseDone = duration;
        this.aiPauseCooldown = this.PAUSE_COOLDOWN_BASE + activity * this.PAUSE_COOLDOWN_ACTIVITY;
        this.aiWillLook = Math.random() < this.PAUSE_LOOK_CHANCE;
        this.aiLookTarget = 0; this.aiLookHoldTimer = 0;
        this.aiLookBaseAngle = this._getHeadAngle();
        return {tx: head.x, ty: head.y, speed: 0, lookAngle: this.aiLookBaseAngle};
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
    var desiredLookAngle = null;
    var headTurnUpdated = false;
    var startX = head.x, startY = head.y;
    var hdx = head.x - this.prevHeadX, hdy = head.y - this.prevHeadY;
    this.headSpeed = Math.hypot(hdx, hdy);
    this.prevHeadX = head.x; this.prevHeadY = head.y;
    if (this.mouseDown && this.mouseDragStart && Math.hypot(this.mouseX - this.mouseDragStart.x, this.mouseY - this.mouseDragStart.y) > 8) {
      var av = this._computeAvoidanceDir(head, this.mouseX, this.mouseY);
      var dx = this.mouseX - head.x, dy = this.mouseY - head.y, dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        var moveAngle0 = Math.atan2(av.y, av.x);
        var mouseLookAngle = Math.atan2(dy, dx);
        if (!this._mouseLookAngleReady) {
          this._mouseLookAngle = mouseLookAngle;
          this._mouseLookAngleReady = true;
        } else {
          this._mouseLookAngle += this._angleDiff(this._mouseLookAngle, mouseLookAngle) * 0.28;
        }
        if (!this._mouseTurnBaseReady) {
          this._mouseTurnBaseAngle = this._getHeadAngle();
          this._mouseTurnBaseReady = true;
        } else {
          /* 鼠标牵引期间，基准角跟随身体角度缓慢更新（0.08） */
          this._mouseTurnBaseAngle += this._angleDiff(this._mouseTurnBaseAngle, this._getHeadAngle()) * 0.08;
        }
        desiredLookAngle = this._mouseLookAngle;
        this._updateHeadTurn(desiredLookAngle, 0.34, true, this._mouseTurnBaseAngle);
        headTurnUpdated = true;
        if (dist > 1) {
          var move = Math.min(dist, this.MAX_SPEED) * this._headLeadMoveFactor(desiredLookAngle);
          head.x += av.x * move; head.y += av.y * move;
        }
      } else {
        if (!this._mouseTurnBaseReady) {
          this._mouseTurnBaseAngle = this._getHeadAngle();
          this._mouseTurnBaseReady = true;
        }
        desiredLookAngle = this._mouseLookAngleReady ? this._mouseLookAngle : this._getVisualHeadAngle();
        this._updateHeadTurn(desiredLookAngle, 0.18, true, this._mouseTurnBaseAngle);
        headTurnUpdated = true;
      }
    } else if (this.aiActive) {
      this._mouseLookAngleReady = false;
      this._mouseTurnBaseReady = false;
      var ai = this._computeAITarget(head);
      if (ai.lookAngle !== undefined) desiredLookAngle = ai.lookAngle;
      if (this._treadmillActive && this._treadmillOnIt) {
        this.headSpeed = this.MAX_SPEED * 0.6;
      } else {
        var av2 = this._computeAvoidanceDir(head, ai.tx, ai.ty);
        var dx2 = ai.tx - head.x, dy2 = ai.ty - head.y, dist2 = Math.hypot(dx2, dy2);
        if (dist2 > 1) {
          var moveAngle1 = Math.atan2(av2.y, av2.x);
          desiredLookAngle = moveAngle1;
          this._updateHeadTurn(moveAngle1, 0.58);
          var move2 = Math.min(dist2, ai.speed) * this._headLeadMoveFactor(moveAngle1);
          head.x += av2.x * move2; head.y += av2.y * move2;
        }
      }
    } else {
      this._mouseLookAngleReady = false;
      this._mouseTurnBaseReady = false;
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
    var moved = Math.hypot(head.x - startX, head.y - startY);
    var moveAngle = moved > 0.08 ? Math.atan2(head.y - startY, head.x - startX) : this._getHeadAngle();
    this.serpentinePhase += this.headSpeed * 0.12;
    for (var i = 1; i < this.spine.length; i++) {
      var prev = this.spine[i - 1], curr = this.spine[i];
      var angle = Math.atan2(prev.y - curr.y, prev.x - curr.x);
      curr.x = prev.x - Math.cos(angle) * this._segmentLengthAt(i - 1);
      curr.y = prev.y - Math.sin(angle) * this._segmentLengthAt(i - 1);
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
        c.x = p.x - Math.cos(a) * this._segmentLengthAt(i3 - 1);
        c.y = p.y - Math.sin(a) * this._segmentLengthAt(i3 - 1);
      }
    }
    if (!headTurnUpdated) this._updateHeadTurn(desiredLookAngle !== null ? desiredLookAngle : moveAngle);
    this._resolveBodyCollisions();
    this.lookOffsets.length = 0;
    for (var i5 = 0; i5 < this.spine.length; i5++) {
      this.spine[i5].x = Math.max(10, Math.min(this._w - 10, this.spine[i5].x));
      this.spine[i5].y = Math.max(10, Math.min(this._h - 10, this.spine[i5].y));
    }
  }

  _legRestPosition(leg) {
    var hip = this._getHip(leg);
    var dirAngle = this._spineAngleAt(leg.spineIndex);
    var perpAngle = dirAngle + Math.PI / 2 * leg.side;
    var reach = this.LEG_LENGTH1 + this.LEG_LENGTH2 - 15;
    var forward = leg.pairId === 0 ? 0.62 : -0.42;
    var lateral = leg.pairId === 0 ? 0.44 : 0.50;
    return {
      x: hip.x + Math.cos(perpAngle) * reach * lateral + Math.cos(dirAngle) * reach * forward,
      y: hip.y + Math.sin(perpAngle) * reach * lateral + Math.sin(dirAngle) * reach * forward
    };
  }

  _legStrideTarget(leg, strideSign) {
    var hip = this._getHip(leg);
    var dirAngle = this._spineAngleAt(leg.spineIndex);
    var perpAngle = dirAngle + Math.PI / 2 * leg.side;
    var reach = this.LEG_LENGTH1 + this.LEG_LENGTH2 - 15;
    var forwardBase = leg.pairId === 0 ? 0.62 : -0.42;
    var forwardAmp = leg.pairId === 0 ? 0.42 : 0.34;
    var lateral = leg.pairId === 0 ? 0.42 : 0.50;
    var along = forwardBase + forwardAmp * strideSign;
    return {
      x: hip.x + Math.cos(perpAngle) * reach * lateral + Math.cos(dirAngle) * reach * along,
      y: hip.y + Math.sin(perpAngle) * reach * lateral + Math.sin(dirAngle) * reach * along
    };
  }



  _clampLegFoot(hip, foot, maxReach) {
    var dx = foot.x - hip.x, dy = foot.y - hip.y;
    var d = Math.hypot(dx, dy);
    if (d <= maxReach || d < 0.001) return foot;
    return {x: hip.x + dx / d * maxReach, y: hip.y + dy / d * maxReach};
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
    var moving = this.headSpeed > 0.12;
    if (!moving) {
      this._forceStep = false;
      this._legsWereMoving = false;
      for (var r = 0; r < this.legs.length; r++) {
        var legRest = this.legs[r];
        var rest = this._legRestPosition(legRest);
        legRest.foot.x += (rest.x - legRest.foot.x) * 0.16;
        legRest.foot.y += (rest.y - legRest.foot.y) * 0.16;
        legRest.target.x = legRest.foot.x; legRest.target.y = legRest.foot.y;
        legRest.stepping = false; legRest.stepT = 0;
      }
      return;
    }

    var stancePortion = 0.62;
    var reach = this.LEG_LENGTH1 + this.LEG_LENGTH2 - 15;
    var rearStrideDistance = reach * 0.34 * 2;
    var frontStrideDistance = reach * 0.42 * 2;
    var strideDistance = Math.max(1, Math.min(frontStrideDistance, rearStrideDistance));
    var frequencyScale = Math.max(0.75, Math.min(1.45, this.STEP_SPEED / 0.18));
    var phaseDelta = this.headSpeed * stancePortion / strideDistance * frequencyScale;
    this._gaitPhase = ((this._gaitPhase || 0) + Math.max(0.012, Math.min(0.075, phaseDelta))) % 1;
    this._legsWereMoving = true;

    for (var i = 0; i < this.legs.length; i++) {
      var leg = this.legs[i];
      var phase = (this._gaitPhase + (leg.gaitGroup === 1 ? 0.5 : 0)) % 1;
      var p;
      if (phase < stancePortion) {
        var stanceT = phase / stancePortion;
        p = this._legStrideTarget(leg, this._lerp(1, -1, stanceT));
        leg.stepping = false;
        leg.foot.x = p.x;
        leg.foot.y = p.y;
      } else {
        var swingT = (phase - stancePortion) / (1 - stancePortion);
        var swingEase = swingT * swingT * (3 - 2 * swingT);
        p = this._legStrideTarget(leg, this._lerp(-1, 1, swingEase));
        p.y -= Math.sin(swingT * Math.PI) * 20 * (this._scaleFactor || 1);
        leg.stepping = true;
        leg.foot.x += (p.x - leg.foot.x) * 0.88;
        leg.foot.y += (p.y - leg.foot.y) * 0.88;
      }
      leg.target.x = leg.foot.x; leg.target.y = leg.foot.y;
      leg.stepT = phase;
    }
  }

  _hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  _mixColor(a, b, t) {
    var ca = this._parseColor(a), cb = this._parseColor(b);
    return "rgb(" + Math.round(this._lerp(ca[0], cb[0], t)) + "," + Math.round(this._lerp(ca[1], cb[1], t)) + "," + Math.round(this._lerp(ca[2], cb[2], t)) + ")";
  }

  _parseColor(c) {
    if (!c) return [60, 107, 46];
    if (c.charAt(0) === "#") {
      var hex = c.length === 4 ? c.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : c;
      return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    }
    var m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [60, 107, 46];
  }

  _traceBodyPath(leftPts, rightPts) {
    var ctx = this.ctx;
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
    ctx.closePath();
  }

  _drawPattern(sc) {
    var type = this._patternType || "spots";
    var complexity = Math.max(1, Math.min(6, Math.round(this._patternComplexity || 1)));
    if (type === "clean" || complexity <= 0) return;
    var ctx = this.ctx;
    var color = sc.pattern || sc.dot;
    var sf = this._scaleFactor || 1;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    /* 花纹仅限于躯干区域：t ∈ [0.052, 0.40] */
    var trunkStart = Math.max(2, Math.floor(0.052 * (this.spine.length - 1)));
    var trunkEnd = Math.min(this.spine.length - 3, Math.floor(0.40 * (this.spine.length - 1)));
    for (var i = trunkStart; i <= trunkEnd; i++) {
      var t = i / (this.spine.length - 1);
      var node = this.spine[i];
      var next = this.spine[Math.min(i + 1, this.spine.length - 1)];
      var prev = this.spine[Math.max(0, i - 1)];
      var axis = Math.atan2(next.y - prev.y, next.x - prev.x);
      var perp = axis + Math.PI / 2;
      var w = this._bodyWidthAt(i);
      if (type === "spots") {
        var spotStep = Math.max(1, 4 - Math.floor(complexity / 2));
        if (i % spotStep === 0) {
          var spotCount = 1 + Math.floor((complexity + 1) / 3);
          for (var sp = 0; sp < spotCount; sp++) {
            var side = (this._hash(i * 3.9 + sp * 11.2) - 0.5) * 1.35;
            var along = (this._hash(i * 9.1 + sp * 5.3) - 0.5) * this.SEGMENT_LENGTH * 0.9;
            var radius = Math.max(1.5, w * (0.12 + complexity * 0.018 + this._hash(i + sp * 13) * 0.14));
            ctx.beginPath();
            ctx.arc(node.x + Math.cos(perp) * w * side + Math.cos(axis) * along, node.y + Math.sin(perp) * w * side + Math.sin(axis) * along, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (type === "speckles") {
        var count = 2 + complexity * 2;
        for (var k = 0; k < count; k++) {
          var r1 = this._hash(i * 31 + k * 7);
          var r2 = this._hash(i * 17 + k * 11);
          var offset = (r1 - 0.5) * w * 1.65;
          var along2 = (r2 - 0.5) * this.SEGMENT_LENGTH * 0.8;
          ctx.beginPath();
          ctx.arc(node.x + Math.cos(perp) * offset + Math.cos(axis) * along2, node.y + Math.sin(perp) * offset + Math.sin(axis) * along2, Math.max(0.7, (0.8 + this._hash(i + k) * 1.8) * sf), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === "horizontal_stripes") {
        var stripeStep = Math.max(1, 5 - complexity);
        if (i % stripeStep === 0) {
          var fade = Math.sin(Math.PI * t);
          ctx.lineWidth = Math.max(2.5, (2.8 + complexity * 0.55) * sf) * fade;
          ctx.globalAlpha = 0.3 + 0.5 * fade;
          ctx.beginPath();
          ctx.moveTo(node.x + Math.cos(perp) * w * 0.9, node.y + Math.sin(perp) * w * 0.9);
          ctx.quadraticCurveTo(node.x + Math.cos(axis) * this.SEGMENT_LENGTH * 0.12, node.y + Math.sin(axis) * this.SEGMENT_LENGTH * 0.12, node.x - Math.cos(perp) * w * 0.9, node.y - Math.sin(perp) * w * 0.9);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (type === "vertical_stripes") {
        var lanes = Math.min(6, 2 + complexity);
        ctx.lineWidth = Math.max(1.3, (1.4 + complexity * 0.22) * sf);
        for (var ln = 0; ln < lanes; ln++) {
          if ((i + ln) % 2 !== 0) continue;
          var pos = lanes === 1 ? 0 : ln / (lanes - 1) - 0.5;
          var wiggle = Math.sin(t * Math.PI * (4 + complexity) + ln) * w * 0.06;
          var off = pos * w * 1.45 + wiggle;
          ctx.globalAlpha = 0.45 + 0.35 * Math.sin(Math.PI * t);
          ctx.beginPath();
          ctx.moveTo(node.x + Math.cos(perp) * off, node.y + Math.sin(perp) * off);
          ctx.lineTo(next.x + Math.cos(perp) * off, next.y + Math.sin(perp) * off);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (type === "camo") {
        var camoStep = Math.max(1, 4 - Math.floor(complexity / 2));
        if (i % camoStep === 0) {
          var camoCount = 1 + Math.floor(complexity / 2);
          for (var c = 0; c < camoCount; c++) {
            var o = (this._hash(i * 13 + c) - 0.5) * w * 1.35;
            var a = axis + (this._hash(i * 19 + c) - 0.5) * (0.7 + complexity * 0.08);
            var rx = w * (0.18 + complexity * 0.025 + this._hash(i + c) * 0.24);
            var ry = w * (0.10 + this._hash(i * 2 + c) * 0.16);
            var along3 = (this._hash(i * 23 + c) - 0.5) * this.SEGMENT_LENGTH;
            ctx.globalAlpha = 0.34 + complexity * 0.035;
            ctx.beginPath();
            ctx.ellipse(node.x + Math.cos(perp) * o + Math.cos(axis) * along3, node.y + Math.sin(perp) * o + Math.sin(axis) * along3, rx, ry, a, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    ctx.restore();
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
    ctx.save();
    this._traceBodyPath(leftPts, rightPts);
    ctx.clip();
    for (var s = 0; s < this.spine.length; s++) {
      var tt = s / (this.spine.length - 1);
      /* 三段式渐变：头色→躯干色→尾色，基于解剖图比例 */
      var base;
      if (tt < 0.20) {
        base = this._mixColor(sc.head, sc.bodyMid, tt / 0.20);
      } else if (tt < 0.40) {
        base = this._mixColor(sc.bodyMid, sc.bodyBottom, (tt - 0.20) / 0.20);
      } else {
        base = sc.bodyBottom;
      }
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(this.spine[s].x, this.spine[s].y, this._bodyWidthAt(s) + this.SEGMENT_LENGTH * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    this._drawPattern(sc);
    ctx.restore();
    ctx.strokeStyle = sc.outline; ctx.lineWidth = Math.max(1, 2 * (this._scaleFactor || 1));
    this._traceBodyPath(leftPts, rightPts);
    ctx.stroke();
  }

  _drawHead() {
    var ctx = this.ctx, head = this.spine[0];
    var angle = this._getVisualHeadAngle();
    var sc = this._skinColors || {head:"#4a7a30",outline:"#2a4d1f",eye:"#ff8800"};
    var hs = this._headScale * (this._scaleFactor || 1);
    var shape = this._headShape || "ellipse";
    ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(angle);
    ctx.fillStyle = sc.head;
    ctx.strokeStyle = sc.outline; ctx.lineWidth = Math.max(1, 2 * (this._scaleFactor || 1));
    ctx.beginPath();
    if (shape === "triangle") {
      ctx.moveTo(25 * hs, 0); ctx.lineTo(-10 * hs, -14 * hs); ctx.lineTo(-8 * hs, 14 * hs); ctx.closePath();
    } else if (shape === "inverted_triangle") {
      ctx.moveTo(-13 * hs, 0); ctx.lineTo(22 * hs, -15 * hs); ctx.lineTo(22 * hs, 15 * hs); ctx.closePath();
    } else if (shape === "shovel") {
      ctx.moveTo(22 * hs, -5 * hs); ctx.quadraticCurveTo(18 * hs, -17 * hs, 0, -15 * hs); ctx.lineTo(-12 * hs, -8 * hs); ctx.lineTo(-12 * hs, 8 * hs); ctx.lineTo(0, 15 * hs); ctx.quadraticCurveTo(18 * hs, 17 * hs, 22 * hs, 5 * hs); ctx.closePath();
    } else if (shape === "crescent") {
      ctx.arc(7 * hs, 0, 17 * hs, -1.25, 1.25, false); ctx.quadraticCurveTo(-9 * hs, 0, 7 * hs, -16 * hs); ctx.closePath();
    } else if (shape === "fan") {
      ctx.moveTo(-13 * hs, 0);
      ctx.bezierCurveTo(-5 * hs, -18 * hs, 15 * hs, -20 * hs, 26 * hs, -8 * hs);
      ctx.quadraticCurveTo(31 * hs, 0, 26 * hs, 8 * hs);
      ctx.bezierCurveTo(15 * hs, 20 * hs, -5 * hs, 18 * hs, -13 * hs, 0);
      ctx.closePath();
    } else if (shape === "semicircle") {
      ctx.arc(4 * hs, 0, 17 * hs, -Math.PI / 2, Math.PI / 2, false); ctx.lineTo(-8 * hs, 12 * hs); ctx.lineTo(-8 * hs, -12 * hs); ctx.closePath();
    } else if (shape === "diamond") {
      ctx.moveTo(24 * hs, 0); ctx.lineTo(5 * hs, -15 * hs); ctx.lineTo(-12 * hs, 0); ctx.lineTo(5 * hs, 15 * hs); ctx.closePath();
    } else {
      ctx.ellipse(8 * hs, 0, 16 * hs, 12 * hs, 0, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = sc.eye || "#ff8800";
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
      var drawFoot = self._clampLegFoot(hip, leg.foot, self.LEG_LENGTH1 + self.LEG_LENGTH2 - 3);
      /* 前肢(pairId=0)关节向后弯曲，后肢(pairId=1)关节向前弯曲 */
      var bendDir = leg.pairId === 0 ? leg.side : -leg.side;
      var knee = self._solveIK(hip, drawFoot, self.LEG_LENGTH1, self.LEG_LENGTH2, bendDir);
      ctx.strokeStyle = sc.leg; ctx.lineWidth = Math.max(2, 6 * sf); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, 4 * sf);
      ctx.beginPath(); ctx.moveTo(knee.x, knee.y); ctx.lineTo(drawFoot.x, drawFoot.y); ctx.stroke();
      ctx.fillStyle = sc.outline;
      ctx.beginPath(); ctx.arc(knee.x, knee.y, Math.max(2, 4 * sf), 0, Math.PI * 2); ctx.fill();
      self._drawFoot(drawFoot, hip);
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

  /** 更新跑步机皮带滚动偏移 */
  _updateTreadmill() {
    if (!this._treadmillActive || !this._treadmillOnIt) return;
    this._treadmillBeltOffset += this.MAX_SPEED * 0.5;
    var tz = this._treadmillZone;
    if (tz && this._treadmillBeltOffset > tz.w * 0.15) this._treadmillBeltOffset = 0;
  }

  /** 绘制跑步机 */
  _drawTreadmill() {
    if (!this._treadmillActive || !this._treadmillZone) return;
    var ctx = this.ctx, tz = this._treadmillZone;
    var x = tz.x, y = tz.y, w = tz.w, h = tz.h;
    var sf = this._scaleFactor || 1;
    var r = 8 * sf;

    /* 跑步机底座阴影 */
    ctx.save();
    ctx.shadowColor = "rgba(0,200,255,0.15)";
    ctx.shadowBlur = 20 * sf;
    ctx.fillStyle = "#181828";
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* 跑步机边框 */
    ctx.strokeStyle = "rgba(80,180,255,0.35)";
    ctx.lineWidth = Math.max(1, 2 * sf);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.stroke();

    /* 皮带区域（内缩） */
    var pad = 6 * sf;
    var bx = x + pad, by = y + pad, bw = w - pad * 2, bh = h - pad * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();

    /* 皮带底色 */
    ctx.fillStyle = "#111120";
    ctx.fillRect(bx, by, bw, bh);

    /* 皮带条纹（反向滚动） */
    var stripeW = bw * 0.15;
    var offset = this._treadmillBeltOffset;
    ctx.strokeStyle = "rgba(80,180,255,0.12)";
    ctx.lineWidth = Math.max(1, 2 * sf);
    for (var sx = -stripeW + (offset % stripeW); sx < bw + stripeW; sx += stripeW) {
      ctx.beginPath();
      ctx.moveTo(bx + sx, by);
      ctx.lineTo(bx + sx - bh * 0.3, by + bh);
      ctx.stroke();
    }

    /* 皮带中线 */
    ctx.strokeStyle = "rgba(80,180,255,0.08)";
    ctx.lineWidth = Math.max(0.5, 1 * sf);
    ctx.setLineDash([4 * sf, 6 * sf]);
    ctx.beginPath();
    ctx.moveTo(bx, by + bh / 2);
    ctx.lineTo(bx + bw, by + bh / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    /* 运行指示灯 */
    if (this._treadmillOnIt) {
      var dotR = 3 * sf;
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.006);
      ctx.fillStyle = "rgba(0,255,120," + (0.4 + 0.6 * pulse) + ")";
      ctx.beginPath();
      ctx.arc(x + w - 10 * sf, y + 10 * sf, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawVisionCone() {
    if (!(this.aiActive && (this.headSpeed < 0.5 || this.aiAlertTarget))) return;
    var ctx = this.ctx, head = this.spine[0];
    var headAngle = this._getVisualHeadAngle();
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

  _applyTestEffect(effect) {
    if (!effect || effect.time <= 0) return;
    var head = this.spine[0];
    var tail = this.spine[this.spine.length - 1];
    var ctx = this.ctx;
    var p = effect.time / effect.duration;
    ctx.save();
    if (effect.type === "melee") {
      ctx.strokeStyle = "rgba(255,210,90," + p + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 42 * (1 - p + 0.2), 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === "ranged") {
      ctx.fillStyle = "rgba(90,220,120," + p + ")";
      ctx.beginPath();
      ctx.arc(head.x + Math.cos(this._getVisualHeadAngle()) * 70 * (1 - p), head.y + Math.sin(this._getVisualHeadAngle()) * 70 * (1 - p), 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.type === "buff") {
      ctx.strokeStyle = "rgba(80,180,255," + p + ")";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(head.x, head.y, 58 * (1 - p + 0.3), 24 * (1 - p + 0.3), this._getVisualHeadAngle(), 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === "heal") {
      ctx.fillStyle = "rgba(80,255,140," + p + ")";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("+", head.x - 7, head.y - 28 * (1 - p));
    } else if (effect.type === "fear_skill") {
      ctx.strokeStyle = "rgba(255,80,80," + p + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 80 * (1 - p + 0.1), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (effect.code === "tail_whip") {
      ctx.strokeStyle = "rgba(255,255,255," + p + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tail.x, tail.y, 34 * (1 - p + 0.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    effect.time--;
  }

  triggerSkillTest(code, type) {
    this._testEffect = { code: code || "skill", type: type || "melee", time: 45, duration: 45 };
  }

  applyHiddenGene(gene) {
    var seed = this._bodySeed || {};
    this._hiddenGene = gene || "";
    if (gene === "crystal_scale") { seed.hue = 190; seed.lightness = 45; this._colorSaturation = 1.8; this._patternComplexity = 5; }
    else if (gene === "shadow_veil") { seed.hue = 265; seed.lightness = 20; this._colorSaturation = 1.4; this._patternComplexity = 4; }
    else if (gene === "flame_heart") { seed.hue = 18; seed.lightness = 36; this._colorSaturation = 2.0; this._patternComplexity = 5; }
    else if (gene === "storm_wing") { seed.hue = 215; seed.lightness = 38; this._colorSaturation = 1.6; this._patternComplexity = 4; }
    else if (gene === "ancient_blood") { seed.hue = 48; seed.lightness = 34; this._colorSaturation = 1.9; this._patternComplexity = 6; this._bodyScale = Math.max(this._bodyScale, 1.22); }
    this._bodySeed = seed;
    this._skinColors = this._generateSkinColors();
  }



  _render() {
    var ctx = this.ctx;
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(0, 0, this._w, this._h);
    this._updateTreadmill();
    this._drawTreadmill();
    this._updateLightDots();
    this._updateSpine();
    this._updateLegs();
    this._drawLightDots();
    this._drawVisionCone();
    this._drawLegs();
    this._drawBody();
    this._drawHead();
    this._applyTestEffect(this._testEffect);
  }
}
