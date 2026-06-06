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
  window.__lab = renderer; // 调试句柄：便于控制台/自动化检视渲染器状态

  var stageIndex = 0;
  var autoTimer = null;

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
    serpPanel: document.getElementById('serpPanel'),
    genesis: document.getElementById('genesisText')
  };

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
    el.serpPanel.hidden = stage.key !== 'serpentine';
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

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { stopAuto(); goTo(stageIndex - 1); }
    else if (e.key === 'ArrowRight') { stopAuto(); goTo(stageIndex + 1); }
  });

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

  // 蛇形波调节滑块（第7步）：实时改 serpentineAmp/Freq/Speed 并显示当前值
  function bindSerp(id, key, valId, digits) {
    var input = document.getElementById(id);
    var out = document.getElementById(valId);
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      var patch = {}; patch[key] = v;
      renderer.setParams(patch);
      out.textContent = v.toFixed(digits);
    });
  }
  bindSerp('pSerpAmp', 'serpentineAmp', 'vSerpAmp', 1);
  bindSerp('pSerpFreq', 'serpentineFreq', 'vSerpFreq', 2);
  bindSerp('pSerpSpeed', 'serpentineSpeed', 'vSerpSpeed', 2);

  var fallbackGenesis =
    '我想在此玩法基础上设计一套灵活的可供玩家自由拼装、自我AI进化的爬虫生物生成网络游戏系统……\n' +
    '（完整内容见项目根目录 prompt.txt）';
  fetch('../prompt.txt')
    .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
    .then(function (t) { el.genesis.textContent = t; })
    .catch(function () { el.genesis.textContent = fallbackGenesis; });

  // 全屏自适应：匹配画布绘制缓冲到视口尺寸
  function fit() { renderer.resize(); }
  window.addEventListener('resize', fit);
  fit();

  goTo(0);
  renderer.play();
  el.btnPlay.textContent = '⏸ 暂停动画';

  var wasPlayingBeforeHidden = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      wasPlayingBeforeHidden = !!renderer._rafId;
      renderer.pause();
    } else if (wasPlayingBeforeHidden) {
      renderer.play();
      el.btnPlay.textContent = '⏸ 暂停动画';
    }
  });
})();
