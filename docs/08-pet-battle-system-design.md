# Web爬虫宠物养成游戏 - 宠物战斗系统完整策划案

> 本文档整理《宠物战斗系统强化开发方案》P1-P11 的最终实现、系统策划、技术边界、验证方式、可完善点与公共模块抽取建议。  
> 战斗系统以 `server/services/battle-engine.js` 为运行权威，以 `server/models/battle-action-contracts.js` 为动作协议权威，以 `server/models/game-rules.js` 为数值权威。  
> 前端仅负责展示、动画映射与调试可视化，不参与可信战斗判定。

---

## 1. 设计目标

### 1.1 核心目标

宠物战斗系统的目标不是简单的属性对撞，而是建立一个可扩展、可验证、可调参的半实时战斗模拟系统：

1. **服务端权威**：战斗判定、数值计算、随机、AI 决策全部在服务端完成。
2. **帧级模拟**：以 30FPS 推进战斗，支持动作阶段、冷却、体力恢复、状态衰减与位置变化。
3. **动作协议化**：所有动作具有统一协议字段，前后端围绕同一套动作语义进行模拟和展示。
4. **策略化 AI**：AI 不只按最近距离攻击，而是根据性格、生命、体力、恐惧、声音、对手模型和战术目标决策。
5. **身体部位战斗**：伤害落到部位，部位损伤会反向影响视野、转身、移动、技能使用和行为稳定性。
6. **信息博弈**：脚步、假声、听觉捕获、搜索和误导会影响 AI 行为。
7. **可调试可验收**：`battle-debug` 能实时查看单位状态、事件、统计，并能批量测试验证新系统。

### 1.2 非目标

当前版本暂不追求：

- 玩家实时手操战斗。
- 多单位混战。
- 网络同步帧回滚。
- 前端可信判定。
- 完整技能编辑器。
- 战斗录像长期持久化的高压缩格式优化。

---

## 2. 技术边界与权威来源

| 类型 | 权威文件 | 说明 |
|------|----------|------|
| 战斗模拟 | `server/services/battle-engine.js` | 负责创建战斗、逐帧推进、AI、动作执行、伤害、摘要。 |
| 动作协议 | `server/models/battle-action-contracts.js` | 定义动作时长、阶段、范围、体力、冷却、护甲、反制窗口等。 |
| 数值规则 | `server/models/game-rules.js` | 定义战斗公式、体力、部位、AI、地图、技能效果等数值。 |
| 动画映射 | `server/services/battle-animation-mapper.js` | 将服务端事件映射成前端可播放的动作/特效事件。 |
| 调试服务 | `server/services/battle-debug-service.js` | 提供内存会话、步进、批量测试和报告。 |
| 调试路由 | `server/routes/battle-debug.js` | 提供 `/api/battle-debug/*` 调试接口。 |
| 前端展示镜像 | `client/js/battle-action-contracts.js` | 仅用于展示和动画，不作为权威判定。 |
| 调试面板 | `client/js/battle-debug.js` | 展示实时状态、事件日志、批量报告。 |
| 战斗动画 | `client/js/battle-animator.js`、`client/js/lizard-battle-adapter.js` | 播放压缩帧、动作事件和蜥蜴渲染。 |

---

## 3. P1-P11 功能回顾

### P1：动作协议扩展

已完成统一动作协议字段：

- `actionId`
- `type`
- `duration`
- `windup`
- `impact`
- `recover`
- `pose`
- `priority`
- `maxRange`
- `staminaCost`
- `cooldown`
- `interruptible`
- `armor`
- `counterWindow`
- `rootMotion`
- `tags`

第一批基础动作已落地：

- 攻击：`quick_snap`、`bite`、`combo_bite`、`heavy_bite`
- 防御：`guard`、`brace`
- 反应/移动：`dodge`、`retreat_step`、`flank_step`
- 信息/欺骗：`listen_alert`、`search_sound`、`fake_sound`、`tail_decoy`
- 原有技能：`scratch`、`tail_whip`、`venom_spit`、`dragon_rush` 等已接入协议。

### P2：移除无成本普通攻击

已将普通攻击虚拟技能化：

- `quick_snap`：快速低消耗起手。
- `bite`：基础核心近战。

战斗中不再存在无冷却、无体力成本、无协议的默认攻击。

### P3：体力与冷却系统

已完成：

- 每个动作按协议消耗 `staminaCost`。
- 每个技能按协议或效果配置进入 `cooldown`。
- 低体力时仅允许低成本动作。
- 战斗体力每秒自然恢复。
- `actionEconomy` 记录：
  - `spent`
  - `recovered`
  - `blockedByStamina`

### P4：动作阶段与打断窗口

已完成动作生命周期：

1. `windup`：起手。
2. `impact`：命中/效果发生区间。
3. `recover`：收招。
4. `done`：结束。

服务端实时维护：

- `activeAction`
- `phase`
- `startFrame`
- `impactFrame`
- `endFrame`
- `interruptible`

并产生 `action_phase` 事件给前端和调试页。

### P5：防御与反制

已完成：

- `guard`、`brace` 等防御动作具备 `armor`。
- 攻击命中防御动作时按护甲减伤。
- 命中反制窗口时触发 `counter`。
- 统计：
  - `blocks`
  - `blockedDamage`
  - `counters`
- 事件：
  - `defense_ready`
  - `guard_block`
  - `counter`

### P6：AI 技能评分系统增强

AI 技能选择已综合：

- 性格维度：`aggression`、`risk`、`caution`、`mobility`、`cunning`、`ferocity`、`skill`、`hearing`
- 生命比例。
- 体力比例。
- 距离。
- 技能意图。
- 动作标签。
- 绕后暴露。
- 对手模型。
- 冷却和体力合法性。

技能不再只是按可用性随机释放，而是通过 `_skillScore()` 评分后选择。

### P7：高层策略意图

已建立策略意图集合：

- `pressure`：压制。
- `execute`：处决。
- `defend`：防守。
- `kite`：拉扯。
- `ambush`：绕后/伏击。
- `bait`：诱骗。
- `observe`：观察。
- `recover`：恢复。
- `fear`：恐惧逃离。
- `idle`：待机。

每次 AI 决策都会记录：

- `strategyIntent`
- `strategyReason`
- `strategyTrace`
- `strategy_intent` 事件

### P8：身体部位伤害战术化

已完成身体部位系统：

| 部位 | 战术意图 | 战斗影响 |
|------|----------|----------|
| `head` | `disable_sense` | 影响视野、转头、感知。 |
| `torso` | `core_kill` | 影响核心生命、移动和技能使用。 |
| `foreLeft` / `foreRight` | `cripple_mobility` | 影响移动与控制。 |
| `hindLeft` / `hindRight` | `cripple_mobility` | 影响移动与控制。 |
| `tail` | `remove_decoy` | 影响尾部诱饵，重伤后可断尾。 |

部位选择会结合：

- 部位权重。
- 部位剩余生命。
- 部位防御。
- 是否核心部位。
- 攻击角度。
- 当前策略意图。
- 攻击者性格。

### P9：信息博弈系统

已完成脚步、声音和听觉捕获：

- 快速移动会产生 `sound` 事件。
- 地形影响声音传播。
- `PER`、头部伤势和性格听觉影响听力范围。
- 听到声音会产生 `perception` 事件。
- 假声会误导 `lastKnownTargetX/Y`。
- AI 可进入 `alert` 或 `searching` 状态。
- 感知技能：`listen_alert`、`search_sound`。
- 欺骗技能：`fake_sound`、`tail_decoy`。

统计字段：

- `heard`
- `fakeHeard`
- `misled`
- `infoSkills`

### P10：对手建模与适应性 AI

AI 已维护对手模型：

- `actions`
- `skills`
- `attacks`
- `defenses`
- `movement`
- `tricks`
- `perceptions`
- `lastIntent`
- `lastSkill`
- `intentTrace`
- `aggression`
- `defense`
- `mobility`
- `deception`
- `observation`

模型会影响后续评分：

- 对手攻击倾向高：提高防御、拉扯权重。
- 对手防御倾向高：提高绕后权重。
- 对手观察低：提高诱骗权重。
- 对手欺骗高：降低盲目压制权重。

### P11：`battle-debug` 完整验证面板

已完成后端与前端调试扩展：

- 实时展示：
  - 体力经济。
  - 防御与反制。
  - 策略意图。
  - 动作阶段。
  - 冷却与体力成本。
  - 信息统计。
  - 对手模型。
  - 部位战术。
- 事件日志支持：
  - `action_phase`
  - `strategy_intent`
  - `guard_block`
  - `counter`
  - `perception`
  - `sound`
  - `skill_hit`
- 批量报告支持：
  - `strategyAvg`
  - `targetPartsAvg`
  - `targetTacticsAvg`
  - `infoAvg`
  - `opponentModelAvg`
  - `avgBlocks`
  - `avgBlockedDamage`
  - `avgCounters`
  - `avgStaminaSpent`
  - `avgStaminaBlocked`

---

## 4. 战斗流程策划

### 4.1 创建战斗

入口：`battleEngine.createBattle()`。

流程：

1. 根据 `mapId` 选择竞技场地图。
2. 使用宠物、属性、技能和性格创建左右单位。
3. 应用地图增益。
4. 初始化身体部位。
5. 初始化感知范围。
6. 初始化统计对象。

### 4.2 单帧推进

入口：`battleEngine.stepBattle()`。

每帧顺序：

1. 每秒处理恐惧衰减。
2. 每秒刷新感知。
3. 每秒衰减警觉。
4. 每秒恢复部位生命。
5. 每秒恢复战斗体力。
6. 更新断尾诱饵剩余时间。
7. 更新身体损伤影响。
8. 更新朝向。
9. 更新 buff。
10. 更新技能冷却。
11. 更新动作阶段。
12. 更新 AI 状态机。
13. 左右单位各自决策。
14. 观察对方决策并更新对手模型。
15. 执行动作。
16. 追加派生动画事件。
17. 按间隔记录战斗帧。
18. 判断合法结束。

### 4.3 战斗结束

结束条件：

- 左方核心生命归零。
- 右方核心生命归零。
- 双方同时归零。
- 达到 `BATTLE_MAX_FRAMES`，按剩余生命比例判定。

输出：

- `winner`
- `reason`
- `frames`
- `summary`

---

## 5. 战斗单位设计

战斗单位由 `_createUnit()` 创建，核心字段包括：

### 5.1 基础信息

- `side`
- `petId`
- `name`
- `quality`
- `stage`
- `attr`
- `personality`

### 5.2 战斗属性

- `maxHp`
- `hp`
- `atk`
- `def`
- `spd`
- `crit`
- `dodge`
- `battleStamina`
- `maxBattleStamina`

### 5.3 空间状态

- `x`
- `y`
- `facing`
- `angularVelocity`
- `moveTarget`
- `flankTarget`
- `protectTarget`

### 5.4 行为状态

- `aiState`
- `aiSubState`
- `strategyIntent`
- `strategyReason`
- `strategyTrace`
- `activeAction`
- `skills`
- `buffs`

### 5.5 损伤状态

- `bodyParts`
- `canUseSkills`
- `headCanMove`
- `visionMult`
- `headTurnMult`
- `stepMult`
- `limbMoveMult`
- `moveControl`
- `spinChance`

### 5.6 信息状态

- `perception`
- `infoStats`
- `opponentModel`

---

## 6. 数值系统

### 6.1 战斗帧率与时长

| 字段 | 含义 | 当前值 |
|------|------|--------|
| `BATTLE_FPS` | 模拟帧率 | 30 |
| `BATTLE_BASE_FRAMES` | 基础战斗时长 | 1800 |
| `BATTLE_MAX_FRAMES` | 最大战斗时长 | 3600 |

### 6.2 衍生属性

| 属性 | 公式 |
|------|------|
| HP | `VIT × BATTLE_HP_VIT + STR × BATTLE_HP_STR + level × BATTLE_HP_LVL`，当前实际核心生命由身体核心部位汇总。 |
| ATK | `STR × BATTLE_ATK_STR + AGI × BATTLE_ATK_AGI + level × BATTLE_ATK_LVL` |
| DEF | `VIT × BATTLE_DEF_VIT + STR × BATTLE_DEF_STR + level × BATTLE_DEF_LVL` |
| SPD | `AGI × BATTLE_SPD_AGI + PER × BATTLE_SPD_PER` |
| Crit | `BATTLE_CRIT_BASE + PER × 0.005` |
| Dodge | `BATTLE_DODGE_BASE + AGI × 0.005` |

### 6.3 伤害公式

核心流程：

1. 基础攻击：`attacker.atk × skillMulti × angleBonus.dmgBonus`。
2. 部位防御：`defender.def + part.def`。
3. 防御减伤：`1 - totalDef / (totalDef + BATTLE_DEF_CONSTANT)`。
4. 随机浮动：`±BATTLE_DAMAGE_FLOAT`。
5. 体力耗尽惩罚：`BATTLE_STA_EMPTY_PENALTY`。
6. 暴击倍率：`BATTLE_CRIT_MULTI`。
7. 防御动作护甲二次减伤。

### 6.4 体力系统

- 初始战斗体力：`pet.stamina × BATTLE_STA_MULTIPLIER`。
- 每秒恢复：`BATTLE_STA_REGEN_PER_SEC`。
- 无体力时高成本动作会被拦截。
- 体力耗尽时仍可能执行低成本动作，但攻击伤害降低。

---

## 7. 动作协议策划

### 7.1 协议字段

| 字段 | 策划含义 |
|------|----------|
| `actionId` | 动作唯一编码。 |
| `type` | 动作类型，如 `melee`、`projectile`、`defense`、`movement`、`trick`。 |
| `duration` | 总持续帧数。 |
| `windup` | 起手帧。 |
| `impact` | 主要效果发生帧或区间参考帧。 |
| `recover` | 收招帧。 |
| `pose` | 前端姿态。 |
| `priority` | 展示/动作优先级。 |
| `maxRange` | 最大作用距离。 |
| `staminaCost` | 战斗体力消耗。 |
| `cooldown` | 冷却帧。 |
| `interruptible` | 是否可被打断。 |
| `armor` | 动作期间护甲减伤。 |
| `counterWindow` | 反制窗口。 |
| `rootMotion` | 根运动，如突进、后撤、侧移。 |
| `tags` | AI 和展示标签。 |

### 7.2 动作类型与技能效果类型

当前系统存在两套相近但不完全相同的类型：

- 动作协议类型：定义动作表现和时序，如 `projectile`、`charge`。
- 技能效果类型：定义战斗效果执行方式，如 `ranged`、`melee`、`defense`。

策划上应明确：

- `battle-action-contracts.js` 负责“动作如何发生”。
- `BATTLE_SKILL_EFFECTS` 负责“动作造成什么效果”。
- 同一技能应同时存在动作协议和效果配置。
- 后续建议增加一致性校验，确保每个技能效果都有对应动作协议。

---

## 8. AI 策划

### 8.1 性格维度

| 字段 | 含义 |
|------|------|
| `aggression` | 主动压制欲望。 |
| `risk` | 冒险程度。 |
| `caution` | 谨慎程度。 |
| `mobility` | 机动倾向。 |
| `cunning` | 诡诈、绕后和诱骗倾向。 |
| `ferocity` | 凶猛和恐惧压迫倾向。 |
| `skill` | 技能使用熟练度。 |
| `hearing` | 听觉敏锐度。 |

### 8.2 状态机

当前 AI 状态：

- `aggressive`
- `kiting`
- `defensive`
- `fear`
- `alert`
- `searching`

状态由生命、恐惧、性格、听觉记忆和假声误导共同决定。

### 8.3 高层策略

AI 决策先形成策略意图，再选择移动或技能。这样可以让批量报告看到“为什么这样打”，而不仅是“用了什么技能”。

### 8.4 对手建模

对手模型是当前 AI 的自适应基础。它不直接读取对手隐藏意图，而是根据对方实际决策累积行为画像。该设计符合服务端权威和可解释 AI 方向。

---

## 9. 身体部位策划

### 9.1 部位生命

身体核心生命由核心部位共同决定，非核心尾部不直接决定死亡，但影响诱饵和战术。

### 9.2 部位损伤影响

| 损伤 | 影响 |
|------|------|
| 头部重伤 | 降低视野和转身。 |
| 头部失效 | 视野几乎禁用，头部不可正常朝向。 |
| 躯干重伤 | 降低步伐效率。 |
| 躯干失效 | 几乎无法行动或使用技能。 |
| 四肢重伤 | 降低移动效率。 |
| 四肢断裂 | 降低控制，增加旋转/失稳概率。 |
| 尾部重伤 | 断尾并触发诱饵效果。 |

### 9.3 部位战术

部位目标不是纯随机，而是结合策略选择：

- `execute` 更偏核心部位。
- `ambush` 更偏头部/躯干。
- `kite` 更偏后肢和尾部。
- `defend` 更偏前肢。
- `bait` 更关注尾部诱饵相关部位。

---

## 10. 空间与绕后策划

### 10.1 朝向

单位持续转向对手，转向速度受：

- 基础转身速度。
- 性格机动性。
- 头部损伤。

### 10.2 攻击角度

攻击分区：

- `front`：正面。
- `side`：侧面。
- `rear`：背后。

背后和侧面提供：

- 伤害加成。
- 命中/暴击加成。
- 部位选择倾向变化。

### 10.3 绕后行为

AI 会在下列情况下尝试绕后：

- 性格 `cunning`、`mobility` 较高。
- 距离不超过 `BATTLE_FLANK_MAX_DIST`。
- 当前绕后分数不足。
- 对手防御倾向较高。

---

## 11. 信息博弈策划

### 11.1 声音来源

声音可以来自：

- 快速移动脚步。
- 失控旋转。
- 假声技能。
- 部分高噪声技能。

### 11.2 听觉捕获

听觉捕获考虑：

- 声音半径。
- 传播衰减。
- 地形倍率。
- 宠物 `PER`。
- 性格 `hearing`。
- 头部损伤。

### 11.3 假声误导

假声会生成错误位置，并让目标进入搜索或误判状态。AI 可通过 `listen_alert` 和 `search_sound` 提高置信度。

---

## 12. 事件系统

### 12.1 核心战斗事件

| 事件 | 含义 |
|------|------|
| `strategy_intent` | 策略意图变化。 |
| `action_phase` | 动作开始及阶段信息。 |
| `skill_hit` | 技能命中。 |
| `dodge` | 闪避。 |
| `tail_decoy` | 尾部诱饵规避。 |
| `guard_block` | 防御格挡。 |
| `counter` | 反制。 |
| `defense_ready` | 防御动作就绪。 |
| `heal` | 治疗。 |
| `buff` | Buff 生效。 |
| `fear` | 恐惧技能。 |
| `sound` | 声音传播。 |
| `perception` | 感知捕获或搜索。 |
| `limb_detach` | 肢体断裂。 |
| `tail_detach` | 断尾。 |
| `spin` | 失控旋转。 |

### 12.2 派生动画事件

`battle-animation-mapper.js` 会生成：

- `movement`
- `combat_action`
- `perception_action`
- `visual_fx`

前端动画应优先消费派生事件，普通业务事件作为日志和调试来源。

---

## 13. 调试与验收设计

### 13.1 实时调试

`battle-debug` 支持：

- 选择两只宠物。
- 选择地图。
- 指定左右 AI 性格或随机性格。
- 创建战斗会话。
- 单帧/多帧步进。
- 自动播放。
- 重置和结束。

### 13.2 批量测试

批量测试用于验证概率系统和 AI 倾向：

- 胜率。
- 平均帧数。
- 平均伤害。
- 命中、暴击、闪避。
- AI 状态分布。
- 策略意图分布。
- 部位攻击分布。
- 部位战术分布。
- 信息博弈统计。
- 对手模型均值。
- 防御/反制均值。
- 体力经济均值。
- 角度攻击分布。

### 13.3 验收重点

每次修改战斗系统后至少检查：

1. `battle-debug` 能启动战斗。
2. 步进后 `activeAction`、`strategy`、`events` 正常变化。
3. 批量测试能生成完整报告。
4. 报告包含 P1-P11 关键指标。
5. 正式竞技场仍可调用 `battleEngine.simulate()`。

---

## 14. 当前实现检查结论

### 14.1 已完成度

从 P1-P11 目标看，当前系统已覆盖主要设计目标：

- 动作协议完成。
- 普通攻击技能化完成。
- 体力/冷却完成。
- 动作阶段完成。
- 防御/反制完成。
- AI 技能评分完成。
- 高层策略意图完成。
- 部位伤害战术完成。
- 信息博弈完成。
- 对手建模完成。
- `battle-debug` 验证面板完成。

### 14.2 当前可接受的实现特点

- 服务端为唯一权威。
- 随机使用 `secureRandomFloat()` / `secureRandom()`。
- `battle-engine` 输出包含调试所需关键字段。
- 正式竞技场、后台测试和调试服务均复用同一战斗引擎。
- `battle-debug` 批量测试能覆盖复杂系统趋势。

### 14.3 需要注意但不阻塞的问题

1. `battle-engine.js` 体量较大，已集中承载多个子系统，后续维护成本会上升。
2. 动作协议类型与技能效果类型存在语义映射，需要增加一致性检查或文档约束。
3. 前端动作协议镜像需要人工同步，未来可能产生漂移。
4. 批量统计聚合函数当前只在 `battle-debug-service.js` 内部使用，后续正式战报如果扩展会重复。
5. `_loadFighter()` 与正式战斗/后台测试的数据装配逻辑存在复用空间。
6. `game-rules.js` 中战斗配置已非常丰富，后续可按领域拆分配置或生成文档。
7. 当前 `combo_bite` 协议含 `hits: 2`，但引擎攻击执行仍按单次命中处理，后续如要真实多段命中需补充实现。
8. `reaction` 类型动作如 `dodge` 已有协议和效果，但目前更偏 buff/技能使用，尚未形成完整被动反应动作系统。
9. 部分高级技能如隐藏基因技能已配置效果，但需要继续通过批量测试校准强度。

---

## 15. 公共模块抽取建议

当前不建议立即大规模重构，但建议下一轮维护按以下顺序拆分。拆分时应保持外部接口 `simulate()`、`createBattle()`、`stepBattle()`、`getBattleState()` 不变。

### 15.1 `server/services/battle-action-runtime.js`

建议抽取：

- `_actionPhase()`
- `_startActiveAction()`
- `_tickActiveAction()`
- `_canStartAction()`
- `_defenseState()`
- `_actionCooldown()`
- `_actionStaminaCost()`
- `_hasActionStamina()`
- `_actionMaxRange()`

收益：动作经济和动作时序成为独立模块，便于单元测试。

### 15.2 `server/services/battle-geometry.js`

建议抽取：

- `normalizeAngle()`
- `_shortestAngleDiff()`
- `_angleTo()`
- `getForwardCone()`
- `getRearArc()`
- `isAngleInArc()`
- `isInFrontArc()`
- `isInRearArc()`
- `flankScore()`
- `angleAttackBonus()`
- `_battleDist()`
- `_arenaBounds()`
- `_clampPoint()`

收益：空间、朝向、地图边界和绕后判断可复用于 AI、动画、测试。

### 15.3 `server/services/battle-body-system.js`

建议抽取：

- `_createBodyParts()`
- `_makeBodyPart()`
- `_calcBodyHp()`
- `_syncBodyHp()`
- `_partLossRatio()`
- `weakPointExposure()`
- `_targetPartIntent()`
- `_partTacticalWeight()`
- `_recordTargetPart()`
- `_pickTargetPart()`
- `_recoverBodyParts()`
- `_updateBodyImpairments()`
- `_snapshotBodyParts()`
- `_applyPartDamage()`

收益：部位伤害可以独立调参和测试。

### 15.4 `server/services/battle-perception-system.js`

建议抽取：

- `_soundSurface()`
- `_terrainSoundMultiplier()`
- `_refreshPerception()`
- `_decayPerception()`
- `_isFastMove()`
- `_buildSoundEvent()`
- `_applySoundPerception()`
- `_emitSoundAndPerception()`
- `_directionFromVector()`
- `_pickInfoSkill()`

收益：信息博弈逻辑独立，方便增加嗅觉、视觉遮挡、环境噪声。

### 15.5 `server/services/battle-ai-strategy.js`

建议抽取：

- `STRATEGY_INTENTS`
- `_emptyStrategyTrace()`
- `_skillIntent()`
- `_skillStrategyIntent()`
- `_strategyDecision()`
- `_decisionForSkill()`
- `_skillScore()`
- `_updateAIState()`
- `_aiDecide()`
- `_pickSkill()`
- `_pickBasicAttack()`

收益：AI 行为树/评分器可独立迭代，不影响伤害和战斗状态机。

### 15.6 `server/services/battle-opponent-model.js`

建议抽取：

- `_emptyOpponentModel()`
- `_observeOpponentAction()`
- 模型评分/衰减函数。

收益：对手建模可升级为带时间衰减、局内学习和宠物长期记忆。

### 15.7 `server/services/battle-report-aggregator.js`

建议抽取：

- `_avgTrace()`
- `_avgStrategy()`
- `_addStrategy()`
- `_addKeyed()`
- `_avgKeyed()`
- `_addTargetParts()`
- `_avgTargetParts()`
- `_addInfoStats()`
- `_addOpponentModel()`
- `_addTrace()`
- `_emptyAngleStats()`
- `_addAngleStats()`
- `_angleReport()`
- `_sideReport()`

收益：正式战报、后台分析、调试批量报告可复用同一统计聚合逻辑。

### 15.8 `server/services/battle-fighter-loader.js`

建议抽取：

- `battle-debug-service.js` 中的 `_loadFighter()`。
- `arena-service.js` 和 `admin-service.js` 中类似的宠物、属性、技能装配逻辑。

收益：保证正式竞技场、后台测试、调试面板的数据装配一致。

### 15.9 `server/models/battle-enums.js`

建议抽取：

- 策略意图枚举。
- 部位战术枚举。
- 战斗事件类型枚举。
- 动作类型枚举。

收益：减少前后端命名硬编码，便于生成调试面板文案和接口文档。

---

## 16. 后续完善路线

### 16.1 短期优化

1. 增加动作协议与技能效果一致性 smoke test。
2. 给 `combo_bite` 实现真实多段命中或移除 `hits` 字段的误导性。
3. 增加 `reaction` 动作实际触发规则，完善 `dodge` 的反应动作定位。
4. 将 `STRATEGY_INTENTS` 抽成共享枚举。
5. 为 `battle-debug` 增加“导出批量测试 JSON”功能。

### 16.2 中期优化

1. 拆分 `battle-engine.js` 为多个公共子模块。
2. 增加战斗平衡自动检查脚本。
3. 增加不同品质、阶段、性格组合的批量基准。
4. 增加技能强度雷达图或表格报告。
5. 对声音系统增加环境噪声和遮挡。

### 16.3 长期优化

1. 引入更明确的行为树或 GOAP 结构。
2. 引入宠物长期战斗风格成长。
3. 加入多单位战斗或队伍战斗。
4. 加入玩家战前策略配置。
5. 将战斗录像压缩格式版本化。

---

## 17. 文档维护规则

1. 修改战斗数值时，同步更新 `docs/03-game-rules.md` 或本文件相关表格。
2. 新增动作时，必须同时更新：
   - `server/models/battle-action-contracts.js`
   - `server/models/game-rules.js` 的 `BATTLE_SKILL_EFFECTS`
   - `client/js/battle-action-contracts.js` 展示镜像
   - 本文档动作列表或说明
3. 新增战斗事件时，必须同步：
   - `battle-engine.js` 事件输出
   - `battle-animation-mapper.js` 如需动画映射
   - `client/js/battle-debug.js` 事件展示
   - 本文档事件表
4. 新增 AI 策略或状态时，必须同步：
   - 策略枚举
   - 批量报告聚合
   - 调试面板显示
5. 任何战斗逻辑变更都应通过 `battle-debug` 实时验证和批量测试验证。

---

## 18. 总结

当前宠物战斗系统已经从基础自动战斗升级为具备动作协议、体力冷却、动作阶段、防御反制、部位伤害、空间绕后、信息博弈、对手建模和可视化调试的完整战斗模拟系统。

现阶段最重要的后续工作不是继续堆叠新机制，而是：

1. 保持服务端权威和数值集中。
2. 用 `battle-debug` 做持续验证。
3. 逐步将大体量引擎拆分为可测试公共模块。
4. 为动作协议、技能效果和调试报告建立一致性检查。

只要保持这些约束，后续无论扩展新技能、新地图、新 AI 性格或新战斗玩法，都能在现有架构上平稳推进。
