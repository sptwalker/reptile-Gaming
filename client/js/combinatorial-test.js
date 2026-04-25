"use strict";

(function() {
  var canvas = document.getElementById("testCanvas");
  var sectionsEl = document.getElementById("paramSections");
  var btnAi = document.getElementById("btnAi");
  var btnReset = document.getElementById("btnReset");
  var btnRandomAppearance = document.getElementById("btnRandomAppearance");
  var btnGenerateJuvenile = document.getElementById("btnGenerateJuvenile");
  var btnEvolve = document.getElementById("btnEvolve");
  var btnImportBattle = document.getElementById("btnImportBattle");
  var importStatus = document.getElementById("importStatus");
  var modeText = document.getElementById("modeText");
  var lifeStageText = document.getElementById("lifeStageText");

  if (!canvas || !sectionsEl || typeof LizardRenderer === "undefined") return;

  var DEFAULT_RENDER = {
    spineNodes: 22,
    bodyWidth: 1,
    segmentWidth: 1,
    headScale: 1,
    limbThickness: 1,
    headShape: "ellipse",
    headRotationLimit: 90,
    legLength1: 38,
    legLength2: 34,
    stepDistance: 50,
    stepSpeed: 0.18,
    legFrequency: 1,
    moveSpeed: 1,
    serpentineAmp: 1,
    serpentineFreq: 0.3,
    serpentineSpeed: 0.2,
    collisionMargin: 6,
    headSkipNodes: 4,
    legGapRatio: 1,
    steerStrength: 0.85,
    bendNeck: 0.455,
    bendShoulder: 0.286,
    bendTorso: 0.234,
    bendHip: 0.286,
    bendTail: 0.52,
    fovAngle: 1,
    fovDistance: 1,
    fovClearDist: 300,
    fovMaxDist: 500,
    alertSpeed: 2.5,
    chaseSpeedMult: 1.8,
    wanderSpeedBase: 0.15,
    wanderSpeedActivity: 0.06,
    turnChanceBase: 0.005,
    turnChanceActivity: 0.004,
    pauseChanceBase: 0.002,
    pauseLowActivityBonus: 0.003,
    pauseDurationMin: 80,
    pauseDurationMax: 160,
    pauseDurationActivityReduce: 12,
    pauseCooldownBase: 150,
    pauseCooldownActivity: 30,
    pauseLookChance: 0.4,
    colorSaturation: 1,
    patternComplexity: 3,
    spineCount: 0,
    spineLength: 1,
    patternType: "spots",
    patternColor: "rgba(38,68,28,0.55)"
  };

  var DEFAULT_SEED = {
    hue: 110,
    lightness: 32,
    eyeColor: "#ff8800",
    patternColor: "rgba(38,68,28,0.55)"
  };
  var EVOLVE_MAX_STAGE = 4;
  var LIFE_STAGE_LABELS = ["幼体阶段", "少年阶段", "青年阶段", "成年阶段", "完全体阶段"];
  var EVOLVE_RULES = [
    null,
    {
      bodyWidth: 1.08,
      segmentWidth: 1.08,
      headScale: 1.08,
      legLength1: 1.08,
      legLength2: 1.08,
      limbThickness: 1.08,
      spineCount: 1.2,
      spineLength: 1.08,
      patternComplexity: 1,
      colorSaturation: 1.04,
      moveSpeed: 0.96,
      stepDistance: 1.06,
      legGapRatio: 1.25
    },
    {
      bodyWidth: 1.08,
      segmentWidth: 1.08,
      headScale: 1.08,
      legLength1: 1.08,
      legLength2: 1.08,
      limbThickness: 1.08,
      spineCount: 1.25,
      spineLength: 1.08,
      patternComplexity: 1,
      colorSaturation: 1.05,
      moveSpeed: 0.95,
      stepDistance: 1.07,
      legGapRatio: 1.12
    },
    {
      bodyWidth: 1.09,
      segmentWidth: 1.09,
      headScale: 1.08,
      legLength1: 1.09,
      legLength2: 1.09,
      limbThickness: 1.09,
      spineCount: 1.3,
      spineLength: 1.1,
      patternComplexity: 1,
      colorSaturation: 1.05,
      moveSpeed: 0.94,
      stepDistance: 1.08,
      legGapRatio: 1
    },
    {
      bodyWidth: 1.09,
      segmentWidth: 1.09,
      headScale: 1.08,
      legLength1: 1.09,
      legLength2: 1.09,
      limbThickness: 1.09,
      spineCount: 1.35,
      spineLength: 1.1,
      patternComplexity: 1,
      colorSaturation: 1.06,
      moveSpeed: 0.93,
      stepDistance: 1.08,
      legGapRatio: 1
    }
  ];
  var HEAD_SHAPE_OPTIONS = ["ellipse", "triangle", "inverted_triangle", "shovel", "crescent", "fan", "semicircle", "diamond"];

  function minHeadScaleForBodyWidth(bodyWidth) {
    return Math.max(0.55, Number((bodyWidth * 1.5).toFixed(2)));
  }

  var renderParams = copy(DEFAULT_RENDER);
  var bodySeed = copy(DEFAULT_SEED);
  var hiddenGene = "";
  var lifeStage = 0;
  var renderer = null;

  var controls = [
    card("外观模块", [
      group("脊柱", [
        range("脊柱节点", "spineNodes", 12, 36, 1),
        range("躯干长度", "segmentWidth", 0.65, 1.45, 0.01),
        range("身体宽度", "bodyWidth", 0.65, 1.55, 0.01)
      ]),
      group("四肢", [
        range("上肢长度", "legLength1", 20, 58, 1),
        range("下肢长度", "legLength2", 18, 54, 1),
        range("上下肢间隔", "legGapRatio", 0.75, 1.45, 0.01),
        range("四肢粗细", "limbThickness", 0.55, 1.8, 0.01),
        range("步幅距离", "stepDistance", 24, 86, 1),
        range("迈步速度", "stepSpeed", 0.06, 0.42, 0.01)
      ]),
      group("头部", [
        select("头部形状", "headShape", [
          ["ellipse", "椭圆形"],
          ["triangle", "三角形"],
          ["inverted_triangle", "倒三角形"],
          ["shovel", "铲形"],
          ["crescent", "月牙形"],
          ["fan", "扇形"],
          ["semicircle", "半圆形"],
          ["diamond", "菱形"]
        ], onRenderSelectChange),
        range("头部大小", "headScale", 0.55, 2.2, 0.01),
        range("头部可旋转角度", "headRotationLimit", 40, 300, 1)
      ])
    ]),
    card("皮肤颜色区", [
      group("基础色", [
        color("头部", "headColor"),
        color("躯干", "bodyColor"),
        color("四肢", "limbColor"),
        color("尾部", "tailColor"),
        color("眼睛", "eyeColor"),
        range("色相", "hue", 0, 360, 1, "seed"),
        range("明度", "lightness", 16, 58, 1, "seed"),
        range("饱和倍率", "colorSaturation", 0.45, 2.2, 0.01),
        range("棘刺数量", "spineCount", 0, 40, 1),
        range("棘刺长度", "spineLength", 0.35, 2.2, 0.01)
      ], "compact-colors"),
      group("花纹", [
        select("花纹类型", "patternType", [
          ["spots", "斑点"],
          ["speckles", "麻点"],
          ["horizontal_stripes", "横条纹"],
          ["vertical_stripes", "竖条纹"],
          ["camo", "迷彩"],
          ["clean", "纯净"]
        ], onRenderSelectChange),
        color("花纹颜色", "patternColor"),
        range("纹理复杂度", "patternComplexity", 1, 6, 1)
      ])
    ]),
    card("运动模块", [
      group("基础", [
        range("活动值", "activity", 1, 10, 1, "renderer"),
        range("移动速度/腿频", "moveSpeed", 0.35, 2.1, 0.01)
      ]),
      group("蛇形", [
        range("摆幅", "serpentineAmp", 0, 4.5, 0.05),
        range("频率", "serpentineFreq", 0.08, 0.75, 0.01),
        range("速度", "serpentineSpeed", 0.05, 0.65, 0.01)
      ]),
      group("自碰撞", [
        range("碰撞边距", "collisionMargin", 0, 18, 0.5),
        range("转向强度", "steerStrength", 0.2, 1.4, 0.01)
      ]),
      group("关节约束", [
        range("颈部弯折", "bendNeck", 0.15, 1.2, 0.005),
        range("肩部弯折", "bendShoulder", 0.12, 0.95, 0.005),
        range("躯干弯折", "bendTorso", 0.08, 0.85, 0.005),
        range("髋部弯折", "bendHip", 0.12, 0.95, 0.005),
        range("尾部弯折", "bendTail", 0.18, 1.35, 0.005)
      ]),
      group("视野", [
        range("视角倍率", "fovAngle", 0.45, 2, 0.01),
        range("视距倍率", "fovDistance", 0.35, 1.8, 0.01),
        range("清晰视距", "fovClearDist", 80, 620, 5),
        range("最大视距", "fovMaxDist", 140, 900, 5)
      ])
    ]),
    card("AI参数", [
      group("游走", [
        range("巡游速度", "wanderSpeedBase", 0.02, 0.45, 0.005),
        range("活跃加速", "wanderSpeedActivity", 0, 0.14, 0.002),
        range("转向基础", "turnChanceBase", 0, 0.03, 0.001),
        range("转向活跃", "turnChanceActivity", 0, 0.02, 0.001)
      ]),
      group("停顿", [
        range("停顿基础", "pauseChanceBase", 0, 0.02, 0.0005),
        range("低活跃加成", "pauseLowActivityBonus", 0, 0.02, 0.0005),
        range("停顿最短", "pauseDurationMin", 10, 240, 1),
        range("停顿最长", "pauseDurationMax", 40, 360, 1),
        range("活跃缩短", "pauseDurationActivityReduce", 0, 28, 1),
        range("冷却基础", "pauseCooldownBase", 20, 360, 1),
        range("冷却活跃", "pauseCooldownActivity", 0, 80, 1),
        range("环顾概率", "pauseLookChance", 0, 1, 0.01)
      ]),
      group("捕猎", [
        range("警觉速度", "alertSpeed", 0.2, 8, 0.05),
        range("追逐倍率", "chaseSpeedMult", 0.5, 4, 0.05)
      ])
    ]),
    card("技能基因区", [
      group("技能", [
        select("测试技能", "skill", [
          ["scratch:melee", "抓挠 scratch"],
          ["tail_whip:melee", "甩尾 tail_whip"],
          ["camouflage:buff", "伪装 camouflage"],
          ["venom_spit:ranged", "毒液 venom_spit"],
          ["iron_hide:buff", "铁皮 iron_hide"],
          ["dragon_rush:melee", "龙突 dragon_rush"],
          ["regen:heal", "再生 regen"],
          ["predator_eye:fear_skill", "猎食者之眼 predator_eye"]
        ]),
        action("触发技能表现", triggerSelectedSkill),
        action("投放 5 个光点", addLightDots)
      ]),
      group("隐藏基因", [
        select("隐藏基因", "hiddenGene", [
          ["", "无"],
          ["crystal_scale", "晶鳞 crystal_scale"],
          ["shadow_veil", "影幕 shadow_veil"],
          ["flame_heart", "焰心 flame_heart"],
          ["storm_wing", "风暴翼 storm_wing"],
          ["ancient_blood", "古血 ancient_blood"]
        ], onHiddenGeneChange),
        note(["晶鳞", "影幕", "焰心", "风暴翼", "古血"])
      ])
    ])
  ];

  function copy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function card(title, groups) {
    return { title: title, groups: groups };
  }

  function group(title, fields, className) {
    return { title: title, fields: fields, className: className || "" };
  }

  function range(label, key, min, max, step, source) {
    return { type: "range", label: label, key: key, min: min, max: max, step: step, source: source || "render" };
  }

  function select(label, key, options, onChange) {
    return { type: "select", label: label, key: key, options: options, onChange: onChange };
  }

  function color(label, key) {
    return { type: "color", label: label, key: key };
  }

  function action(label, handler) {
    return { type: "action", label: label, handler: handler };
  }

  function note(items) {
    return { type: "note", items: items };
  }

  function getValue(field) {
    if (field.source === "seed") return bodySeed[field.key];
    if (field.source === "renderer") return renderer ? renderer.activity : 5;
    return renderParams[field.key];
  }

  function setValue(field, value) {
    if (field.source === "seed") {
      bodySeed[field.key] = value;
      if (field.key === "hue" || field.key === "lightness") {
        delete bodySeed.headColor;
        delete bodySeed.limbColor;
        delete bodySeed.tailColor;
      }
    }
    else if (field.source === "renderer") renderer.setActivity(value);
    else {
      renderParams[field.key] = value;
      if (field.key === "moveSpeed") renderParams.legFrequency = value;
      if (field.key === "colorSaturation") {
        delete bodySeed.headColor;
        delete bodySeed.limbColor;
        delete bodySeed.tailColor;
      }
    }
  }

  function formatValue(value, step) {
    var decimals = String(step).indexOf(".") >= 0 ? String(step).split(".")[1].length : 0;
    return Number(value).toFixed(Math.min(decimals, 3));
  }

  function renderPanel() {
    sectionsEl.innerHTML = "";
    controls.forEach(function(section) {
      var article = document.createElement("article");
      article.className = "param-card";
      var h2 = document.createElement("h2");
      h2.textContent = section.title;
      article.appendChild(h2);
      section.groups.forEach(function(g) {
        var wrap = document.createElement("div");
        wrap.className = "param-group" + (g.className ? " " + g.className : "");
        var h3 = document.createElement("h3");
        h3.textContent = g.title;
        wrap.appendChild(h3);
        g.fields.forEach(function(field) {
          if (field.type === "range") wrap.appendChild(createRange(field));
          else if (field.type === "select") wrap.appendChild(createSelect(field));
          else if (field.type === "color") wrap.appendChild(createColor(field));
          else if (field.type === "action") wrap.appendChild(createAction(field));
          else if (field.type === "note") wrap.appendChild(createNote(field));
        });
        article.appendChild(wrap);
      });
      sectionsEl.appendChild(article);
    });
  }

  function createRange(field) {
    var row = document.createElement("div");
    row.className = "field";
    var label = document.createElement("label");
    label.textContent = field.label;
    var input = document.createElement("input");
    input.type = "range";
    input.min = field.min;
    input.max = field.max;
    input.step = field.step;
    input.value = getValue(field);
    var output = document.createElement("output");
    output.textContent = formatValue(input.value, field.step);
    input.addEventListener("input", function() {
      var next = Number(input.value);
      setValue(field, next);
      output.textContent = formatValue(next, field.step);
      applyCurrentParams();
    });
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(output);
    return row;
  }

  function createSelect(field) {
    var row = document.createElement("div");
    row.className = "select-row";
    var label = document.createElement("label");
    label.textContent = field.label;
    var selectEl = document.createElement("select");
    selectEl.id = "select-" + field.key;
    field.options.forEach(function(opt) {
      var option = document.createElement("option");
      option.value = opt[0];
      option.textContent = opt[1];
      if (renderParams[field.key] === opt[0] || hiddenGene === opt[0]) option.selected = true;
      selectEl.appendChild(option);
    });
    selectEl.addEventListener("change", function() {
      if (field.onChange) field.onChange(selectEl.value, field);
    });
    row.appendChild(label);
    row.appendChild(selectEl);
    return row;
  }

  function createColor(field) {
    var row = document.createElement("div");
    row.className = "select-row";
    var label = document.createElement("label");
    label.textContent = field.label;
    var input = document.createElement("input");
    input.type = "color";
    input.value = rgbaToHex(bodySeed[field.key] || renderParams[field.key] || "#3d6b2e");
    input.dataset.key = field.key;
    input.addEventListener("input", function() {
      if (field.key === "patternColor") {
        renderParams.patternColor = input.value;
        bodySeed.patternColor = input.value;
      } else {
        bodySeed[field.key] = input.value;
      }
      applyCurrentParams();
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function createAction(field) {
    var row = document.createElement("div");
    row.className = "action-row";
    var button = document.createElement("button");
    button.className = "btn";
    button.type = "button";
    button.textContent = field.label;
    button.addEventListener("click", field.handler);
    row.appendChild(button);
    return row;
  }

  function createNote(field) {
    var row = document.createElement("div");
    field.items.forEach(function(text) {
      var span = document.createElement("span");
      span.className = "badge";
      span.textContent = text;
      row.appendChild(span);
    });
    return row;
  }

  function syncColorControls() {
    sectionsEl.querySelectorAll('input[type="color"][data-key]').forEach(function(input) {
      var key = input.dataset.key;
      input.value = rgbaToHex(bodySeed[key] || renderParams[key] || "#3d6b2e");
    });
  }

  function syncAfterGeneratedChange() {
    applyCurrentParams();
    renderPanel();
    syncColorControls();
  }

  function randomLimbColor(bodyColor, minSat, maxSat, minLight, maxLight) {
    minSat = minSat == null ? 24 : minSat;
    maxSat = maxSat == null ? 70 : maxSat;
    minLight = minLight == null ? 18 : minLight;
    maxLight = maxLight == null ? 46 : maxLight;
    var bodyHsl = parseColorToHsl(bodyColor || bodySeed.bodyColor);
    if (bodyHsl && Math.random() < 0.72) {
      return hslString(
        bodyHsl.h + randomBetween(-10, 10, 1),
        clamp(bodyHsl.s * randomBetween(0.72, 0.98, 0.01), minSat, maxSat),
        clamp(bodyHsl.l - randomBetween(3, 12, 1), minLight, maxLight)
      );
    }
    return hslString(randomBetween(0, 360, 1), randomBetween(minSat, maxSat, 1), randomBetween(minLight, maxLight, 1));
  }

  function rgbaToHex(value) {
    if (!value) return "#3d6b2e";
    if (value.charAt(0) === "#") return value;
    var hsl = parseColorToHsl(value);
    if (hsl) return hslToHex(hsl.h, hsl.s, hsl.l);
    var match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return "#3d6b2e";
    return "#" + [match[1], match[2], match[3]].map(function(v) {
      return Number(v).toString(16).padStart(2, "0");
    }).join("");
  }

  function applyCurrentParams() {
    renderParams.legFrequency = renderParams.moveSpeed;
    renderer.applyRenderParams(renderParams, bodySeed);
    renderer.setActivity(renderer.activity || 5);
    if (hiddenGene) renderer.applyHiddenGene(hiddenGene);
  }

  function createRenderer() {
    if (renderer) renderer.destroy();
    renderer = new LizardRenderer(canvas, { activity: 5 });
    renderer.toggleAI(true);
    applyCurrentParams();
    renderer.start();
    syncAiButton();
  }

  function syncAiButton() {
    btnAi.classList.toggle("off", !renderer.aiActive);
    btnAi.textContent = renderer.aiActive ? "AI 自主运动" : "鼠标牵引模式";
    modeText.textContent = renderer.aiActive ? "AI自主运动 / 点击投放光点" : "鼠标牵引运动 / 点击投放光点";
  }

  function syncLifeStageUi() {
    if (lifeStageText) lifeStageText.textContent = LIFE_STAGE_LABELS[lifeStage] || LIFE_STAGE_LABELS[0];
    if (!btnEvolve) return;
    var done = lifeStage >= EVOLVE_MAX_STAGE;
    btnEvolve.disabled = done;
    btnEvolve.textContent = done ? "已经完全体" : "蜕变升级";
  }

  function resetAll() {
    renderParams = copy(DEFAULT_RENDER);
    bodySeed = copy(DEFAULT_SEED);
    hiddenGene = "";
    lifeStage = 0;
    createRenderer();
    renderPanel();
    syncLifeStageUi();
  }

  function randomBetween(min, max, step) {
    var count = Math.round((max - min) / step);
    return Number((min + Math.floor(Math.random() * (count + 1)) * step).toFixed(4));
  }

  function randomColor() {
    return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hslToHex(h, s, l) {
    h = ((Number(h) % 360) + 360) % 360;
    s = clamp(Number(s), 0, 100) / 100;
    l = clamp(Number(l), 0, 100) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return "#" + rgb.map(function(v) {
      return Math.round((v + m) * 255).toString(16).padStart(2, "0");
    }).join("");
  }

  function hexToHsl(hex) {
    var match = String(hex || "").match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    var n = parseInt(match[1], 16);
    var r = ((n >> 16) & 255) / 255;
    var g = ((n >> 8) & 255) / 255;
    var b = (n & 255) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    var d = max - min;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
  }

  function parseColorToHsl(value) {
    var hslMatch = String(value || "").match(/hsl\(([-\d.]+),\s*([-\d.]+)%?,\s*([-\d.]+)%?\)/);
    if (hslMatch) return { h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) };
    return hexToHsl(value);
  }

  function hslString(h, s, l) {
    return "hsl(" + Math.round(((h % 360) + 360) % 360) + "," + Math.round(clamp(s, 0, 100)) + "%," + Math.round(clamp(l, 6, 86)) + "%)";
  }

  function shiftColorLightness(value, amount) {
    var parsed = parseColorToHsl(value);
    if (!parsed) return value;
    return hslString(parsed.h, parsed.s, parsed.l + amount);
  }

  function roundToStep(value, step) {
    var decimals = String(step).indexOf(".") >= 0 ? String(step).split(".")[1].length : 0;
    return Number(value.toFixed(Math.min(decimals, 4)));
  }

  function applyBiomechanicalRandomRules() {
    var bodyLength = renderParams.segmentWidth * (renderParams.spineNodes / 22);
    var bodyBulk = bodyLength * renderParams.bodyWidth;
    var targetLimbThickness = clamp(0.65 + bodyBulk * 0.35, 0.55, 1.8);
    renderParams.limbThickness = roundToStep(clamp(Math.max(renderParams.limbThickness, targetLimbThickness), 0.55, 1.8), 0.01);
    var targetLimbRatio = clamp(0.85 + bodyLength * 0.25, 0.75, 1.25);
    var currentLimbTotal = renderParams.legLength1 + renderParams.legLength2;
    var limbScale = (38 + 34) * targetLimbRatio / Math.max(1, currentLimbTotal);
    renderParams.legLength1 = roundToStep(clamp(renderParams.legLength1 * limbScale, 20, 58), 1);
    renderParams.legLength2 = roundToStep(clamp(renderParams.legLength2 * limbScale, 18, 54), 1);
    var limbRatio = (renderParams.legLength1 + renderParams.legLength2) / (38 + 34);
    var widthPressure = renderParams.bodyWidth - 1;
    var bulkPressure = bodyBulk - 1;
    var shortLegPressure = 1 - limbRatio;
    var heavy = clamp(bulkPressure * 0.34 + (renderParams.limbThickness - 1) * 0.16, -0.35, 0.55);

    renderParams.moveSpeed = roundToStep(clamp(renderParams.moveSpeed * (1 - heavy), 0.35, 2.1), 0.01);
    renderParams.chaseSpeedMult = roundToStep(clamp(renderParams.chaseSpeedMult * (1 - heavy * 0.42), 1.05, 2.3), 0.01);
    renderParams.stepDistance = roundToStep(clamp(renderParams.stepDistance * clamp(limbRatio, 0.62, 1.42) * (1 - Math.max(0, shortLegPressure) * 0.22), 24, 86), 1);
    renderParams.stepSpeed = roundToStep(clamp(renderParams.stepSpeed * (1 + shortLegPressure * 0.75 - heavy * 0.22), 0.06, 0.42), 0.01);
    renderParams.legFrequency = renderParams.moveSpeed;

    renderParams.serpentineAmp = roundToStep(clamp(renderParams.serpentineAmp * (1 - Math.max(0, widthPressure) * 0.22 + Math.max(0, -widthPressure) * 0.12), 0, 4.5), 0.05);
    renderParams.serpentineFreq = roundToStep(clamp(renderParams.serpentineFreq * (1 - Math.max(0, bodyLength - 1) * 0.18 + Math.max(0, 1 - bodyLength) * 0.12), 0.08, 0.75), 0.01);
    renderParams.steerStrength = roundToStep(clamp(renderParams.steerStrength * (1 - Math.max(0, bulkPressure) * 0.18), 0.2, 1.4), 0.01);
    renderParams.collisionMargin = roundToStep(clamp(renderParams.collisionMargin + Math.max(0, widthPressure) * 5 + Math.max(0, bulkPressure) * 2, 0, 18), 0.5);

    var bendScale = clamp(1 - Math.max(0, widthPressure) * 0.22 - Math.max(0, bulkPressure) * 0.08, 0.68, 1.18);
    renderParams.bendNeck = roundToStep(clamp(renderParams.bendNeck * clamp(bendScale + 0.16, 0.78, 1.28), 0.28, 1.2), 0.005);
    renderParams.bendShoulder = roundToStep(clamp(renderParams.bendShoulder * bendScale, 0.2, 0.95), 0.005);
    renderParams.bendTorso = roundToStep(clamp(renderParams.bendTorso * bendScale, 0.16, 0.85), 0.005);
    renderParams.bendHip = roundToStep(clamp(renderParams.bendHip * bendScale, 0.2, 0.95), 0.005);
    renderParams.bendTail = roundToStep(clamp(renderParams.bendTail * clamp(1 + Math.max(0, bodyLength - 1) * 0.18, 0.85, 1.25), 0.18, 1.35), 0.005);

    renderParams.pauseChanceBase = roundToStep(clamp(renderParams.pauseChanceBase * (1 + Math.max(0, heavy) * 0.9), 0.002, 0.012), 0.001);
    renderParams.pauseDurationMin = roundToStep(clamp(renderParams.pauseDurationMin * (1 + Math.max(0, heavy) * 0.45), 60, 180), 1);
    renderParams.pauseDurationMax = roundToStep(clamp(renderParams.pauseDurationMax * (1 + Math.max(0, heavy) * 0.55), 100, 260), 1);
  }

  function randomizeAppearance() {
    controls[0].groups.forEach(function(g) {
      g.fields.forEach(function(field) {
        if (field.type !== "range") return;
        setValue(field, randomBetween(field.min, field.max, field.step));
      });
    });
    renderParams.headShape = HEAD_SHAPE_OPTIONS[Math.floor(Math.random() * HEAD_SHAPE_OPTIONS.length)];
    renderParams.headScale = Math.max(renderParams.headScale, minHeadScaleForBodyWidth(renderParams.bodyWidth));
    applyBiomechanicalRandomRules();
    renderParams.spineCount = Math.random() < 0.5 ? 0 : randomBetween(6, 40, 1);
    renderParams.spineLength = randomBetween(0.35, 2.2, 0.01);
    bodySeed.headColor = randomColor();
    bodySeed.bodyColor = randomColor();
    bodySeed.limbColor = randomLimbColor(bodySeed.bodyColor);
    bodySeed.tailColor = randomColor();
    bodySeed.eyeColor = randomColor();
    bodySeed.patternColor = randomColor();
    renderParams.patternColor = bodySeed.patternColor;
    renderParams.patternType = ["spots", "speckles", "horizontal_stripes", "vertical_stripes", "camo", "clean"][Math.floor(Math.random() * 6)];
    hiddenGene = "";
    syncAfterGeneratedChange();
  }

  function generateJuvenile() {
    randomizeAppearance();
    renderParams.spineNodes = randomBetween(12, 17, 1);
    renderParams.segmentWidth = randomBetween(0.65, 1.19, 0.01);
    applyBiomechanicalRandomRules();
    renderParams.legLength1 = roundToStep(clamp(renderParams.legLength1 * 0.72, 20, 58), 1);
    renderParams.legLength2 = roundToStep(clamp(renderParams.legLength2 * 0.72, 18, 54), 1);
    renderParams.legGapRatio = randomBetween(1.35, 1.45, 0.01);
    renderParams.headScale = roundToStep(clamp(minHeadScaleForBodyWidth(renderParams.bodyWidth) * 1.08, 0.55, 2.2), 0.01);
    renderParams.spineCount = 0;
    renderParams.spineLength = 1;
    renderParams.colorSaturation = randomBetween(0.45, 0.95, 0.01);
    renderParams.patternComplexity = 1;
    bodySeed.lightness = randomBetween(16, 49, 1);
    bodySeed.limbColor = randomLimbColor(bodySeed.bodyColor, 18, 44, 16, Math.min(42, bodySeed.lightness + 2));
    lifeStage = 0;
    syncAfterGeneratedChange();
    syncLifeStageUi();
  }

  function evolveCurrent() {
    if (lifeStage >= EVOLVE_MAX_STAGE) {
      syncLifeStageUi();
      return;
    }
    var nextStage = lifeStage + 1;
    var rule = EVOLVE_RULES[nextStage];
    renderParams.bodyWidth = roundToStep(clamp(renderParams.bodyWidth * rule.bodyWidth, 0.65, 1.55), 0.01);
    renderParams.segmentWidth = roundToStep(clamp(renderParams.segmentWidth * rule.segmentWidth, 0.65, 1.45), 0.01);
    renderParams.spineNodes = roundToStep(clamp(renderParams.spineNodes + (Math.random() < 0.5 ? 3 : 2), 12, 36), 1);
    renderParams.headScale = roundToStep(clamp(Math.max(renderParams.headScale * rule.headScale, minHeadScaleForBodyWidth(renderParams.bodyWidth)), 0.55, 2.2), 0.01);
    renderParams.legLength1 = roundToStep(clamp(renderParams.legLength1 * rule.legLength1, 20, 58), 1);
    renderParams.legLength2 = roundToStep(clamp(renderParams.legLength2 * rule.legLength2, 18, 54), 1);
    renderParams.limbThickness = roundToStep(clamp(renderParams.limbThickness * rule.limbThickness, 0.55, 1.8), 0.01);
    renderParams.legGapRatio = rule.legGapRatio;
    if (renderParams.spineCount > 0) {
      renderParams.spineCount = roundToStep(clamp(renderParams.spineCount + randomBetween(2, 6, 1), 1, 40), 1);
      renderParams.spineLength = roundToStep(clamp(renderParams.spineLength + randomBetween(0.08, 0.28, 0.01), 0.35, 2.2), 0.01);
    } else if (Math.random() < 0.2) {
      renderParams.spineCount = randomBetween(4, 10, 1);
      renderParams.spineLength = randomBetween(0.45, 0.8, 0.01);
    }
    renderParams.patternComplexity = roundToStep(clamp(renderParams.patternComplexity + rule.patternComplexity, 1, 6), 1);
    renderParams.colorSaturation = roundToStep(clamp(renderParams.colorSaturation * rule.colorSaturation, 0.45, 2.2), 0.01);
    var lightGain = randomBetween(1, 4, 1);
    bodySeed.lightness = roundToStep(clamp((Number(bodySeed.lightness) || DEFAULT_SEED.lightness) + lightGain, 16, 58), 1);
    ["headColor", "bodyColor", "limbColor", "tailColor"].forEach(function(key) {
      if (bodySeed[key]) bodySeed[key] = shiftColorLightness(bodySeed[key], lightGain);
    });
    renderParams.moveSpeed = roundToStep(clamp(renderParams.moveSpeed * rule.moveSpeed, 0.35, 2.1), 0.01);
    renderParams.stepDistance = roundToStep(clamp(renderParams.stepDistance * rule.stepDistance, 24, 86), 1);
    renderParams.legFrequency = renderParams.moveSpeed;
    lifeStage = nextStage;
    syncAfterGeneratedChange();
    syncLifeStageUi();
  }

  function deriveBattleAttrs() {
    return {
      str: clamp(Math.round(8 + renderParams.bodyWidth * 8 + renderParams.limbThickness * 5), 1, 999),
      agi: clamp(Math.round(8 + renderParams.moveSpeed * 10 + renderParams.stepSpeed * 24), 1, 999),
      vit: clamp(Math.round(8 + renderParams.segmentWidth * 8 + renderParams.spineNodes * 0.45), 1, 999),
      int: clamp(Math.round(8 + renderParams.fovAngle * 5 + renderParams.fovDistance * 5), 1, 999),
      per: clamp(Math.round(8 + renderParams.fovClearDist / 45 + renderParams.fovMaxDist / 80), 1, 999),
      cha: clamp(Math.round(8 + renderParams.patternComplexity * 2 + renderParams.colorSaturation * 5), 1, 999)
    };
  }

  function selectedSkillCode() {
    var el = document.getElementById("select-skill");
    return (el && el.value ? el.value : "scratch:melee").split(":")[0];
  }

  async function importCurrentToBattle() {
    if (!btnImportBattle) return;
    var uid = Number(prompt("请输入导入目标用户ID", localStorage.getItem("rg_test_uid") || "1"));
    if (!uid) return;
    var key = prompt("请输入管理员密钥", localStorage.getItem("rg_admin_key") || "");
    if (!key) return;
    localStorage.setItem("rg_test_uid", String(uid));
    localStorage.setItem("rg_admin_key", key);
    btnImportBattle.disabled = true;
    if (importStatus) importStatus.textContent = "导入中...";
    try {
      var payload = {
        uid: uid,
        quality: clamp(1 + lifeStage, 1, 5),
        gender: Math.random() < 0.5 ? 1 : 2,
        level: Math.max(1, 1 + lifeStage * 5),
        stage: lifeStage,
        name: "组合测试_" + Date.now(),
        renderParams: copy(renderParams),
        bodySeed: copy(bodySeed),
        hiddenGene: hiddenGene,
        attrBases: deriveBattleAttrs(),
        skills: [selectedSkillCode()]
      };
      var resp = await fetch("/api/admin/test/create-pet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": key },
        body: JSON.stringify(payload)
      });
      var data = await resp.json();
      if (data.code !== 0) throw new Error(data.msg || "导入失败");
      var petId = data.data.petId;
      var leftId = localStorage.getItem("rg_battle_left_pet_id");
      var rightId = localStorage.getItem("rg_battle_right_pet_id");
      if (!leftId || (leftId && rightId)) {
        localStorage.setItem("rg_battle_left_pet_id", String(petId));
        leftId = String(petId);
      } else {
        localStorage.setItem("rg_battle_right_pet_id", String(petId));
        rightId = String(petId);
      }
      if (importStatus) importStatus.textContent = "已导入 petId=" + petId;
      if (confirm("导入成功，宠物ID：" + petId + "\n当前战斗槽位：左方=" + (leftId || "未设置") + "，右方=" + (rightId || "未设置") + "\n是否打开实时战斗测试页？")) {
        var qs = "?left=" + encodeURIComponent(leftId || petId) + (rightId ? "&right=" + encodeURIComponent(rightId) : "");
        location.href = "battle-debug.html" + qs;
      }
    } catch (err) {
      if (importStatus) importStatus.textContent = "导入失败";
      alert(err.message || err);
    } finally {
      btnImportBattle.disabled = false;
    }
  }



  function triggerSelectedSkill() {
    var el = document.getElementById("select-skill");
    var parts = (el && el.value ? el.value : "scratch:melee").split(":");
    renderer.triggerSkillTest(parts[0], parts[1]);
  }

  function addLightDots() {
    for (var i = 0; i < 5 && renderer.lightDots.length < renderer.MAX_LIGHT_DOTS; i++) {
      renderer.lightDots.push({
        x: 40 + Math.random() * Math.max(40, renderer._w - 80),
        y: 40 + Math.random() * Math.max(40, renderer._h - 80),
        vx: (Math.random() - 0.5) * renderer.LIGHT_DOT_SPEED * 2,
        vy: (Math.random() - 0.5) * renderer.LIGHT_DOT_SPEED * 2,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function onRenderSelectChange(value, field) {
    renderParams[field.key] = value;
    applyCurrentParams();
  }

  function onHiddenGeneChange(value) {
    hiddenGene = value;
    if (!value) {
      renderParams.colorSaturation = DEFAULT_RENDER.colorSaturation;
      renderParams.patternComplexity = DEFAULT_RENDER.patternComplexity;
      bodySeed = copy(DEFAULT_SEED);
    }
    applyCurrentParams();
  }

  btnAi.addEventListener("click", function() {
    renderer.toggleAI();
    syncAiButton();
  });
  btnReset.addEventListener("click", resetAll);
  btnRandomAppearance.addEventListener("click", randomizeAppearance);
  btnGenerateJuvenile.addEventListener("click", generateJuvenile);
  btnEvolve.addEventListener("click", evolveCurrent);
  if (btnImportBattle) btnImportBattle.addEventListener("click", importCurrentToBattle);

  renderPanel();
  createRenderer();
  syncLifeStageUi();
})();
