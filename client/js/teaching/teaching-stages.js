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
