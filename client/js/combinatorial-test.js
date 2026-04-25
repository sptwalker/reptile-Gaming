"use strict";

(function() {
  var canvas = document.getElementById("testCanvas");
  var sectionsEl = document.getElementById("paramSections");
  var btnAi = document.getElementById("btnAi");
  var btnReset = document.getElementById("btnReset");
  var btnRandomAppearance = document.getElementById("btnRandomAppearance");
  var modeText = document.getElementById("modeText");

  if (!canvas || !sectionsEl || typeof LizardRenderer === "undefined") return;

  var DEFAULT_RENDER = {
    spineNodes: 22,
    bodyWidth: 1,
    segmentWidth: 1,
    headScale: 1,
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
    patternType: "spots",
    patternColor: "rgba(38,68,28,0.55)"
  };

  var DEFAULT_SEED = {
    hue: 110,
    lightness: 32,
    headColor: "#5f8f3f",
    bodyColor: "#3d6b2e",
    tailColor: "#284d1f",
    eyeColor: "#ff8800",
    patternColor: "rgba(38,68,28,0.55)"
  };
  var renderParams = copy(DEFAULT_RENDER);
  var bodySeed = copy(DEFAULT_SEED);
  var hiddenGene = "";
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
        range("头部可旋转角度", "headRotationLimit", 0, 300, 1)
      ])
    ]),
    card("皮肤颜色区", [
      group("基础色", [
        color("头部", "headColor"),
        color("躯干", "bodyColor"),
        color("尾部", "tailColor"),
        color("眼睛", "eyeColor"),
        range("色相", "hue", 0, 360, 1, "seed"),
        range("明度", "lightness", 16, 58, 1, "seed"),
        range("饱和倍率", "colorSaturation", 0.45, 2.2, 0.01)
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
    if (field.source === "seed") bodySeed[field.key] = value;
    else if (field.source === "renderer") renderer.setActivity(value);
    else {
      renderParams[field.key] = value;
      if (field.key === "moveSpeed") renderParams.legFrequency = value;
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

  function rgbaToHex(value) {
    if (!value || value.charAt(0) === "#") return value || "#3d6b2e";
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

  function resetAll() {
    renderParams = copy(DEFAULT_RENDER);
    bodySeed = copy(DEFAULT_SEED);
    hiddenGene = "";
    createRenderer();
    renderPanel();
  }

  function randomBetween(min, max, step) {
    var count = Math.round((max - min) / step);
    return Number((min + Math.floor(Math.random() * (count + 1)) * step).toFixed(4));
  }

  function randomColor() {
    return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  }

  function randomizeAppearance() {
    controls[0].groups.forEach(function(g) {
      g.fields.forEach(function(field) {
        if (field.type !== "range") return;
        setValue(field, randomBetween(field.min, field.max, field.step));
      });
    });
    bodySeed.headColor = randomColor();
    bodySeed.bodyColor = randomColor();
    bodySeed.tailColor = randomColor();
    bodySeed.eyeColor = randomColor();
    bodySeed.patternColor = randomColor();
    renderParams.patternColor = bodySeed.patternColor;
    renderParams.patternType = ["spots", "speckles", "horizontal_stripes", "vertical_stripes", "camo", "clean"][Math.floor(Math.random() * 6)];
    hiddenGene = "";
    applyCurrentParams();
    renderPanel();
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

  renderPanel();
  createRenderer();
})();
