/**
 * animation-lab.js — 教学页控制器
 * 编排 TeachingRenderer + 13 阶段：时间轴(带简短标题)、上一步/下一步、播放/暂停、
 * 调速、自动演进、第12步参数面板。不含任何游戏/网络逻辑。
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
    card: document.getElementById('card'),
    title: document.getElementById('cardTitle'),
    prompt: document.getElementById('cardPrompt'),
    timeline: document.getElementById('timeline'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnPlay: document.getElementById('btnPlay'),
    btnAuto: document.getElementById('btnAuto'),
    selSpeed: document.getElementById('selSpeed'),
    paramPanel: document.getElementById('paramPanel'),
    serpPanel: document.getElementById('serpPanel'),
    chkAuto: document.getElementById('chkAuto')
  };

  // 提示词模式：每环节先显示提示词板（动画暂停、画布隐藏），按空格后隐藏提示词板并播放动画
  var promptMode = true;
  function updatePanels() {
    var stage = STAGES[stageIndex];
    el.paramPanel.hidden = promptMode || !stage.features.params;
    el.serpPanel.hidden = promptMode || stage.key !== 'serpentine';
  }
  function showPrompt() {
    promptMode = true;
    el.card.hidden = false;
    canvas.style.visibility = 'hidden';
    renderer.pause();
    el.btnPlay.textContent = '▶ 播放动画';
    updatePanels();
  }
  function revealAnimation() {
    if (!promptMode) return;
    promptMode = false;
    el.card.hidden = true;
    canvas.style.visibility = 'visible';
    renderer.play();
    el.btnPlay.textContent = '⏸ 暂停动画';
    updatePanels();
  }

  STAGES.forEach(function (s, i) {
    var b = document.createElement('button');
    b.textContent = i + ' ' + s.short;
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
    Array.prototype.forEach.call(el.timeline.children, function (btn, idx) {
      btn.classList.toggle('active', idx === stageIndex);
    });
    showPrompt(); // 切到新环节：先显示提示词板，待空格再播放动画
  }

  el.btnPrev.addEventListener('click', function () { stopAuto(); goTo(stageIndex - 1); });
  el.btnNext.addEventListener('click', function () { stopAuto(); goTo(stageIndex + 1); });

  el.btnPlay.addEventListener('click', function () {
    if (promptMode) { revealAnimation(); return; } // 提示词板期间“播放”=显示动画
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
    goTo(0); revealAnimation(); // 自动演进：连续播放动画，不在每步等待空格
    autoTimer = setInterval(function () {
      if (stageIndex >= STAGES.length - 1) { stopAuto(); return; }
      goTo(stageIndex + 1); revealAnimation();
    }, 3500);
  });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); revealAnimation(); }
    else if (e.key === 'ArrowLeft') { stopAuto(); goTo(stageIndex - 1); }
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

  // 顶部“自动游走”开关：关闭则蜥蜴原地待命（仅响应鼠标牵引/放置食物），打开才会自动漫游
  el.chkAuto.addEventListener('change', function () { renderer.setAutoWander(el.chkAuto.checked); });
  renderer.setAutoWander(el.chkAuto.checked);

  // 全屏自适应：匹配画布绘制缓冲到视口尺寸
  function fit() { renderer.resize(); }
  window.addEventListener('resize', fit);
  fit();

  goTo(0); // 初始：显示第0步提示词板，按空格后播放动画

  var wasPlayingBeforeHidden = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      wasPlayingBeforeHidden = !!renderer._rafId;
      renderer.pause();
    } else if (wasPlayingBeforeHidden && !promptMode) {
      renderer.play();
      el.btnPlay.textContent = '⏸ 暂停动画';
    }
  });
})();
