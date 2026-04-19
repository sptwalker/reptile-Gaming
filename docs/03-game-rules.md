# Web爬虫宠物养成游戏 - 全局数值规则字典

> 所有数值常量定义在 `server/models/game-rules.js`  
> 前端不做任何数值计算，仅展示服务端返回的结果  
> 本文档为数值策划的唯一权威来源

---

## 1. 品质体系

### 1.1 品质等级

| 等级 | 代码 | 名称 | 颜色 | 概率权重 |
|------|------|------|------|----------|
| 1 | QUALITY_COMMON | 普通 | #AAAAAA (灰) | 50 |
| 2 | QUALITY_FINE | 优秀 | #55FF55 (绿) | 30 |
| 3 | QUALITY_RARE | 稀有 | #5599FF (蓝) | 13 |
| 4 | QUALITY_EPIC | 史诗 | #CC66FF (紫) | 5 |
| 5 | QUALITY_LEGEND | 传说 | #FFAA00 (橙) | 2 |

### 1.2 品质影响

| 品质 | 天赋点范围 | 成长系数 | 技能栏上限 | 蜕变阶段上限 |
|------|-----------|---------|-----------|-------------|
| 普通 | 6~10 | 1.0 | 2 | 2 (成年) |
| 优秀 | 10~15 | 1.15 | 3 | 3 (完全体) |
| 稀有 | 14~20 | 1.3 | 3 | 3 |
| 史诗 | 18~26 | 1.5 | 4 | 3 |
| 传说 | 24~32 | 1.8 | 4 | 3 |

### 1.3 品质随机算法

```javascript
// 加权随机：weights = [50, 30, 13, 5, 2]，总和100
function rollQuality() {
    const roll = secureRandom(1, 100); // 服务端安全随机
    let acc = 0;
    for (let i = 0; i < QUALITY_WEIGHTS.length; i++) {
        acc += QUALITY_WEIGHTS[i];
        if (roll <= acc) return i + 1;
    }
    return 1;
}
```

---

## 2. 天赋系统

### 2.1 天赋点生成

孵化完成时，根据蛋品质随机生成天赋点总量：

```
talentPoints = randInt(TALENT_RANGE[quality].min, TALENT_RANGE[quality].max)
```

### 2.2 天赋分配规则

- 玩家自由分配天赋点到六维属性（STR/AGI/VIT/INT/PER/CHA）
- 每个属性最低分配 0 点，最高分配 `talentPoints` 点
- 所有属性分配之和必须 **恰好等于** `talentPoints`
- 天赋分配为 **一次性操作**，确认后不可修改
- 服务端校验：`sum(分配值) === talentPoints && 每项 >= 0`

### 2.3 天赋对属性的影响

天赋点直接写入 `pet_attr` 的 `{attr}_talent` 字段，参与衍生属性计算。

---

## 3. 属性公式

### 3.1 六维属性总值

```
属性总值 = base + talent
base = 初始值(5) + 等级成长 + 喂食累积
talent = 天赋分配值（固定不变）
```

### 3.2 等级成长

```
每级成长 = floor(GROWTH_PER_LEVEL * qualityFactor)
GROWTH_PER_LEVEL = 2
qualityFactor = QUALITY_GROWTH[quality]  // 见1.2品质影响
```

升级时，六维属性各自增加成长值（均匀成长，品质影响成长速率）。

### 3.3 衍生属性计算

| 衍生属性 | 公式 | 说明 |
|----------|------|------|
| hp_max | `VIT * 10 + STR * 3 + level * 5` | 生命上限 |
| atk | `STR * 3 + AGI * 1 + level * 2` | 攻击力 |
| def | `VIT * 2 + STR * 1 + level * 1` | 防御力 |
| spd | `AGI * 2 + PER * 1` | 速度 |
| crit_rate | `min(PER * 50 + AGI * 20, 5000)` | 暴击率（万分比，上限50%） |
| dodge_rate | `min(AGI * 40 + PER * 15, 4000)` | 闪避率（万分比，上限40%） |

### 3.4 属性对渲染的映射

| 属性 | 渲染参数 | 映射公式 |
|------|----------|----------|
| STR | bodyWidth | `BASE_WIDTH * (1 + STR * 0.01)` |
| STR | headScale | `BASE_HEAD * (1 + STR * 0.008)` |
| AGI | moveSpeed | `BASE_SPEED * (1 + AGI * 0.015)` |
| AGI | legFrequency | `BASE_FREQ * (1 + AGI * 0.02)` |
| VIT | spineNodes | `BASE_NODES + floor(VIT / 10)` |
| VIT | segmentWidth | `BASE_SEG * (1 + VIT * 0.005)` |
| INT | fovAngle | `BASE_FOV * (1 + INT * 0.01)` |
| PER | fovDistance | `BASE_FOV_DIST * (1 + PER * 0.02)` |
| CHA | colorSaturation | `BASE_SAT * (1 + CHA * 0.01)` |
| CHA | patternComplexity | `BASE_PATTERN + floor(CHA / 8)` |

---

## 4. 孵化规则

### 4.1 孵化时长

| 品质 | 基础时长（秒） | 实际范围 |
|------|---------------|---------|
| 普通 | 60 | 60s (1分钟) |
| 优秀 | 180 | 180s (3分钟) |
| 稀有 | 600 | 600s (10分钟) |
| 史诗 | 1800 | 1800s (30分钟) |
| 传说 | 3600 | 3600s (1小时) |

### 4.2 孵化流程

```
1. 玩家对未孵化的蛋调用 hatch/start
2. 服务端记录 hatch_start_at = now()
3. 玩家轮询或定时请求 hatch/status
4. 当 now() >= hatch_start_at + hatch_duration 时：
   a. 生成 talent_points（根据品质随机）
   b. 标记 is_hatched = 1
   c. 返回天赋分配界面
5. 玩家分配天赋点后调用 hatch/finish
6. 服务端创建 pet + pet_attr 记录
```

### 4.3 限制

- 同一时间只能孵化 **1个蛋**
- 孵化中不可取消
- 孵化完成后必须先分配天赋才能进行下一次孵化

---

## 5. 养成规则

### 5.1 喂食系统

| 食物 | 代码 | 饱食度恢复 | 经验值 | 金币消耗 | 特殊效果 |
|------|------|-----------|--------|---------|---------|
| 昆虫 | insect | +20 | +10 | 5 | 无 |
| 果实 | fruit | +30 | +15 | 10 | mood+5 |
| 肉块 | meat | +40 | +25 | 20 | STR临时+1(5min) |
| 活饵 | live_prey | +25 | +35 | 30 | AGI临时+1(5min) |
| 灵虫 | spirit_bug | +15 | +50 | 50 | 随机属性+1(永久) |

### 5.2 喂食规则

- 饱食度 ≤ 0 时无法喂食（需等待自然消化）
- 饱食度 > satiety_max 时无法喂食
- 喂食冷却：每次喂食后 **30秒** 内不可再次喂食
- 饱食度每 **10分钟** 自然下降 5 点
- 饱食度降至 0 后，心情每 **5分钟** 下降 10 点

### 5.3 经验与升级

```
升级所需经验 = BASE_EXP * level * (1 + level * 0.1)
BASE_EXP = 100

示例：
  Lv1 → Lv2: 100 * 1 * 1.1 = 110
  Lv5 → Lv6: 100 * 5 * 1.5 = 750
  Lv10→ Lv11: 100 * 10 * 2.0 = 2000
```

### 5.4 等级上限

| 蜕变阶段 | 等级上限 |
|----------|---------|
| 0 幼体 | 10 |
| 1 少年 | 25 |
| 2 成年 | 50 |
| 3 完全体 | 100 |

---

## 6. 蜕变规则

### 6.1 蜕变条件

| 阶段变化 | 等级要求 | 额外条件 |
|----------|---------|---------|
| 0→1 幼体→少年 | Lv10 | 无 |
| 1→2 少年→成年 | Lv25 | 任意属性总值 ≥ 30 |
| 2→3 成年→完全体 | Lv50 | 品质 ≥ 优秀，任意属性总值 ≥ 60 |

### 6.2 蜕变效果

- 等级上限提升（见5.4）
- 解锁新技能槽位
- 体力上限 +20
- 饱食度上限 +10
- 外观渲染参数变化（体型增大、花纹进化）
- 全属性 base +3 奖励

### 6.3 蜕变限制

- 蜕变为一次性操作，不可逆
- 蜕变消耗：100 * (目标阶段) 金币
- 蜕变时体力必须 ≥ 50

---

## 7. 体力系统

### 7.1 体力消耗

| 操作 | 体力消耗 |
|------|---------|
| 探索（移动/觅食） | 1/分钟 |
| 战斗（对战） | 10/场 |
| 训练（属性提升） | 5/次 |
| 蜕变 | 50 |

### 7.2 体力恢复

| 方式 | 恢复量 | 条件 |
|------|--------|------|
| 自然恢复 | 1/5分钟 | 始终生效 |
| 休息（手动） | 20/次 | 冷却30分钟 |
| 喂食（果实） | 5 | 喂食时附带 |
| 每日登录 | 全满 | 每日首次登录 |

### 7.3 体力规则

- 体力不可超过 `stamina_max`
- 体力为 0 时：不可探索、战斗、训练
- 体力为 0 时：仍可喂食、查看属性、社交

---

## 8. 经济系统

### 8.1 金币获取

| 来源 | 数量 | 频率限制 |
|------|------|---------|
| 每日登录 | 50 | 1次/天 |
| 喂食（首次/日） | 10 | 3次/天 |
| 升级奖励 | level * 20 | 每级1次 |
| 蜕变奖励 | stage * 100 | 每阶段1次 |
| 探索拾取 | 1~10（随机） | 无限制 |

### 8.2 金币消耗

| 用途 | 消耗 |
|------|------|
| 购买食物 | 见5.1食物表 |
| 蜕变费用 | 100 * 目标阶段 |
| 改名 | 20 |
| 购买装饰（预留） | 50~500 |

### 8.3 防刷规则

- 每日金币获取上限：**500**
- 探索拾取每小时上限：**50金币**
- 所有金币变动记录到 log 表
- 服务端校验余额，不信任前端传值

---

## 9. 外观种子系统（pattern_seed）

### 9.1 种子结构

```json
{
    "bodyHue": 120,           // 主体色相 (0~360)
    "bodyLightness": 40,      // 主体明度 (20~80)
    "patternType": 2,         // 花纹类型 (0无 1条纹 2斑点 3渐变)
    "patternHue": 60,         // 花纹色相
    "patternDensity": 3,      // 花纹密度 (1~5)
    "eyeColor": 30,           // 眼睛色相
    "tailRatio": 0.35,        // 尾部占比 (0.2~0.5)
    "headShape": 1            // 头型 (0圆 1三角 2方)
}
```

### 9.2 种子生成规则

- 蛋生成时由服务端随机产生
- 品质越高，颜色饱和度越高、花纹越复杂
- 种子一旦生成不可修改（保证宠物外观唯一性）
- 蜕变时在种子基础上叠加阶段修饰（由渲染层处理）

---

## 10. 常量汇总

```javascript
// server/models/game-rules.js 核心常量
module.exports = {
    // 品质
    QUALITY_COMMON: 1, QUALITY_FINE: 2, QUALITY_RARE: 3,
    QUALITY_EPIC: 4, QUALITY_LEGEND: 5,
    QUALITY_WEIGHTS: [50, 30, 13, 5, 2],
    QUALITY_GROWTH: { 1: 1.0, 2: 1.15, 3: 1.3, 4: 1.5, 5: 1.8 },

    // 天赋
    TALENT_RANGE: {
        1: { min: 6, max: 10 },   2: { min: 10, max: 15 },
        3: { min: 14, max: 20 },  4: { min: 18, max: 26 },
        5: { min: 24, max: 32 }
    },

    // 孵化
    HATCH_DURATION: { 1: 60, 2: 180, 3: 600, 4: 1800, 5: 3600 },

    // 成长
    GROWTH_PER_LEVEL: 2,
    BASE_EXP: 100,
    INIT_ATTR_BASE: 5,
    LEVEL_CAP: { 0: 10, 1: 25, 2: 50, 3: 100 },

    // 蜕变
    EVOLVE_LEVEL: { 1: 10, 2: 25, 3: 50 },
    EVOLVE_COST: { 1: 100, 2: 200, 3: 300 },
    EVOLVE_STAMINA_REQ: 50,

    // 体力
    STAMINA_REGEN_INTERVAL: 300,  // 5分钟
    STAMINA_REGEN_AMOUNT: 1,
    REST_COOLDOWN: 1800,          // 30分钟
    REST_AMOUNT: 20,

    // 饱食
    SATIETY_DECAY_INTERVAL: 600,  // 10分钟
    SATIETY_DECAY_AMOUNT: 5,
    FEED_COOLDOWN: 30,            // 30秒

    // 经济
    DAILY_GOLD_CAP: 500,
    HOURLY_EXPLORE_GOLD_CAP: 50,
    DAILY_LOGIN_GOLD: 50,
    RENAME_COST: 20,

    // 技能栏上限
    SKILL_SLOTS: { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 },

    // 蜕变阶段上限
    MAX_STAGE: { 1: 2, 2: 3, 3: 3, 4: 3, 5: 3 }
};
```
