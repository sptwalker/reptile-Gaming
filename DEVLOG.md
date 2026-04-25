# Reptile Gaming - 蜥蜴模拟器 开发文档

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

## 开发历程

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
