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
