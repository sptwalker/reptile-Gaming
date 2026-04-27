# Reptile Gaming - 蜥蜴模拟器 开发文档

## 2026-04-28 - P12 战斗机制与动画表现优化

- 修改 `server/services/battle-engine.js` 与 `server/models/game-rules.js`，补齐虚拟基础防御技能 `guard` / `brace`，让 `defend` 策略真正进入防御动作而非仅作为 AI 意图。
- 新增连续受击恐惧窗口上限与成功行动降恐惧：普通命中、恐惧技能、格挡和反击统一通过恐惧工具函数结算，避免恐惧过快滚雪球。
- 增强 AI 策略多样性：记录 `strategyRepeatCount`，对长期重复策略降权，并加入少量探索行为，使压制、防御、绕后和短反击之间更容易切换。
- 修改 `client/js/battle-animator.js`，优化动作接管规则：高优先级防御/攻击动作后段允许平滑接续，移动动作不再无条件覆盖当前动作。
- 修改 `client/js/lizard-battle-adapter.js` 与 `client/js/lizard-renderer.js`，拆分 `bodyFacing`、`lookFacing`、`moveFacing`，让身体朝向、视线朝向和移动方向分层表现。
- `LizardRenderer` 现在消费外部动作状态，根据 `guard` / `brace` / 攻击姿态调整头部朝向、身体基准角和移动节奏，减少防御后长时间僵直观感。
- 验证：`node -c` 通过 `server/services/battle-engine.js`、`server/models/game-rules.js`、`client/js/battle-animator.js`、`client/js/lizard-battle-adapter.js`、`client/js/lizard-renderer.js`；批量战斗测试已产生稳定 `blocks` / `blockedDamage` / `counters` 统计。

## 2026-04-28 - P11 完善 battle-debug 验证面板

- 修改 `server/services/battle-debug-service.js`，批量测试报告补齐 `targetPartsAvg`、`targetTacticsAvg`、`infoAvg` 与 `opponentModelAvg`，覆盖部位战术、信息博弈和对手建模统计。
- 修改 `client/js/battle-debug.js`，实时指标面板新增体力经济、防御/反制与策略意图，单位详情新增 `activeAction` 阶段、护甲/反制窗、技能冷却/体力、策略分布、信息统计和对手模型。
- 事件日志新增 `action_phase`、`strategy_intent`、`guard_block`、`counter` 描述，并在命中/技能命中日志展示格挡减免、反制和 `targetTactic` 部位战术。
- 批量测试简报与详细报告新增策略意图、防御反制、体力经济、部位战术、信息博弈和对手模型聚合展示，便于集中验证 P1-P10 新系统。
- 验证：`node --check server/services/battle-debug-service.js`、`node --check client/js/battle-debug.js` 通过；battle-debug smoke test 可生成含 `targetPartsAvg`、`infoAvg`、`opponentModelAvg` 的批量报告。
- 下一阶段计划：P1-P11 已完成后进入最终全量验证，确认无新增语法/运行错误后按用户要求提交 Git。

## 2026-04-28 - P10 实现对手建模与适应性 AI

- 修改 `server/services/battle-engine.js`，新增 `_emptyOpponentModel()` 与 `_observeOpponentAction()`，每帧根据对手决策记录动作、技能、攻击、防御、机动、欺骗、感知和意图分布。
- 单位新增 `opponentModel`，单位快照和战斗摘要均输出对手画像，包括 `aggression`、`defense`、`mobility`、`deception`、`observation` 等动态指标。
- `_skillScore()` 接入对手模型：高攻击型对手提高防御/拉扯评分，高防御型对手提高绕后评分，高欺骗型对手降低盲目进攻评分。
- `_aiDecide()` 接入对手模型：对高攻击对手主动保护弱点，对高防御对手主动寻找绕后路径。
- 验证：`node --check server/services/battle-engine.js` 通过；smoke test 可产生双方 `opponentModel` 动态画像统计。
- 下一阶段计划：进入 P11，完善 `battle-debug` 验证面板，集中展示 P1-P10 新系统指标。

## 2026-04-28 - P9 强化信息博弈系统

- 修改 `server/services/battle-engine.js`，新增 `_pickInfoSkill()`，AI 在低置信声音、疑似假声或搜索状态下会优先使用 `listen_alert` / `search_sound`。
- `_skillScore()` 的 `observe` 评分加入 `misledByFakeSound` 与 `soundConfidence`，听觉不确定时更倾向感知确认。
- 单位新增 `infoStats`，记录 `heard`、`fakeHeard`、`misled`、`infoSkills`，单位快照和战斗摘要均输出该统计。
- `alert` 与 `searching` 决策路径现在能基于声音置信度选择确认、搜索、反诱导或追踪最后已知位置。
- 验证：`node --check server/services/battle-engine.js` 通过；smoke test 可产生假声误导、感知技能使用和 `observe` 策略统计。
- 下一阶段计划：进入 P10，实现对手建模与适应性 AI，让双方根据对手行动历史动态调整防御、绕后、诱骗和追击倾向。

## 2026-04-28 - P8 增强部位伤害战术化

- 修改 `server/services/battle-engine.js`，新增 `_targetPartIntent()`、`_partTacticalWeight()` 与 `_recordTargetPart()`，将部位选择从基础权重升级为战术权重。
- 部位选择现在结合当前策略意图、绕后角度、部位剩余 HP、防御值、核心部位属性、性格 `skill/cunning` 等因素。
- 新增部位战术分类：`core_kill`、`disable_sense`、`cripple_mobility`、`remove_decoy`，并在命中事件中输出 `targetTactic`。
- 战斗摘要和 `session.stats` 新增 `targetParts` / `targetTactics`，可统计各部位攻击次数、伤害与战术倾向。
- 验证：`node --check server/services/battle-engine.js` 通过；smoke test 可产生 `targetParts` 与 `targetTactics` 统计。
- 下一阶段计划：进入 P9，强化信息博弈系统，让听觉捕获、假声诱导和目标记忆进一步影响策略与行动选择。

## 2026-04-28 - P7 实现高层策略意图系统

- 修改 `server/services/battle-engine.js`，新增 `STRATEGY_INTENTS`、`_emptyStrategyTrace()`、`_strategyDecision()`、`_skillStrategyIntent()` 与 `_decisionForSkill()`。
- AI 决策现在为移动、技能、恐惧逃跑、绕后、保护弱点、听觉搜索和空闲路径记录高层策略意图与原因。
- 单位快照新增 `strategy` 与 `strategyTrace`，战斗摘要新增 `strategyTrace` / `currentStrategy`，`session.stats` 同步记录策略分布。
- 修改 `server/services/battle-debug-service.js`，批量测试报告新增策略意图均值、防御统计均值和体力经济均值。
- 验证：`node --check server/services/battle-engine.js`、`node --check server/services/battle-debug-service.js` 通过；smoke test 可产生 `strategy_intent` 事件与左右双方策略分布统计。
- 下一阶段计划：进入 P8，增强部位伤害战术化，让 AI 更明确地围绕弱点、残肢和关键部位制定攻击/保护策略。

## 2026-04-28 - P6 增强 AI 技能评分系统

- 修改 `server/services/battle-engine.js`，将 `_skillIntent()` 改为优先读取 `BATTLE_SKILL_EFFECTS.intent`，覆盖攻击、防御、机动、欺骗、感知、恢复、处决等动作意图。
- 重写 `_skillScore()`，按血量、敌方血量、体力比例、距离、暴露弱点、绕后评分、性格参数、动作标签和体力成本综合评分。
- 防御 AI 可主动选择 `guard` / `brace`，低体力时更偏向低成本快攻，重击在敌方低血量时获得处决加权。
- 补齐非伤害动作执行：`defense` 进入防御准备，`movement` 执行位移，`perception` 增加感知锁定，`trick` 支持主动 `tail_decoy`。
- 修复 `skillsUsed` 未计数问题，技能使用统计现在覆盖所有动作技能。
- 验证：`node --check server/services/battle-engine.js` 通过；smoke test 可产生 `defense_ready`、`tail_decoy_ready`、`perception` 和技能使用统计。
- 下一阶段计划：进入 P7，加入高层策略意图追踪，让 AI 决策在战斗摘要和 debug 中可解释。

## 2026-04-28 - P5 实现防御与反制系统

- 修复 `server/services/battle-engine.js` 中 `_actionContract()` 被误替换破坏的语法结构。
- 新增 `_defenseState()`，基于 `activeAction` 的 `armor` 与 `counterWindow` 判断防御状态和反制窗口。
- 攻击命中防御中目标时按 `armor` 进行减伤，并在结果中记录 `rawDamage`、`blockedDamage`、`blocked`、`countered`、`defenseAction`。
- 新增 `guard_block` 与 `counter` 事件，战斗摘要和单位快照新增 `blocks`、`blockedDamage`、`counters` / `defenseStats`。
- 验证：`node --check server/services/battle-engine.js` 通过；smoke test 可产生格挡与反制统计。
- 下一阶段计划：进入 P6，增强 AI 技能评分，使攻击、防御、机动、欺骗和感知动作选择更符合战斗局势。

## 2026-04-28 - P4 实现动作阶段与打断窗口

- 修改 `server/services/battle-engine.js`，新增 `activeAction` 战斗状态。
- 新增 `_startActiveAction()`、`_tickActiveAction()`、`_actionPhase()`、`_canStartAction()`，按动作协议生成 `windup / impact / recover` 阶段。
- AI 在已有动作未结束时不会启动新动作，避免同一单位多动作重叠。
- 技能执行时发送 `action_phase` 事件，包含 `startFrame`、`impactFrame`、`endFrame`、`interruptible`、`counterWindow`。
- `getBattleState()` 单位快照暴露 `activeAction`，供 `battle-debug` 面板展示当前动作阶段、护甲和反制窗口。
- 验证：`node --check server/services/battle-engine.js` 通过；smoke test 已捕获 `action_phase` 事件与 `activeAction` 快照。
- 下一阶段计划：进入 P5，在现有 `guard` / `brace` / `counterWindow` 基础上实现防御减伤、格挡统计和反制事件。

## 2026-04-28 - P3 接入动作体力与冷却系统

- 修改 `server/services/battle-engine.js`，新增 `_actionCooldown()`、`_actionStaminaCost()`、`_hasActionStamina()`、`_actionMaxRange()`，统一从动作协议/技能效果读取冷却、体力和范围。
- `BATTLE_SKILL_EFFECTS` 中的 `staminaCost` 现在参与真实战斗扣除；不足体力的动作会被 AI 过滤并计入 `actionEconomy.blockedByStamina`。
- 新增战斗体力自然恢复：`BATTLE_STA_REGEN_PER_SEC`，并保留 `BATTLE_STA_LOW_ACTION_LIMIT` 作为低体力动作限制阈值。
- `getBattleState()` 的单位快照增加 `maxSta`、`actionEconomy`，技能快照增加 `cooldown`、`staminaCost`、`ready`、`virtual`，用于 `battle-debug` 验证动作经济。
- 战斗摘要增加 `actionEconomy`，可用于批量测试统计体力消耗/恢复/体力拦截。
- 修复一次开发中误替换导致的 `unit` 未定义和括号缺失问题，已通过语法检查。
- 验证：`node --check server/services/battle-engine.js`、`node --check server/models/game-rules.js` 通过；战斗模拟 smoke test 可完成并输出体力消耗统计。
- 下一阶段计划：进入 P4，实现动作阶段状态、起手/命中/恢复窗口与可打断信息在战斗快照中的暴露。

## 2026-04-28 - P2 移除无成本普通攻击

- 修改 `server/services/battle-engine.js`，移除独立 `attackCooldown` 和 `case 'attack'` 普通攻击执行分支。
- 新增 `_battleSkillList()`，确保每个战斗单位默认具备 `quick_snap` 与 `bite` 基础动作技能，避免无技能宠物无法战斗。
- 新增 `_pickBasicAttack()`，AI 的基础攻击回退改为选择可用动作技能，而非无成本普通攻击。
- `aggressive`、`kiting`、`defensive`、`alert` 状态中的攻击决策已改为 `{ action: 'skill' }`。
- 技能执行统一扣除 `effect.staminaCost` / 动作协议 `staminaCost`，并按动作协议范围校验攻击距离。
- 验证：`node --check server/services/battle-engine.js` 通过；`attackCooldown` / `case 'attack'` / `action: 'attack'` 搜索结果为 0；基础模拟 smoke test 可完成并产生技能使用统计。
- 下一阶段计划：进入 P3，完善所有动作的体力可用性、冷却来源和前端调试可视化字段。

## 2026-04-28 - P1 统一动作技能协议与基础技能池

- 扩展 `server/models/battle-action-contracts.js`，以后端动作协议作为权威来源。
- 新增第一批基础战斗动作：`quick_snap`、`combo_bite`、`heavy_bite`、`guard`、`brace`、`retreat_step`、`flank_step`、`fake_sound`、`tail_decoy`。
- 为动作协议补充 `staminaCost`、`cooldown`、`tags`、`interruptible`、`armor`、`counterWindow` 等字段，为后续体力、打断、防御反制和策略系统预留统一入口。
- 扩展 `server/models/game-rules.js` 的 `BATTLE_SKILL_EFFECTS`，补齐第一批动作的基础效果、冷却、体力消耗和策略意图。
- 同步 `client/js/battle-action-contracts.js` 作为展示镜像；前端不作为可信判定源。
- 验证：`node --check` 已通过 `server/models/battle-action-contracts.js`、`server/models/game-rules.js`、`client/js/battle-action-contracts.js`；对应文件 lints 为 0。
- 下一阶段计划：进入 P2，移除服务端战斗中的无成本普通攻击路径，改为由技能动作承担基础攻击。

## 项目概述
一个基于 HTML5 Canvas 的交互式蜥蜴生物模拟器，单文件实现（`game.html`），包含完整的物理模拟、IK骨骼动画、AI行为系统和参数调节面板。

## 技术架构

### 核心系统

#### 1. 脊椎链物理 (Spine Chain)
- **节点数**: 22个脊椎节点，固定段长18px
- **跟随算法**: 头部跟随目标，子节点通过 `atan2` + 固定距离约束逐级跟随
- **约束迭代**: 3次交替执行角度约束 + 距离约束，确保收敛

#### 2. 逆运动学腿部 (IK Legs)
- **四条腿**: 前腿绑定 spine[5]，后腿绑定 spine[11]，左右对称
- **IK求解**: 二关节余弦定律求解膝关节位置，`bendDir` 控制膝盖弯曲方向
- **步态系统**: 对角交替步态，正弦弧线抬脚，距离阈值触发迈步
- **脚掌**: 5趾程序化绘制

#### 3. 身体轮廓渲染
- **宽度轮廓**: `bodyWidthAt(i)` 分段线性插值（鼻尖→头→颈→肩→胸→臀→尾）
- **Bézier曲线**: 左右轮廓点用 `quadraticCurveTo` 平滑连接
- **细节**: 皮肤渐变、腹部浅色条纹、背部斑点
- **头部**: 椭圆头、橙色眼睛+竖瞳、鼻孔

#### 4. 自碰撞避免
- **路径预测**: `computeAvoidanceDir()` 检测头部前方路径是否穿过身体节点
- **绕行转向**: 选择更接近目标方向的垂直方向绕行
- **身体排斥**: `resolveBodyCollisions()` 推开重叠的身体节点

#### 5. 关节角度约束
- **分区最大弯折角**: 颈0.455、肩0.286、躯干0.234、臀0.286、尾0.52 弧度
- **前向传播**: 超出限制时将后续节点旋转回允许范围
- **弹性效果**: 多次迭代实现自然的弹性舒展

#### 6. 蛇形摆动
- **驱动**: 速度驱动的正弦波，相位由 `headSpeed * 0.12` 累积
- **参数**: 振幅12.0、频率0.18、传播速度3.0
- **分布**: 从颈部渐入，尾部增强（`tailBoost = 1 + t * 0.8`）

### AI 行为系统

#### 游走模式
- **随机游走**: 基于角度的游走，活跃度(1-10)控制速度和转向概率
- **边界折返**: 双层柔性折返 — 100px处预判转向 + 40px处反弹推力
- **缓启动**: 暂停结束后速度从0渐增（`aiSpeedRamp += 0.02`）

#### 暂停张望
- **触发**: 随机概率触发，活跃度越低频率越高
- **张望概率**: 40%暂停会张望，60%纯静止
- **三阶段**: 静止等待(15%) → 张望 → 缓出
- **关键帧驱动**: 完全随机目标角度(±0.7rad)，三档速度分布（60%慢/25%中/15%快突转）
- **纯视觉偏移**: 张望只影响绘制，不修改物理位置（`lookOffsets[]`）
- **方向继承**: 张望结束后朝最后注视方向启动行走

#### 光点追逐
- **放置**: 点击画布放置发光光点（短距离+短时间判定为点击）
- **光点行为**: 缓慢随机漂移，边界反弹
- **视野检测**: 基于头部朝向的双扇形视野（默认60°角，清晰300px/最大500px）
- **清晰视野**: 直接以1.8倍速猎食追逐
- **警惕状态**: 停下观察30帧后缓慢靠近（默认速度2.5）
- **消失**: 头部接触光点后消失

### 画布围栏
- **柔性反弹**: 头部进入边缘40px区域受二次方推力
- **AI角度修正**: 碰到边界自动修正游走角度
- **安全钳制**: 所有脊椎节点最终钳制在10px边距内

### 参数系统
- **实时调节面板**: 21个可调参数，分5组（基础/蛇形/碰撞/关节/视野）
- **可折叠面板**: 默认收起，底部按钮切换展开/收起
- **持久化**: localStorage 保存/读取
- **导入导出**: JSON文件导入导出

## 文件结构
```
reptile-Gaming/
├── client/                 # 前端（原生JS，开发中）
├── server/                 # 服务端（Node.js，开发中）
├── docs/                   # 标准化项目文档（6份）
│   ├── 01-project-spec.md  # 项目规范与目录架构
│   ├── 02-database.md      # 数据库表结构设计
│   ├── 03-game-rules.md    # 全局数值规则字典
│   ├── 04-api.md           # RESTful API接口文档
│   ├── 05-sync-rules.md    # 前端Canvas与服务端同步规则
│   └── 06-security.md      # 全局强制约束规则
├── game.html               # 原型演示（单机蜥蜴模拟器，约1520行）
├── lizard_params001.json   # 参数导出示例
├── DEVLOG.md               # 本开发文档
└── .gitignore
```

## 操作说明
- **拖拽**: 按住鼠标左键拖拽控制蜥蜴移动
- **放置光点**: 点击画布放置发光诱饵
- **AI游走**: 点击"启动"按钮开启自动游走
- **活跃度**: 1-10，控制游走速度和转向频率
- **参数调节**: 页面底部面板实时调整所有动画参数

## 2026-04-27 - 实时战斗卡死定位修复与调试输出清理
- 定位 `左方18 / 右方16 / 草原` 组合战斗中途停滞问题：通过前端步进、绘制链路和服务端结算状态排查，确认最终生效问题来自旧 Node 进程仍占用 `3000` 端口，浏览器请求未更新的后端服务。
- `server/services/battle-engine.js` 修复战斗结束原因返回：会话初始化 `finishReason`，`getBattleState()` 与结算摘要优先使用已保存的结束原因，避免已结束状态被重新推断为 `unknown`。
- `client/js/battle-debug.js` 保留稳定性保护：`/step` 请求硬超时、主循环步进看门狗、连续返回同一帧的异常保护、正式渲染耗时/异常降级，避免再次出现无提示停滞。
- 清理临时调试输出：移除战斗页 `debugProbe` 浮层、`.debug-probe` 样式、`setDebugPhase()`、`window.__RG_BATTLE_PROBE`、渲染适配器 `probe(...)` 打点和请求阶段探针文本。
- 明确“捕获”点位含义：`perception` 事件显示的是听觉估算位置，蓝色“捕获”为真实声音方向估计，紫色“误判”为假声诱导结果，不等同于目标真实坐标。
- 检查：`node --check client/js/battle-debug.js`、`node --check client/js/lizard-battle-adapter.js` 通过；相关前端文件 lint 无新增错误。

## 2026-04-26 - P9 战斗系统空间方位感知与绕后策略
- `server/models/game-rules.js` 新增空间感知/绕后规则常量：前方视野扇形、后方弱点扇形、侧方/后方伤害与命中加成、转身速度和绕后目标距离等数值集中配置。
- `server/services/battle-engine.js` 为战斗单位新增 `facing/angularVelocity/aiSubState/flankTarget/protectTarget/weakExposure`，并实现每帧平滑转向、前/侧/后区域判断、绕后评分、薄弱部位暴露检测和攻击角度加成。
- AI 决策接入空间策略：高狡猾/高机动单位会尝试绕开敌方正面视野并进入 `flanking/flank_attack`，弱点暴露时进入 `protecting`，风筝移动改为二维斜向撤离。
- 目标部位选择升级为角度感知加权：后方更偏向头/躯干，正面更偏向前肢，侧方更偏向四肢，同时叠加部位脆弱度与低防御收益。
- 普攻和攻击型技能的伤害、暴击和闪避计算接入 `angleAttackBonus`，战斗事件与动画协议透传 `attackZone/flankScore/flankAngle/angleBonus`。
- `server/services/battle-debug-service.js` 和批量报告新增前/侧/后攻击次数、平均绕后评分与后方伤害统计，便于验证绕后策略收益。
- `client/js/battle-debug.js` 新增朝向、角速度、AI 子状态、绕后目标、保护目标、弱点暴露和角度事件展示；Canvas 调试层绘制朝向箭头、前方视野扇形、后方弱点扇形、绕后/保护目标点。
- 验证计划：执行 JS 语法检查、lint、`git diff --check`，并启动服务端战斗 smoke/batch 测试确认 `attackZone`、`flankScore`、`aiSubState` 和角度统计正常输出。

- `server/services/battle-engine.js` 输出 `mapConfig`，把当前战斗地图 `id/name/width/height/margin/terrain/soundSurface` 随状态返回给前端，避免测试页继续依赖固定 `800×600` 或旧基准线假设。
- `client/js/battle-debug.js` 新增地图配置缓存、Canvas 地图矩形投影、边界/网格绘制和二维事件提示；`draw()` 移除旧 `h * .72` 地面线，预览、正式身体、fallback 身体和 visual_fx 均传入同一份服务器地图配置。
- `client/js/lizard-battle-adapter.js` 的正式 `LizardRenderer` 合成坐标改为按 `map.width/height/margin` 投影，战斗前预览、运动采样和轨迹调试使用同一二维地图坐标系。
- `client/js/lizard-battle-renderer.js` 的 fallback 身体、声波半径、技能轨迹、命中/闪避/感知特效改为使用地图投影，确保特效与正式身体锚点一致。
- 事件日志与音效空间化同步二维化：声音、感知、感知动作、visual_fx 显示 `x/y`、`angle/vector` 等服务端输出字段，声像按当前地图宽度计算。
- 检查：`node --check client/js/battle-debug.js`、`node --check client/js/lizard-battle-adapter.js`、`node --check client/js/lizard-battle-renderer.js`、`node --check client/js/battle-animator.js`、`node --check server/services/battle-engine.js`、`git diff --check` 均通过；`client/js/battle-debug.js` lint 无新增错误。

## 2026-04-26 - 服务器端真实二维地图战斗逻辑改造
- `server/services/battle-engine.js` 新增 `_arenaBounds()`、`_clampPoint()`、`_spawnPoint()`，出生点、移动边界和坐标钳制统一来自地图 `width/height/margin`，移除战斗核心中的旧固定基准线语义。
- AI 决策链升级为完整二维目标点：追逐、躲避、警戒、搜索和听声追踪均携带或生成 `targetX/targetY`，移动执行按二维向量推进并限制在地图边界内。
- 声音感知升级为二维方位：按欧氏距离传播，听声估算点同时包含 X/Y 误差，并输出 `direction/angle/vector/lastKnownX/lastKnownY`。
- `server/services/battle-animation-mapper.js` 的感知动作改用二维 `lookAt.x/y`，移除 `y: 300` 表现层硬编码，并透传二维方位字段。
- 清理检查：已搜索 `1D`、`简化为1D`、`y: 300`、`_clampArenaY`、`Math.min(780)`、旧 `targetX` 听声追踪等服务端一维残留，未发现战斗核心旧逻辑残留。
- 检查：`node --check server/services/battle-engine.js`、`node --check server/services/battle-animation-mapper.js`、`node --check server/services/battle-debug-service.js`、`node --check server/services/arena-service.js`、`git diff --check` 均通过；相关文件 lint 无新增错误；补充执行 30 帧服务端战斗 smoke test，单位 X/Y 坐标均由服务器端二维逻辑推进。

## 2026-04-26 - 战斗测试页全屏二维自由运动改造
- `client/battle-debug.html` 将事件日志移入战斗舞台底部 overlay，并为左右控制/状态面板添加收起按钮与可滚动内容容器。
- `client/css/battle-debug.css` 将战斗页改为固定全屏、不可滚动布局；Canvas 占满视口，两侧面板改为浮动抽屉，底部战斗文字信息独立滚动显示。
- `server/routes/battle-debug.js` 与 `server/services/battle-debug-service.js` 新增 `/api/battle-debug/preview`，用于不开启战斗会话时加载左右宠物真实外观。
- `client/js/battle-debug.js` 新增战斗前预览循环，导入宠物后自动以 `LizardBattleAdapter.renderPreview()` 展示左右宠物在各自区域自由活动；开始战斗后停止预览，结束后回到预览。
- `client/js/lizard-battle-adapter.js` 将单位坐标映射升级为二维战斗场地，并用二维运动量驱动正式 `LizardRenderer` 的身体牵引、朝向和步态表现。
- `server/services/battle-engine.js` 将 AI 距离判断、追逐/躲避移动、攻击/技能射程从单轴距离升级为二维距离，移动事件与感知状态同步输出 `x/y` 坐标。
- 检查：`node --check client/js/battle-debug.js`、`node --check client/js/lizard-battle-adapter.js`、`node --check server/routes/battle-debug.js`、`node --check server/services/battle-debug-service.js`、`node --check server/services/battle-engine.js`、`git diff --check` 均通过；相关文件 lint 无新增错误。
- 遗留建议：仍需浏览器人工验收组合测试页生成宠物后导入战斗页的真实运动观感，重点观察战斗前自由活动、战斗中二维追逐/躲避、底部日志滚动和两侧面板收起。

## 2026-04-26 - 正式 LizardRenderer 战斗适配阶段 5
- `client/js/battle-debug.js` 清理最终旧椭圆 `drawUnit()` 渲染路径，正式宠物身体主路径固定为 `LizardBattleAdapter + LizardRenderer`。
- `LizardBattleRenderer` 继续作为兼容层保留，仅承担 visual_fx、fallback 正式适配失败时的旧身体绘制能力和旧调试工具函数；主流程不再主动回退到最简椭圆身体。
- 若正式身体适配器不可用，战斗页现在显示明确错误提示，避免误以为已经看到真实宠物动画。
- 最终计划回顾：阶段 1 已完成正式身体接入；阶段 2 已完成战斗坐标驱动；阶段 3 已完成动作协议到正式姿态映射；阶段 4 已完成 visual_fx 与统一播放循环合成；阶段 5 已完成旧路径清理和验收记录。
- 阶段 5 检查：`node --check client/js/battle-animator.js`、`node --check client/js/lizard-battle-adapter.js`、`node --check client/js/battle-debug.js`、`node --check client/js/lizard-renderer.js`、`git diff --check` 均通过；相关文件 lint 无新增错误。
- 遗留建议：后续可在浏览器内用真实宠物 ID 做人工视觉验收，重点观察不同 `render_params/body_seed`、攻击/闪避/感知动作、声波/命中特效和倍速播放是否符合预期。

- `client/js/battle-animator.js` 新增 `renderFrame` 与 `advanceRenderFrame(dt)`，使前端渲染循环能在服务端 `/step` 间隔之间持续推进动作进度、root motion 与 visual_fx 进度。
- `getUnitVisual()` 与 `getActiveFx()` 改为优先使用 `renderFrame` 采样，统一身体姿态、位移插值和特效播放时间轴。
- `client/js/battle-debug.js` 在每帧 `draw()` 前调用 `animator.advanceRenderFrame()`，服务端状态仍保持权威，前端仅负责连续播放表现层动画。
- 正式身体路径下同步 `battleAdapter.lastAnchors` 到 `LizardBattleRenderer.drawVisualFx()`，让声波、命中、闪避、技能轨迹继续锚定正式 `LizardRenderer` 的头部/单位坐标。
- 阶段 4 检查：`node --check client/js/battle-animator.js`、`node --check client/js/lizard-battle-adapter.js`、`node --check client/js/battle-debug.js`、`node --check client/js/lizard-renderer.js`、`git diff --check` 均通过；相关文件 lint 无新增错误。
- 阶段 4 计划核对：正式身体、root motion、visual_fx 已进入同一播放循环；下一阶段清理旧渲染路径并补齐最终验收记录。

## 2026-04-26 - 正式 LizardRenderer 战斗适配阶段 3
- `client/js/lizard-battle-adapter.js` 新增 `_contractFor()`、`_actionProfile()` 与 `_syncActionEffect()`，把 `BattleActionContracts` 的动作协议映射为正式身体牵引参数。
- 已覆盖 `move/fast_move/flee`、`bite/scratch/tail_whip`、`venom_spit/flame_breath/gale_slash`、`dragon_rush/shadow_step`、`regen/heal/buff/camouflage/iron_hide/predator_eye`、`listen_alert/search_sound`、`dodge/hit_react/dead` 等动作表现。
- 正式身体现在根据动作类型产生前伸、抬头、侧摆、压缩/拉伸、闪避后撤、受击缩身、死亡倾倒等姿态变化，并复用 `LizardRenderer.triggerSkillTest()` 触发近战、远程、增益、治疗、威慑等轻量身体特效。
- `client/js/battle-debug.js` 在正式身体渲染路径下把 `battleAdapter.lastAnchors` 同步给旧 `LizardBattleRenderer.drawVisualFx()`，让现有 visual_fx 继续锚定正式宠物头部位置。
- 阶段 3 检查：`node --check client/js/lizard-battle-adapter.js`、`node --check client/js/battle-debug.js`、`node --check client/js/lizard-renderer.js`、`git diff --check` 均通过；相关文件 lint 无新增错误。
- 阶段 3 计划核对：动作事件已映射到正式宠物身体姿态；下一阶段进入战斗特效与统一播放循环合成。

- `client/js/lizard-battle-adapter.js` 新增 `unitHistory` 与 `_motionSample()`，按服务端战斗坐标变化计算每方速度、纵向偏移和朝向输入。
- `_unitPoint()` 现在把服务端 `x/y/yOffset` 统一转换为主战斗 Canvas 坐标，正式宠物身体随服务端位置移动。
- `_prepareRenderer()` 根据坐标变化动态调整正式 `LizardRenderer` 的牵引目标，快速位移会产生更强身体前伸与步态驱动。
- `client/js/battle-debug.js` 主循环每帧执行 `draw()`，服务端 `/step` 只负责权威状态推进，避免正式身体动画只在接口返回时刷新。
- 阶段 2 计划核对：正式身体已接入并由战斗坐标持续驱动；下一阶段进入动作事件到正式身体姿态/技能表现映射。

## 2026-04-26 - 正式 LizardRenderer 战斗适配阶段 1
- 在 `client/battle-debug.html` 中新增加载 `client/js/lizard-renderer.js` 与 `client/js/lizard-battle-adapter.js`，确保战斗页可访问正式宠物身体渲染器。
- 新增 `client/js/lizard-battle-adapter.js`，以双离屏 Canvas 管理左右双方 `LizardRenderer`，并将正式身体图像合成到主战斗 Canvas。
- 扩展 `client/js/lizard-renderer.js`：`_render(options)` 支持透明清屏、跳过跑步机/光点/视野，并新增 `renderBattleFrame(options)`；同时显式暴露 `window.LizardRenderer` / `globalThis.LizardRenderer`。
- 改造 `client/js/battle-debug.js`：优先使用 `LizardBattleAdapter` 渲染正式宠物身体，旧 `LizardBattleRenderer` 保留为 visual_fx 与 fallback。
- 阶段 1 检查：`node --check client/js/lizard-battle-adapter.js`、`node --check client/js/battle-debug.js`、`node --check client/js/lizard-renderer.js`、`git diff --check` 均通过；相关文件 lint 无新增错误。

### v0.1 - 基础骨骼
- 脊椎链跟随鼠标
- 基础四腿IK
- 简单身体渲染

### v0.2 - 蜥蜴外形
- 修复腿部方向和长度
- 蜥蜴形状身体轮廓（`bodyWidthAt` 分段宽度）
- Bézier曲线平滑皮肤
- 头部细节（眼睛、瞳孔、鼻孔）
- 鼠标拖拽控制

### v0.3 - 物理增强
- 自碰撞避免（路径预测 + 身体排斥）
- 关节角度约束（分区弯折限制 + 弹性传播）
- 蛇形摆动（速度驱动正弦波）

### v0.4 - 参数系统
- 实时参数调节面板
- localStorage 持久化
- JSON 导入/导出

### v0.5 - AI 行为系统
- AI随机游走（活跃度控制）
- 光点追逐系统
- 画布围栏（柔性反弹）
- 边界自然折返

### v0.6 - 行为细化
- 随机暂停 + 张望动作
- 关键帧驱动的随机转头（三档速度分布）
- 头部旋转动画
- 纯视觉偏移避免物理累积
- 张望后朝注视方向自然启动
- 缓启动过渡

### v0.7 - 视野系统 + UI重构

#### Bug修复
- 修复 `drawHead` 中张望角度被双重应用的问题（`lookOffsets` 已旋转 spine[0..2] 坐标，`baseAngle` 已包含张望效果，去掉多余的 `+ aiLookOffset`）
- 修复 `exportParams` 中 `URL.revokeObjectURL` 在 `click()` 后立即调用导致部分浏览器下载失败的问题，改为 `setTimeout` 延迟 3 秒释放

#### 视野系统（双扇形检测）
- 新增基于头部朝向的扇形视野检测，替代原有 360° 圆形检测
- **视野角度**: 默认 60°，随头部转动自然旋转
- **清晰视野距离**: 默认 300px，光点落入此范围直接触发猎食追逐
- **最大视野距离**: 默认 500px，光点落入清晰~最大之间触发警惕状态
- **警惕行为**: 蜥蜴先停下观察 30 帧（头部缓慢转向目标），然后以 `ALERT_SPEED`（默认 2.5）缓慢靠近
- 光点进入清晰视距后自动切换为全速追逐
- 新增 `getHeadAngle()`、`dotInFOV()`、`findNearestDotInFOV()` 函数
- 新增 `aiAlertTarget`、`aiAlertTimer` 警惕状态变量

#### 视野可视化
- 蜥蜴静止或警惕时显示视野锥形
- 清晰视野：透明亮绿色扇形（`rgba(100,220,100,0.08)`）
- 最大视野：透明暗绿色扇形（`rgba(30,80,30,0.12)`）
- `drawVisionCone()` 在 render 中绘制

#### UI重构
- Canvas 改为全屏自适应（`flex: 1` + `resizeCanvas()`，监听 `window.resize`）
- 移除固定 1200x700 尺寸，动态填满窗口剩余空间
- 操作栏和参数面板固定在底部
- 参数面板改为可折叠样式（默认收起），通过「参数面板 ▲/▼」按钮切换
- CSS 过渡动画（`max-height` + `opacity`）实现平滑展开/收起
- 面板展开/收起后自动触发 Canvas 重新计算尺寸

#### 参数面板扩展
- 新增「视野参数」分组：视野角度(°)、清晰视距、最大视距、警惕速度
- 4 个新参数加入 `paramMap`，支持保存/导出/导入
- 摆动振幅调节精度从 0.5 改为 0.1

### v0.8 - 网游系统设计（当前版本）

#### 项目定位转型
- 在单机蜥蜴模拟器原型基础上，设计多人联网爬虫宠物养成游戏系统
- 技术栈：Node.js + Express + SQLite（服务端）、原生JS + Canvas（前端）
- 架构原则：服务端权威，前端纯渲染，所有数值/随机/状态变更在服务端完成

#### 目录架构建立
- 新增 `client/` 前端目录结构（js/renderer/ui/css/assets）
- 新增 `server/` 服务端目录结构（routes/services/models/middleware/utils）
- 新增 `docs/` 标准化文档目录

#### 6份标准化项目文档
1. **01-project-spec.md** — 项目规范与目录架构：目录结构、编码规范（命名/接口/数据库）、版本管理、开发阶段划分（P0~P5）、统一响应格式与错误码、前端分层原则
2. **02-database.md** — 数据库表结构设计：6张表（user/pet_egg/pet/pet_attr/pet_skill/log）完整DDL、字段说明、索引、ER关系图、属性映射关系
3. **03-game-rules.md** — 全局数值规则字典：品质体系（5级加权随机）、天赋系统、六维属性公式、衍生属性计算、孵化/养成/蜕变/体力/经济规则、外观种子系统、常量汇总
4. **04-api.md** — RESTful API接口文档：6大模块（user/egg/hatch/pet/nurture/log）完整接口定义、请求/响应示例、错误码汇总、限流规则、Token规范
5. **05-sync-rules.md** — 前端Canvas与服务端数据同步规则：架构分层、单向数据流、同步机制（心跳/可见性/离线处理）、渲染参数转换公式、帧循环独立、多宠物切换、安全同步
6. **06-security.md** — 全局强制约束规则：8大类35条规则（服务端权威/身份鉴权/输入校验/频率限制/数据完整性/通信安全/防作弊/代码质量），规则编号S-A01~S-H05

#### 开发阶段规划
- P0-文档（当前）：规范文档、表结构、API设计
- P1-基座：服务端框架、数据库、用户系统
- P2-核心：蛋系统、孵化、宠物生成
- P3-养成：喂食、成长、蜕变、体力
- P4-渲染：Canvas宠物渲染、属性映射
- P5-联网：多人同屏、社交、对战框架

### v0.9 - P8 繁殖系统

#### 品质体系统一
- 确认5级品质体系：1=普通, 2=优秀, 3=稀有, 4=史诗, 5=传说
- 繁殖品质组合表扩展为15条（覆盖所有5×5父母品质对）

#### 基因遗传引擎 (`server/services/gene-engine.js`, 465行)
- 品质遗传：组合表查询 + 全局传说上限（≥1%减半，≥2%归零）
- 天赋基因：显性/隐性双基因模型，80%遗传 / 20%变异（±1~3），表达倍率（纯合显性1.1/杂合1.0/纯合隐性0.9）
- 外观遗传：5模块独立继承（spine/limbs/head/tail/skin），可配置父方权重
- 技能遗传：35%父/35%母/10%双亲/20%变异分布，品质上限控制
- 隐藏基因：5种类型（水晶鳞/暗影纱/炎之心/风暴翼/远古血），0.1%携带率，全局硬上限，7天冷却

#### 交友市场与繁殖流程 (`server/services/breeding-service.js`, 535行)
- 交友市场：上架/下架/浏览（性别过滤，JOIN宠物+用户，限50条）
- 邀请系统：发送（校验阶段/性别/冷却/体力/心情/金币/待处理）、列表、接受（事务：更新邀请+创建笼+扣除资源+下架双方）、拒绝
- 交配笼：4小时倒计时，成功概率（base 0.6 + 心情/休息加成 - 近期繁殖惩罚），随机1-2蛋
- 孵化注入：繁殖蛋在finishHatch时注入遗传数据（基因组/外观/隐藏基因/父母ID/世代/性别/天赋/技能）

#### 路由与前端
- `server/routes/breeding.js`：9个POST端点（市场3+邀请4+笼2），全部限流
- 前端：交友市场面板（性别过滤+市场卡片+邀请按钮）、邀请列表面板、交配笼面板（进度条+1s定时器+完成按钮）
- CSS：~180行繁殖主题样式（粉色系）

#### 技术要点
- 循环依赖解决：hatch-service → breeding-service 使用函数内 lazy require
- 数据库新增5张表：breeding_record, breeding_invite, dating_market, breeding_cage, global_stats, hidden_gene_log
- pet表新增8个字段：gene_set, appearance_gene, hidden_gene, parent1_id, parent2_id, generation, breed_count, last_breed_at

### v1.0 - P9 斗兽竞技场异步战斗系统

#### 战斗引擎 (`server/services/battle-engine.js`, ~490行)
- 30FPS帧级模拟，最大120秒（3600帧）
- 4态AI状态机：aggressive（进攻）/ kiting（风筝）/ defensive（防御）/ fear（恐惧）
- 伤害公式：ATK × (1 - DEF/(DEF+200)) × random(±15%) × rage × stamina_penalty × crit
- 恐惧系统：每次被击中+8，阈值100触发逃跑判负，每秒自然衰减0.2
- 狂暴计时器：60秒后启动，每秒+2%伤害倍率
- 技能系统：14种技能战斗效果（近战/远程/buff/治疗/恐惧），独立冷却
- buff系统：防御/闪避/暴击/攻击增益，持续时间衰减
- 体力惩罚：战斗体力耗尽时伤害×0.5

#### 战斗属性公式
- HP = VIT×10 + STR×3 + level×5
- ATK = STR×3 + AGI×1 + level×2
- DEF = VIT×2 + STR×1 + level×1
- SPD = AGI×3 + PER×1

#### 竞技场服务 (`server/services/arena-service.js`, ~520行)
- 入场：stage≥2 + stamina≥1，计算战斗力，更新arena_status
- 存钱罐：1金/分钟累积，可提取兑换
- 对手匹配：同品质+同阶段，排除自己，按战斗力排序
- 挑战：每日10次上限，赌注=min(双方存钱罐)但≥10金，随机地图
- 结算：胜方+赌注+5金-1体力，败方-赌注-5金-10体力+恢复期30分钟，平局双方-10体力+10金
- 战斗记录：72小时自动过期，支持回放
- 管理员测试：任意两宠物模拟战斗

#### 地图系统
- 3张地图：草原（无buff）、沼泽（速度-20%）、火山（攻击+10%）
- 挑战时随机选择

#### API路由 (`server/routes/arena.js`, 11个端点)
- /enter, /my, /opponents, /collect, /challenge, /battle, /history, /replay, /live, /admin-test
- 全部POST方法 + 滑动窗口限流

#### 前端 (`client/js/arena.js`, ~380行)
- 竞技场区域：入场按钮/状态显示/战斗记录入口
- 竞技场面板：我的宠物列表（金币累积/提取）、对手列表（挑战按钮）
- 战斗回放：Canvas渲染（单位移动+状态指示）、HP条/恐惧值/狂暴倍率HUD、播放/暂停/倍速/进度条、事件日志
- 战斗历史：记录列表+回放按钮

#### 数据库变更
- arena_pet表新增：arena_gold, daily_challenges, daily_reset_date
- battle_challenge表新增：bet_amount, reward_detail
- 含兼容迁移（ALTER TABLE）

#### game-rules.js 新增 ~130行常量
- 帧率/时长、伤害浮动/暴击/闪避、狂暴系统、恐惧系统、体力惩罚
- 战斗属性公式系数、结算奖惩值、AI阈值、地图定义、14种技能战斗效果

---

### v1.1 - 全模块联调编码 (2026-04-21)

> 打通 P1-P9 所有业务系统数据互通，修复关键 Bug，统一异常处理

#### 关键修复

1. **战斗结算 winner 值不匹配（严重）**
   - `battle-engine.js` 返回 `winner: 'left'|'right'|'draw'`
   - `arena-service.js _settle()` 原先检查 `'attacker'|'defender'` → 所有战斗均按平局结算
   - 修复：条件改为 `'left'`/`'right'`

2. **pet-service.js getPetDetail 缺失字段**
   - 前端竞技场模块需要 `arena_status`，繁殖模块需要 `last_breed_at`
   - 补全两个字段到响应对象

3. **egg.js btnCageClose 误隐藏竞技场面板**
   - 关闭笼子面板时意外隐藏 arena/battle/history 面板
   - 移除多余的 3 行代码

4. **arena-service.js 未使用的 secureRandomFloat 导入**
   - 清理无用引用

#### 统一异常处理

- **服务端**：arena.js 所有路由包裹 `wrap()` try-catch，捕获同步异常返回友好提示
- **客户端**：index.html 添加 `window.onerror` + `unhandledrejection` 全局捕获，防止空白页

#### 联调验证

- 养成系统 ↔ 战斗系统：体力扣减/金币奖惩/成长值 实时同步 ✓
- 遗传系统 ↔ 宠物系统：基因/外观/技能 孵化后正确注入 ✓
- 前端 ↔ 后端：37 个接口全部匹配，无请求失败/数据丢失 ✓
- 全局异常处理：服务端 try-catch + 客户端 onerror，无空白页 ✓

#### 变更文件
- `server/services/arena-service.js` — winner 条件修复 + 清理导入
- `server/routes/arena.js` — wrap() 异常捕获
- `server/services/pet-service.js` — 补全 arena_status/last_breed_at
- `client/js/egg.js` — 移除误操作代码
- `client/index.html` — 全局错误处理脚本

### v1.2 - 管理后台系统 (2026-04-21)

> 独立管理员鉴权 + 19个管理API + 6模块前端管理界面 + game-rules热更新

#### 管理员鉴权 (`server/middleware/admin-auth.js`, 29行)
- 独立于玩家JWT鉴权体系，使用 `X-Admin-Key` 请求头静态密钥
- 默认开发密钥 `reptile_admin_2026`，支持环境变量 `ADMIN_KEY` 覆盖
- 与玩家业务完全隔离，`req.isAdmin = true` 标记

#### 管理后台服务 (`server/services/admin-service.js`, 540行, 19个函数)

**统计模块（4个函数）**
- `getStats()` — 全局概览：注册量/宠物/蛋/日活/周活/新增/战斗/竞技场
- `getEconomyStats()` — 经济数据：金币总量/均值/极值/跑道产出
- `getDistributions()` — 分布数据：等级/品质/阶段/性别
- `getBreedingStats()` — 繁殖统计：市场挂牌/邀请/交配笼/后代

**玩家管理（5个函数）**
- `searchUsers()` — 支持ID/用户名/昵称模糊搜索，分页
- `getUserDetail()` — 完整详情（用户+宠物+蛋+近50条日志）
- `modifyUser()` — 修改金币/钻石/昵称
- `banUser()` — 封禁（递增token_version使所有Token失效）
- `unbanUser()` — 解封

**宠物管理（2个函数）**
- `getPetDetail()` — 完整数据（宠物+属性+技能+竞技场+跑道+繁殖记录）
- `modifyPet()` — 修改pet表12字段 + pet_attr表12字段

**战斗记录（1个函数）**
- `getBattleRecords()` — 分页查询，支持按用户/宠物/结果过滤

**数值热更新（2个函数）**
- `getRules()` — 读取当前 game-rules 全部参数快照
- `updateRules()` — 在线修改参数，直接修改模块引用，无需重启

**测试模块（5个函数）**
- `quickCreatePet()` — 快速生成测试宠物（蛋+宠物+属性+技能一步到位）
- `boostPet()` — 加速成长（直接设置等级/经验/阶段，同步更新基础属性）
- `clonePet()` — 复制宠物到目标用户（含属性+技能完整副本）
- `testBattle()` — 模拟对战（不影响正式数据）
- `testBreeding()` — 模拟交配（不影响正式数据）

#### API路由 (`server/routes/admin.js`, 159行, 20个端点)
- 路径前缀 `/api/admin`，统一挂载 `adminAuth` 中间件
- GET: /stats, /stats/economy, /stats/distributions, /stats/breeding, /users, /users/:uid, /pets/:petId, /battles, /rules
- POST: /users/:uid/modify, /users/:uid/ban, /users/:uid/unban, /pets/:petId/modify, /rules, /test/create-pet, /test/boost-pet, /test/clone-pet, /test/battle, /test/breeding

#### 前端管理界面
- `client/admin.html` (150行) — 登录面板 + 6模块页面骨架（仪表盘/玩家/宠物/战斗/数值/测试）
- `client/css/admin.css` (109行) — 暗色主题（GitHub风格配色），侧边栏布局，响应式适配
- `client/js/admin.js` (392行) — IIFE模块，X-Admin-Key鉴权请求封装，6模块完整交互逻辑

#### 仪表盘
- 16张统计卡片（用户/宠物/活跃/战斗/经济/繁殖）
- 品质分布表 + 阶段分布表
- 4个API并行加载（stats/economy/distributions/breeding）

#### 服务端变更
- `server/index.js` — CORS增加 `X-Admin-Key` 允许头，注册管理员路由 `/api/admin`
- `server/db.js` — 数据库兼容迁移（ALTER TABLE）
- `server/services/arena-service.js` — 管理员测试战斗支持
- `server/services/battle-engine.js` — 战斗引擎增强

#### 变更文件
- `server/middleware/admin-auth.js` — **新增** 管理员鉴权中间件
- `server/services/admin-service.js` — **新增** 540行管理后台业务逻辑
- `server/routes/admin.js` — **新增** 20个管理API端点
- `client/admin.html` — **新增** 管理后台HTML
- `client/css/admin.css` — **新增** 管理后台样式
- `client/js/admin.js` — **新增** 管理后台前端逻辑
- `server/index.js` — CORS + 路由注册
- `server/db.js` — 数据库迁移
- `client/index.html` — 入口页调整
- `client/js/arena.js` — 竞技场前端增强
- `server/services/arena-service.js` — 竞技场服务增强
- `server/services/battle-engine.js` — 战斗引擎增强


### v1.3 - 蜥蜴可见性修复 + 健康系统 + 属性面板 (2026-04-22)

> 修复蜥蜴在饲养箱中不可见的根本原因，新增健康属性全栈实现，用属性面板替换跑道侧边按钮

#### 关键修复：蜥蜴不可见（根因）

- **根因**：`auth.js` 第84行 `mainPanel.style.display = 'block'` 覆盖了 CSS `.game-screen` 的 `display: flex`
- flex 布局被破坏后，`.game-center`（`flex: 1`）高度塌缩为0，Canvas 父容器 `#canvasWrap` 高度为0，`getBoundingClientRect()` 返回零尺寸
- **修复**：`'block'` → `'flex'`，一字之差

#### LizardRenderer 健壮性增强

1. **`start()` 方法重写**
   - 每次调用都执行 `_resize()`，不依赖构造函数的初始尺寸
   - 尺寸为0时通过 `requestAnimationFrame` 延迟重试
   - 尺寸从0恢复后重新初始化 spine/legs
   - 重新绑定 resize/visibility 监听器

2. **`_ensureCanvasEvents()` 新增**
   - `_evBound` 标志追踪鼠标事件绑定状态
   - `stop()` 解绑后 `start()` 自动重新绑定

3. **`_loop()` 异常保护**
   - `_render()` 包裹 try-catch，防止未捕获异常导致渲染循环静默死亡

4. **`egg.js` rAF 延迟初始化**
   - `showPetPanel()` 中 LizardRenderer 创建和 `start()` 包裹在 `requestAnimationFrame` 中，确保浏览器布局完成后再读取尺寸

#### 健康属性（全栈）

- **数据库**：`db.js` P10迁移，pet表新增 `health`/`health_max` 字段
- **规则**：`game-rules.js` 新增 `HEALTH_INIT: 100`、`HEALTH_MAX_INIT: 100`、`HEALTH_DECAY_INTERVAL: 1800`、`HEALTH_DECAY_AMOUNT: 2`
- **服务端**：`pet-service.js` listPets/getPetDetail 返回健康字段；`nurture-service.js` applyTimeDecay 包含健康衰减，syncPet 返回健康值
- **前端**：HUD顶栏新增健康条（红色），宠物面板新增健康状态条，实时同步更新

#### 属性面板（替换跑道按钮）

- 侧边栏「跑道」按钮替换为「属性」按钮
- 单屏覆盖面板：宠物身份信息、4条状态条（饱食/体力/心情/健康）、跑道升级入口、出售宠物入口（异步估价）
- 完整 CSS 样式（暗色主题卡片布局）

#### 变更文件（9个）
- `client/js/auth.js` — display: block → flex（根因修复）
- `client/js/lizard-renderer.js` — start() 重写 + _ensureCanvasEvents + _loop try-catch
- `client/js/egg.js` — rAF 延迟渲染器初始化 + 属性面板 + 健康条
- `client/index.html` — 健康条 HTML + 属性面板结构
- `client/css/main.css` — 健康条样式 + 属性面板样式
- `server/db.js` — P10 health/health_max 迁移
- `server/models/game-rules.js` — 健康常量
- `server/services/pet-service.js` — 健康字段返回
- `server/services/nurture-service.js` — 健康衰减 + 同步

### v1.4 - 表现测试页 + 独立头部运动系统 (2026-04-25)

> 新增蜥蜴组合表现测试入口，重构头部视觉方向为独立状态，修复转向、扫视和鼠标牵引时的头部抖动问题

#### 表现测试模块

- 新增 `client/combinatorial-test.html`，作为独立的蜥蜴外观/动作组合测试页面
- 新增 `client/css/combinatorial-test.css`，提供测试页面布局、参数面板和控件样式
- 新增 `client/js/combinatorial-test.js`，集中管理渲染参数、控件绑定、实时预览与技能/隐藏基因测试
- 默认渲染参数新增 `headRotationLimit`，用于控制头部可旋转范围
- 参数面板「头部」分组新增「头部可旋转角度」，范围 `0 ~ 300`，语义为头部可在 `±headRotationLimit` 内活动

#### LizardRenderer 头部运动重构

- `client/js/lizard-renderer.js` 支持 `opts.spineNodes`，并扩展外观参数：头型、花纹类型、花纹颜色、头部大小、头部可旋转范围等
- 新增独立视觉头部角度状态：`_visualHeadAngle` / `_visualHeadAngleReady`
- `_getVisualHeadAngle()` 不再直接返回身体/颈部角度，而是返回独立视觉角度，避免脊柱节点约束造成头部抖动
- `_updateHeadTurn(targetAngle, speed, clampToBody)` 统一处理头部转向插值，可按场景选择是否受身体角度夹紧
- `_headLeadMoveFactor()` 根据头部与目标方向的夹角控制移动倍率，使转向时头部先朝运动方向转动，身体随后跟随

#### 自主运动扫视修复

- 自主暂停扫视时，不再通过 `lookOffsets` 修改 `spine[0..2]` 颈部/前段节点
- 扫视动作改为只更新独立头部视觉角度，身体节点保持稳定
- 扫视范围与 `headRotationLimit` 联动：头部可旋转角度越大，自主扫视角度越大
- 视野锥、视野检测和技能特效方向统一使用 `_getVisualHeadAngle()`

#### 鼠标牵引稳定性修复

- 新增 `_mouseLookAngle` / `_mouseLookAngleReady`，对鼠标牵引视线方向做独立平滑
- 鼠标牵引时头部朝向鼠标本身，而不是直接使用可能左右跳变的避障移动方向
- 鼠标牵引模式下每帧只更新一次头部转向，避免重复插值导致颤动
- 鼠标牵引头部转向调用 `_updateHeadTurn(..., false)`，禁用身体角度夹紧，避免身体/颈部节点变化反向拉扯头部

#### 验证

- `node --check client\js\combinatorial-test.js` 通过
- `node --check client\js\lizard-renderer.js` 通过
- `client/js/lizard-renderer.js` / `client/js/combinatorial-test.js` 无诊断错误

#### 变更文件（4个）

- `client/combinatorial-test.html` — 新增表现测试页面
- `client/css/combinatorial-test.css` — 新增表现测试页面样式
- `client/js/combinatorial-test.js` — 新增表现测试控制逻辑和参数面板
- `client/js/lizard-renderer.js` — 渲染参数扩展、独立头部视觉角度、扫视/牵引稳定性修复

### v1.5 - 解剖比例重构 + 四肢步态同步优化 (2026-04-25)

> 按蜥蜴解剖图重构身体比例、脊椎间距和四肢挂载点，并持续修复鼠标牵引、前肢弯曲方向、斜对角步态与脚掌滑动问题

#### 解剖比例与身体结构

- `LizardRenderer` 身体比例改为按解剖分界处理：头部约 `5.2%`，躯干约 `34.8%`，尾部约 `60%`
- `_bodyWidthAt(i)` 改为分段宽度曲线，匹配头、颈、躯干、尾部的长/宽变化关系
- `_drawBody()` 改为头色 → 躯干色 → 尾色的三段式渐变
- `_drawPattern()` 将花纹限制在躯干区域，避免覆盖头尾比例边界
- 新增 `_segmentLengthAt(i)`，脊椎节点间距不再固定：身体段更长，尾部逐段递减
- `_initSpine()`、`_updateSpine()`、`_enforceAngleConstraints()` 全部改用变长脊椎段长

#### 四肢挂载与结构

- 前肢挂载点调整到 `t = 0.05`，后肢挂载点调整到 `t = 0.242`，并同步修正 `_redistributeLegs()`
- 前肢 IK 弯曲方向反转，使第一对前肢关节向后弯曲
- 后肢保持原方向，并通过 `_clampLegFoot()` 限制绘制长度，避免运动中后肢被过度拉长
- 表现测试页新增眼睛颜色参数，移除「头部避让」控件

#### 斜对角同步步态

- 四肢新增 `gaitGroup`：左前肢 + 右后肢同组，右前肢 + 左后肢同组
- `_updateLegs()` 改为全局步态相位驱动，严格保持斜对角同步
- 鼠标按下但尚未发生真实位移时，不再触发四肢摆动，避免原地颤动
- 步态节奏改为基于 `headSpeed / strideDistance` 计算，使四肢运动频率与身体实际移动速度关联
- 支撑期脚点直接按速度匹配目标位置，摆动期提高跟随系数，减少脚掌在地面滑动和拖拽感

#### 鼠标牵引头部稳定性

- 新增 `_mouseTurnBaseAngle` / `_mouseTurnBaseReady`，鼠标牵引期间转向基准随身体角度缓慢更新
- 修复牵引时头部因基准角滞后导致左右过度扭转的问题

#### 验证

- `node --check client\js\lizard-renderer.js` 通过
- `client/js/lizard-renderer.js` 无诊断错误

#### 变更文件（2个）

- `client/js/lizard-renderer.js` — 解剖比例、变长脊椎、四肢挂载、前肢反转、斜对角步态、步态速度关联
- `client/js/combinatorial-test.js` — 眼睛颜色参数、移除头部避让控件

### v1.6 - 生物生成蜕变与实时战斗测试联调 (2026-04-26)

> 新增宠物组合测试到数据库的快速导入能力，接入实时战斗测试页，并修复导入宠物启动战斗时的属性与 ID 槽位问题

#### 真实战斗动画协议阶段 1（2026-04-26）

> 阶段目标：保持服务端权威战斗事实不变，在现有事件基础上并行输出真实表现动画协议事件，为后续 `BattleAnimator` 和真实蜥蜴战斗渲染器提供稳定输入。

- 新增 `server/models/battle-action-contracts.js`：定义服务端 `ACTION_CONTRACTS`，包含移动、快速移动、普通攻击、技能、感知、逃跑和死亡等动作时序。
- 新增 `client/js/battle-action-contracts.js`：提供前端同构动作合同，暴露 `window.BattleActionContracts`，供后续动画调度器使用。
- 新增 `server/services/battle-animation-mapper.js`：封装动画协议映射，提供 `mapMovementAction()`、`mapAttackAction()`、`mapSkillAction()`、`mapPerceptionAction()`、`mapVisualFx()` 和 `appendDerivedAnimationEvents()`。
- `server/services/battle-engine.js` 接入动画映射层：
  - 移动行为输出 `movement` 事件，包含 `actionId`、`from`、`to`、`speed`、`surface`、`pose`、`priority`。
  - 普通攻击输出 `combat_action` 事件，包含起止帧、命中帧、命中/闪避/暴击/伤害结果与冲击表现参数。
  - 技能行为输出 `combat_action` 事件，覆盖治疗、buff、恐惧技能和攻击型技能。
  - 每帧事件合并后追加派生 `perception_action` 与 `visual_fx`，保留旧事件实现兼容。
- `client/js/battle-debug.js` 扩展事件日志：支持展示 `movement`、`combat_action`、`perception_action`、`visual_fx`，并为新事件提供调试闪烁颜色。

#### 阶段 1 核对结论

- 旧协议事件继续保留：`hit`、`crit`、`dodge`、`skill_hit`、`sound`、`perception`、`heal`、`buff`、`fear`、`flee` 等未移除。
- 新协议事件只承担表现层输入，不改变伤害、AI、位移、声音感知、胜负等服务端权威结果。
- 当前阶段不引入真实动画播放器，只完成协议输出和调试可视化。

#### 阶段 1 验证

- `node --check` 已覆盖 `server/services/battle-engine.js`、`server/services/battle-animation-mapper.js`、`server/models/battle-action-contracts.js`、`client/js/battle-debug.js`、`client/js/battle-action-contracts.js`。
- lints 检查上述新增/修改 JS 文件均无诊断错误。
- mapper 单元验证覆盖动作合同 fallback、`movement` 映射、`combat_action` 映射。
- `petId=11` vs `petId=12` 推进 240 帧，事件流包含 `sound`、`movement`、`visual_fx`、`perception`、`perception_action`、`skill_hit`、`combat_action`、`dodge`、`hit`、`crit`。
- `battle-debug-service.batchTest({ pet1Id: 11, pet2Id: 12, count: 1 })` 返回 `code: 0`。
- `git diff --check` 通过，仅提示工作区 LF/CRLF 换行转换警告。

#### 下一阶段目标

- 阶段 2：新增前端 `BattleAnimator` 最小调度器，消费 `movement`、`combat_action`、`perception_action`、`visual_fx`，生成可插值的表现状态。
- 需要确认：动画事件是否按服务端帧直接播放，还是在前端按固定延迟缓冲；动作优先级冲突时是否允许高优先级动作打断低优先级动作；阶段 2 是否先只接入战斗调试页。

#### 真实战斗动画系统阶段 2（2026-04-26）

> 阶段目标：在战斗调试页接入最小 `BattleAnimator`，直接按服务端帧消费阶段 1 动画协议，输出可插值表现状态；高优先级动作可打断低优先级动作；`movement` 支持更细 root motion 曲线；`visual_fx` 暂只调度不完整渲染。

- 新增 `client/js/battle-animator.js`：
  - 支持浏览器 `window.BattleAnimator` 与 Node `module.exports` 双环境，便于调试页使用和命令行单元验证。
  - `ingestState(state)` 直接使用服务端帧推进，不做前端缓冲。
  - `ingestEvents(events)` 消费 `movement`、`combat_action`、`perception_action`、`visual_fx`。
  - `sampleRootMotion(event, frame)` 提供平滑插值、步态起伏、脚步相位、速度向量等更细 root motion 输出。
  - `getUnitVisual(side, fallback)` 输出表现层单位状态：`x/y/yOffset`、`actionId`、`pose`、`actionProgress`、`impact`、`footPhase`。
  - `getActiveFx()` 仅调度 `visual_fx` 生命周期和进度，不做完整特效渲染。
  - 动作优先级策略：当前动作未结束时，只有同级或更高优先级动作可以覆盖。
- `client/battle-debug.html` 增加脚本顺序：`battle-action-contracts.js` → `battle-animator.js` → `battle-debug.js`。
- `client/js/battle-debug.js` 接入 `BattleAnimator`：
  - 开始、重置、结束时重置动画器。
  - 每次 `updateAll()` 后将服务端状态送入动画器。
  - Canvas 绘制改用 `animator.getUnitVisual()` 的表现状态。
  - 简化蜥蜴调试绘制加入动作拉伸、命中高亮、移动起伏、脚步相位和当前动作标签。

#### 阶段 2 核对结论

- 阶段 2 仅接入 `client/battle-debug.html`，未影响竞技场正式页面。
- 动画播放按服务端帧直接采样，未加入缓冲队列。
- 高优先级动作可打断低优先级动作，低优先级动作不会覆盖未结束的高优先级动作。
- root motion 已从简单线性位置升级为平滑插值 + 起伏 + 脚步相位。
- `visual_fx` 目前只保存在 `fxQueue` 并输出进度，暂不做完整特效渲染，符合阶段边界。

#### 阶段 2 验证

- `node --check` 已覆盖 `client/js/battle-animator.js`、`client/js/battle-debug.js`、`client/js/battle-action-contracts.js`。
- lints 检查 `client/js/battle-animator.js`、`client/js/battle-debug.js`、`client/battle-debug.html` 均无诊断错误。
- 单元验证覆盖：root motion 插值、动作优先级打断策略、低优先级不可覆盖高优先级、`visual_fx` 调度与过期。
- `petId=11` vs `petId=12` 调试战斗推进 240 帧返回 `code: 0`，事件流包含阶段 1 动画协议事件。

#### 下一阶段目标

- 阶段 3：新增 `LizardBattleRenderer` 简化骨架版，消费 `BattleAnimator.getUnitVisual()` 输出，不再直接绘制固定椭圆占位蜥蜴。
- 需要确认：阶段 3 是否继续只接入 `client/battle-debug.html`；简化骨架是否复用 `client/js/lizard-renderer.js` 的部分比例参数，还是先实现独立轻量战斗骨架；是否需要在阶段 3 绘制 root motion 足迹/动作轨迹辅助调试。

#### 真实战斗动画系统阶段 3（2026-04-26）

> 阶段目标：继续只接入 `client/battle-debug.html`，新增简化 `LizardBattleRenderer` 战斗骨架版，复用 `client/js/lizard-renderer.js` 的解剖比例参数，并提供可关闭的 root motion 足迹 / 动作轨迹辅助调试。

- 新增 `client/js/lizard-battle-renderer.js`：
  - 支持浏览器 `window.LizardBattleRenderer` 与 Node `module.exports` 双环境。
  - 复用 `lizard-renderer.js` 的关键比例：22 节脊椎、`BASE_REF_W=1200`、`SEGMENT_LENGTH=18`、`LEG_LENGTH1=38`、`LEG_LENGTH2=34`、`STEP_DISTANCE=50`。
  - 复刻轻量版 `_segmentLengthAt()`、`_bodyWidthAt()`、`_legIndexAt()`，保持头部、躯干、尾部和四肢挂载比例一致。
  - `renderUnit(ctx, unit, options)` 消费 `BattleAnimator.getUnitVisual()` 输出，绘制简化蜥蜴骨架、身体轮廓、头部、四肢、血条和动作标签。
  - `drawMotionDebug(ctx)` 绘制左右双方 root motion 足迹 / 动作轨迹。
  - `reset()` 清空轨迹，避免新战斗复用旧轨迹。
- `client/battle-debug.html` 接入 `lizard-battle-renderer.js`，脚本顺序为 `battle-action-contracts.js` → `battle-animator.js` → `lizard-battle-renderer.js` → `battle-debug.js`。
- `client/battle-debug.html` 新增「显示 root motion 足迹 / 动作轨迹」开关，默认开启。
- `client/css/battle-debug.css` 新增 `.inline-toggle` 样式。
- `client/js/battle-debug.js`：
  - 创建 `battleRenderer` 实例。
  - Canvas 绘制优先使用 `battleRenderer.renderUnit()`，保留旧 `drawUnit()` 作为 fallback。
  - 根据开关调用 `battleRenderer.drawMotionDebug()`。
  - 开始、重置、结束战斗时同步清空渲染器轨迹。

#### 阶段 3 核对结论

- 阶段 3 仍只接入 `client/battle-debug.html`，未影响正式战斗或养成页面。
- 战斗骨架已复用 `client/js/lizard-renderer.js` 的核心比例参数和身体宽度/脊椎段长分布。
- root motion 足迹 / 动作轨迹默认开启，并可通过调试页开关关闭。
- 当前阶段仍是轻量骨架版，未迁移完整皮肤花纹、IK 足趾、隐藏基因外观和完整特效渲染。

#### 阶段 3 验证

- `node --check` 已覆盖 `client/js/lizard-battle-renderer.js`、`client/js/battle-debug.js`。
- lints 检查 `client/js/lizard-battle-renderer.js`、`client/js/battle-debug.js`、`client/battle-debug.html`、`client/css/battle-debug.css` 均无诊断错误。
- 命令行单元验证覆盖：`LizardBattleRenderer.renderUnit()` 生成 22 节脊椎、写入轨迹点、调用 Canvas 绘制接口；`drawMotionDebug()` 可在无浏览器环境下执行。

#### 下一阶段目标

- 阶段 4：增强战斗骨架表现，把 `combat_action` / `perception_action` / `visual_fx` 映射为更明确的骨架姿态、头部朝向、命中冲击和轻量特效绘制。
- 需要确认：阶段 4 是否继续只接入调试页；是否开始绘制轻量 `visual_fx`（声波、命中、闪避、技能光效）；是否需要为左右双方接入宠物 `render_params/body_seed` 以还原真实外观差异。

#### 真实战斗动画系统阶段 4（2026-04-26）

> 阶段目标：继续只接入 `client/battle-debug.html`，开始绘制轻量 `visual_fx`（声波、命中、闪避、技能光效），并为左右双方接入宠物 `render_params/body_seed`，让战斗调试页还原真实外观差异。

- `server/services/battle-debug-service.js` 扩展调试战斗启动返回：
  - 新增 `_parseBodySeed()`、`_sumAttrs()`、`_buildAppearance()`，按 `pet-service.js` 同源规则生成轻量战斗外观参数。
  - `_loadFighter()` 返回 `appearance`，包含 `body_seed` 与 `render_params`。
  - `startBattle()` 返回 `appearance.left/right`，`resetBattle()` 复用 `startBattle()`，重置后同步恢复外观数据。
- `client/js/battle-debug.js`：
  - 新增 `battleAppearance` 与 `applyAppearance()`。
  - 开始/重置战斗时接收服务端外观数据，并传入 `LizardBattleRenderer.renderUnit()`。
  - Canvas 绘制阶段调用 `battleRenderer.drawVisualFx(ctx, animator.getActiveFx(), ...)`，继续只作用于战斗调试页。
- `client/js/lizard-battle-renderer.js`：
  - 新增 `setAppearance()`、`_resolveAppearance()`，支持 `body_seed` / `render_params` 驱动左右双方颜色、体型、头部比例、肢体粗细、腿距、花纹、背刺和脊椎节点差异。
  - 增强骨架姿态：攻击/技能姿态前探，闪避姿态轻量弯曲，感知姿态抬头。
  - 新增 `_drawPattern()` 与 `_drawSpines()`，绘制轻量斑点/条纹和背刺。
  - 新增 `drawVisualFx()`，绘制 `sound_wave` / `fake_sound_wave`、`hit_flash` / `crit_hit`、`dodge_spark` / `decoy_dodge`、`skill_glow`。
- `server/services/battle-animation-mapper.js` 扩展 `mapVisualFx()`：
  - 为 `dodge` / `tail_decoy` 生成闪避特效。
  - 为 `combat_action.fx.impact` 生成命中、暴击、技能光效和闪避特效。
- `client/js/battle-animator.js` 修复 `visual_fx.frame === 0` 时被 falsy 覆盖的问题。

#### 阶段 4 核对结论

- 阶段 4 仍只接入 `client/battle-debug.html` 与 `/api/battle-debug` 调试接口，未接入正式战斗页面。
- 轻量 `visual_fx` 已从阶段 2 的“只调度”推进到 Canvas 绘制，但仍不是完整粒子/音画系统。
- 左右双方已通过调试接口接入 `render_params/body_seed`，战斗页可展示真实宠物外观差异。
- 当前外观计算逻辑与 `pet-service.js` 保持同源公式，但阶段 4 为避免大范围重构，暂未抽成公共模块。

#### 阶段 4 验证

- `node --check` 已覆盖 `server/services/battle-debug-service.js`、`server/services/battle-animation-mapper.js`、`client/js/battle-animator.js`、`client/js/battle-debug.js`、`client/js/lizard-battle-renderer.js`。
- lints 检查阶段 4 修改文件无诊断错误。
- 命令行单元验证覆盖：调试战斗返回 `appearance.left/right.render_params/body_seed`；`LizardBattleRenderer.renderUnit()` 可消费左右外观并绘制；`drawVisualFx()` 可执行声波、命中、闪避、技能光效；`BattleAnimator.getActiveFx()` 保留 `frame=0` 特效生命周期。
- `git diff --check` 通过。

#### 下一阶段目标

- 阶段 5：继续只在调试页内增强动作姿态，把不同 `actionId` 映射为更细的头部朝向、身体压缩/伸展、攻击前摇/后摇、技能蓄力和被击退表现。
- 需要确认：阶段 5 是否仍只接入 `client/battle-debug.html`；是否允许抽取公共外观计算模块减少 `pet-service.js` 与 `battle-debug-service.js` 公式重复；是否开始加入相机震动/屏幕冲击等更强表现效果。

#### 真实战斗动画系统阶段 5（2026-04-26）

> 阶段目标：继续只接入 `client/battle-debug.html`，抽取公共宠物外观计算模块，增强不同 `actionId` 的骨架姿态，并加入相机震动 / 屏幕冲击等更强表现效果。

- 新增 `server/services/pet-appearance-service.js`：
  - 集中提供 `parseBodySeed()`、`sumAttrTotals()`、`buildAttrs()`、`buildAppearance()`。
  - 统一 `body_seed` 解析、六维属性汇总、阶段倍率、背刺、腿距、花纹、肢体粗细等 `render_params` 计算。
- `server/services/pet-service.js`：
  - 删除内联 `body_seed/render_params` 重复公式，改用公共外观模块。
  - 保持详情接口返回字段 `body_seed` / `render_params` 不变。
- `server/services/battle-debug-service.js`：
  - 删除阶段 4 临时加入的 `_parseBodySeed()`、`_sumAttrs()`、`_buildAppearance()`。
  - 调试战斗左右双方外观改为调用公共 `buildAppearance()`，减少与宠物详情接口的公式漂移风险。
- `client/js/lizard-battle-renderer.js`：
  - 新增 `_poseModifiers()`，按 `bite`、`scratch`、`tail_whip`、`venom_spit`、`dragon_rush`、`regen`、`predator_eye`、`listen_alert`、`search_sound` 生成头部抬升/前探、身体压缩/伸展、转头、盘绕、技能蓄力光晕和被击回挫。
  - `_makeSpine()` 消费姿态修饰数据，增强攻击前摇/命中/后摇、技能蓄力和被击冲击表现。
- `client/js/battle-debug.js`：
  - 新增 `cameraShake` 与 `screenImpact` 状态，只作用于调试页 Canvas。
  - 从 `combat_action.fx.cameraShake`、`visual_fx`、暴击事件中提取冲击强度。
  - 绘制阶段对战斗场景应用相机偏移，并追加屏幕闪白/红框冲击叠层。
  - 开始、重置、结束战斗时清空震动与屏幕冲击状态。

#### 阶段 5 核对结论

- 阶段 5 仍只接入 `client/battle-debug.html`，未接入正式竞技场或养成页面。
- 服务端战斗权威逻辑未改变；本阶段只调整外观计算复用和前端表现层。
- 外观公式已抽到公共模块，`pet-service.js` 与 `battle-debug-service.js` 共享同一计算入口。
- 相机震动 / 屏幕冲击已开始接入，但仍为调试页轻量表现，不包含音频或完整粒子系统。

#### 阶段 5 验证

- `node --check` 覆盖本阶段修改/新增 JS 文件。
- lints 检查本阶段修改文件无新增诊断错误。
- 命令行单元验证覆盖：公共外观模块输出；宠物详情外观字段；调试战斗 `appearance.left/right`；`LizardBattleRenderer` 阶段 5 姿态渲染；调试页冲击相关函数语法检查。
- `git diff --check` 通过。

#### 整体计划回顾

- 阶段 1 已完成服务端动画协议输出。
- 阶段 2 已完成 `BattleAnimator` 最小调度器，并只接入调试页。
- 阶段 3 已完成简化骨架战斗渲染器、root motion 足迹与轨迹调试。
- 阶段 4 已完成真实外观接入与轻量 `visual_fx` 绘制。
- 阶段 5 已完成外观公共模块、动作姿态增强、相机震动和屏幕冲击。
- 当前未发现正式页面误接入问题；后续可继续推进完整粒子特效、音频联动、动作曲线编辑和正式战斗页面接入前的兼容封装。

#### 下一阶段建议

- 阶段 6：继续只在调试页内完善 `visual_fx` 粒子化表现和命中特效分层，补充技能专属轨迹、声波传播可视化、屏幕边缘方向提示，并准备正式页面接入前的渲染适配清单。

#### 真实战斗动画系统阶段 6（2026-04-26）

> 阶段目标：开发粒子化 `visual_fx`、技能专属轨迹、声波传播可视化、屏幕边缘方向提示，打通组合测试宠物到战斗测试报告流程，并完善战斗 AI 性格地图。

- `server/models/game-rules.js`：
  - 新增 `BATTLE_PERSONALITY_PRESETS`，包含 `balanced`、`brave`、`cautious`、`timid`、`cunning`、`frenzy`。
  - 性格维度覆盖攻击倾向、风险偏好、谨慎度、机动性、狡猾度、凶猛度、技能偏好和听觉敏感。
- `server/services/battle-engine.js`：
  - 新增 `normalizePersonality()`，并导出给调试服务复用。
  - `_createUnit()` 接入性格、听觉倍率和 `personalityTrace`。
  - `_updateAIState()`、`_aiDecide()`、`_pickSkill()` 根据性格调整逃跑、防御、风筝、警觉、搜索、近战距离和技能释放评分。
  - 战斗快照与摘要输出 `personality` / `personalityTrace`。
- `server/services/battle-debug-service.js` 与 `server/routes/battle-debug.js`：
  - `/meta` 返回性格预设。
  - `/start`、`/batch` 接收 `leftPersonality`、`rightPersonality`、`randomPersonality`。
  - 批量测试输出详细报告：胜率、平局率、平均时长、平均伤害、命中、暴击、闪避、技能次数、剩余 HP、AI 状态分布和样本对局。
  - 随机性格使用 `secureRandom()`，符合服务端安全随机约束。
- `client/js/lizard-battle-renderer.js`：
  - 新增粒子爆发、技能轨迹和多层声波传播绘制。
  - 为 `venom_spit`、`dragon_rush`、`regen`、`camouflage`、`iron_hide`、`predator_eye`、`scratch`、`tail_whip` 等技能提供差异化轨迹或环形效果。
  - 真声 / 假声使用不同颜色和扰动粒子表现。
- `client/battle-debug.html`、`client/js/battle-debug.js`、`client/css/battle-debug.css`：
  - 新增左右 AI 性格下拉框、随机性格开关和性格说明。
  - 开始战斗与批量测试会传递性格配置，并持久化到 localStorage。
  - 画布新增屏幕边缘方向提示，展示声源、假声、捕获、攻击等方向信息。
  - 批量测试后渲染详细战斗报告和基础平衡提示。
- `client/js/combinatorial-test.js`：
  - 组合测试导入战斗测试时，根据当前派生战斗属性推荐性格，并写入左右战斗槽 localStorage。
  - 完成“组合测试生成宠物 → 战斗测试调用 → 批量报告分析”的闭环。

#### 阶段 6 核对结论

- 阶段 6 仍只接入 `client/battle-debug.html` 调试页和组合测试导入入口，未接入正式竞技场页面。
- 服务端仍保持权威战斗计算；前端只消费帧状态、动画事件、性格配置和批量报告。
- `visual_fx` 已从轻量圆环/闪光升级为粒子化与技能专属轨迹，但仍未加入真实音频播放。
- AI 性格地图已可设定或随机赋予，且批量报告可辅助观察平衡趋势。

#### 阶段 6 验证

- `node --check` 覆盖 `battle-engine.js`、`battle-debug-service.js`、`battle-debug.js`、`lizard-battle-renderer.js`、`combinatorial-test.js` 等阶段 6 修改文件。
- lints 检查阶段 6 修改文件无新增诊断错误。
- 命令行单元验证覆盖：性格预设返回、`normalizePersonality('cunning')`、固定性格批量战斗报告、AI 状态分布输出。
- 前端 VM 语法验证覆盖阶段 6 修改的前端 JS 文件。
- `git diff --check` 通过；仅存在 Windows 工作区 LF→CRLF 提示。

#### 阶段 6 补充审视

- 可后续补充真实音频、更多技能材质贴图、正式竞技场接入适配层、报告导出 CSV/JSON。
- 当前测试页已有足够数据用于初步平衡调整，下一阶段可进入正式页面接入前的适配与兼容清单。

#### 真实战斗动画系统阶段 7：调试页音效、报告导出与自定义 AI（2026-04-26）

> 阶段目标：继续只完善 `client/battle-debug.html`，不接入正式系统；设计真实音效需求表和资源目录，支持真实音效集成；补充批量报告 CSV/JSON 导出；增强 AI 性格多维自定义配置。

- `client/battle-debug.html`：
  - 新增左右自定义性格开关与多维参数编辑区。
  - 新增真实音效开关、主音量滑块和音效状态提示。
  - 新增批量报告 `JSON` / `CSV` 导出按钮。
  - 新增音效需求表展示区。
- `client/js/battle-debug.js`：
  - 新增 `BATTLE_AUDIO_REQUIREMENTS` 音效需求表，指定资源根目录为 `client/assets/audio/battle/`，并细分 `footstep/`、`movement/`、`combat/`、`skill/`、`ui/`。
  - 真实音效加载路径为 `assets/audio/battle/...`；缺失真实文件时自动使用 WebAudio fallback 合成占位音，并在状态栏提示。
  - 音效事件覆盖脚步草地/沙地/石头/水面、失衡、假声、命中、闪避、暴击、技能释放、听觉捕获。
  - 音效播放支持主音量、事件冷却、位置声像和多变体文件名 `_01/_02/_03`。
  - 批量测试结果保存为 `lastBatchReport`，支持导出时间戳文件名的 `battle-report-*.json` 与 `battle-report-*.csv`。
  - 自定义 AI 支持 `aggression`、`risk`、`caution`、`mobility`、`cunning`、`ferocity`、`skill`、`hearing` 八维滑块，左右双方独立配置并持久化到 `localStorage`。
  - `/start` 与 `/batch` 会传递自定义性格对象；后端已有 `normalizePersonality()` 支持，无需改正式战斗系统。
- `client/css/battle-debug.css`：
  - 新增自定义性格面板、音效控制面板、导出按钮、音效需求表样式。

#### 阶段 7 核对结论

- 本阶段仍只接入 `client/battle-debug.html` 调试页，未接入正式竞技场页面。
- 音效资源目录已明确：`client/assets/audio/battle/`；当前代码不强制要求资源存在，缺失时 fallback，便于后续逐步替换真实音频。
- 数据报告导出直接使用最近一次批量测试结果，适合外部表格和脚本分析。
- AI 性格自定义已进入前端配置闭环，并复用服务端对象归一化能力。

#### 阶段 7 验证

- `node --check client/js/battle-debug.js` 通过。
- `node --check server/services/battle-debug-service.js && node --check server/services/battle-engine.js` 通过。
- lints 检查 `client/battle-debug.html`、`client/js/battle-debug.js`、`client/css/battle-debug.css` 无新增诊断错误。
- 命令行单元验证覆盖：`listMaps()` 性格预设、自定义性格对象批量测试、详细报告结构输出。
- `git diff --check` exit code 为 0；仅存在 Windows 工作区 LF→CRLF 提示。

#### 阶段 7 补充审视

- 后续可补充真实 `.ogg` 音频资源文件，优先填充脚步、命中、暴击、技能和听觉提示。
- 可继续补充报告字段：每种技能使用率、平均声音捕获次数、误判次数、地形维度分组胜率。
- 正式接入前仍需做音频开关默认策略、移动端浏览器兼容和用户首次交互解锁音频策略审查。

- `client/combinatorial-test.html` 新增「导入战斗测试」按钮和实时战斗测试入口
- `client/js/combinatorial-test.js` 将当前表现测试参数导入 `/api/admin/test/create-pet`
- 导入 payload 包含 `renderParams`、`bodySeed`、`hiddenGene`、`attrBases`、`skills`，将视觉组合映射为可战斗宠物
- 导入成功后自动维护 `rg_battle_left_pet_id` / `rg_battle_right_pet_id` 槽位，避免右方仍使用默认不存在 ID

#### 管理员快速创建宠物增强

- `server/routes/admin.js` 扩展 `/api/admin/test/create-pet` 入参，支持组合测试导入数据
- `server/services/admin-service.js` 的 `quickCreatePet()` 支持自定义外观、隐藏基因、属性基础值和技能
- 修复 `generateInitialAppearanceGene()` 未传 `patternSeed` 导致读取 `bodyHue` 报错
- 修复误用无参 `secureRandom()` 导致 `pet_attr.str_talent` NOT NULL 约束失败
- `quickCreatePet()` 改为事务写入，确保 `pet_egg`、`pet`、`pet_attr`、`pet_skill` 要么全部成功，要么全部回滚
- 导入返回增加 `hasPet`、`hasAttr`、`skillCount` 诊断字段

#### 实时战斗测试系统

- 新增 `client/battle-debug.html`、`client/css/battle-debug.css`、`client/js/battle-debug.js`
- 新增 `server/routes/battle-debug.js`、`server/services/battle-debug-service.js`
- 支持后端逐帧模拟、Canvas 实时观测、单帧推进、重置、结束和批量胜率测试
- `server/index.js` 注册 `/api/battle-debug` 路由
- `battle-debug.html` 支持 `?left=ID&right=ID`，并兼容旧参数 `?petId=ID`
- 战斗测试页自动读取最近导入/使用的左右宠物 ID

#### 战斗加载错误诊断

- `_loadFighter()` 不再返回笼统 `null`，改为返回明确错误
- 启动战斗失败时可区分：
  - 左方宠物 ID 无效
  - 左方宠物不存在
  - 左方宠物属性不存在
  - 右方宠物 ID 无效
  - 右方宠物不存在
  - 右方宠物属性不存在
- 已验证当前数据库中导入宠物 `11` 与 `12` 可正常创建战斗会话

#### 生物生成与战斗表现增强

- `client/js/lizard-renderer.js` 扩展生命阶段、隐藏基因、技能表现、外观组合渲染参数
- `server/models/game-rules.js` 扩展战斗身体部位、地图、技能/蜕变相关配置
- `server/services/battle-engine.js` 增强实时战斗状态、身体部位、防御/再生/恐惧/技能事件等模拟能力
- `server/services/nurture-service.js`、`server/services/pet-service.js` 同步适配蜕变、隐藏基因和战斗展示字段

#### 验证

- 全项目 `.js` 文件执行 `node --check` 通过
- `client/` 与 `server/` 目录 lints 均无诊断错误
- 手动调用 `debug.startBattle({ pet1Id: 11, pet2Id: 12, mapId: 'grassland' })` 返回 `code: 0`

#### 变更文件

- `client/combinatorial-test.html` — 导入按钮和战斗测试入口
- `client/css/combinatorial-test.css` — 导入按钮与测试页样式增强
- `client/js/combinatorial-test.js` — 组合参数导入、属性推导、左右战斗槽位维护
- `client/battle-debug.html` — 新增实时战斗测试页面
- `client/css/battle-debug.css` — 新增实时战斗测试样式
- `client/js/battle-debug.js` — 新增战斗测试前端逻辑、URL/本地槽位 ID 填充
- `server/routes/battle-debug.js` — 新增战斗测试 API 路由
- `server/services/battle-debug-service.js` — 新增战斗测试会话服务与详细加载诊断
- `server/routes/admin.js` — 扩展测试宠物创建入参
- `server/services/admin-service.js` — 组合测试导入、事务写库、导入诊断字段
- `server/index.js` — 注册战斗测试路由
- `server/models/game-rules.js` — 战斗/蜕变/技能数值扩展
- `server/services/battle-engine.js` — 实时战斗模拟增强
- `server/services/nurture-service.js` — 蜕变与状态同步增强
- `server/services/pet-service.js` — 宠物详情字段适配
- `client/js/arena.js` — 竞技场前端适配战斗增强
- `client/js/lizard-renderer.js` — 生物表现、阶段、隐藏基因和技能渲染增强
- `docs/07-creature-generation-and-evolution.md` — 生物生成与蜕变设计记录
