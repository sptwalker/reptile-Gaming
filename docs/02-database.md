# Web爬虫宠物养成游戏 - 数据库表结构设计

> 数据库引擎：SQLite 3  
> 时间戳字段统一使用 Unix 秒级时间戳（INTEGER）  
> 布尔字段使用 INTEGER（0/1）  
> 枚举字段使用 INTEGER，映射关系在 `server/models/game-rules.js` 中定义

---

## 1. 用户表（user）

存储玩家账号信息与经济数据。

```sql
CREATE TABLE IF NOT EXISTS user (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,          -- 用户名（3~16字符）
    password_hash   TEXT    NOT NULL,                 -- bcrypt哈希密码
    nickname        TEXT    NOT NULL DEFAULT '',      -- 显示昵称
    gold            INTEGER NOT NULL DEFAULT 0,       -- 金币余额
    diamond         INTEGER NOT NULL DEFAULT 0,       -- 钻石余额（预留高级货币）
    egg_claimed     INTEGER NOT NULL DEFAULT 0,       -- 是否已领取初始蛋（0/1）
    last_login_at   INTEGER NOT NULL DEFAULT 0,       -- 最后登录时间
    created_at      INTEGER NOT NULL DEFAULT 0,       -- 注册时间
    updated_at      INTEGER NOT NULL DEFAULT 0        -- 最后更新时间
);

CREATE UNIQUE INDEX idx_user_username ON user(username);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 用户ID |
| username | TEXT | UNIQUE, NOT NULL | 登录用户名 |
| password_hash | TEXT | NOT NULL | bcrypt哈希后的密码 |
| nickname | TEXT | NOT NULL, DEFAULT '' | 显示昵称 |
| gold | INTEGER | NOT NULL, DEFAULT 0 | 金币余额 |
| diamond | INTEGER | NOT NULL, DEFAULT 0 | 钻石（预留） |
| egg_claimed | INTEGER | NOT NULL, DEFAULT 0 | 是否已领取初始蛋 |
| last_login_at | INTEGER | NOT NULL, DEFAULT 0 | 最后登录Unix时间戳 |
| created_at | INTEGER | NOT NULL, DEFAULT 0 | 注册Unix时间戳 |
| updated_at | INTEGER | NOT NULL, DEFAULT 0 | 更新Unix时间戳 |

---

## 2. 宠物蛋表（pet_egg）

存储玩家获得的宠物蛋及其孵化状态。

```sql
CREATE TABLE IF NOT EXISTS pet_egg (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,                 -- 所属用户
    quality         INTEGER NOT NULL DEFAULT 1,       -- 品质等级（1普通~5传说）
    pattern_seed    TEXT    NOT NULL DEFAULT '',       -- 外观种子（JSON，决定花纹/颜色）
    is_hatched      INTEGER NOT NULL DEFAULT 0,       -- 是否已孵化（0/1）
    hatch_start_at  INTEGER NOT NULL DEFAULT 0,       -- 开始孵化时间（0=未开始）
    hatch_duration  INTEGER NOT NULL DEFAULT 0,       -- 孵化所需秒数
    talent_points   INTEGER NOT NULL DEFAULT 0,       -- 可分配天赋点（孵化时生成）
    created_at      INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX idx_egg_user ON pet_egg(user_id);
CREATE INDEX idx_egg_hatched ON pet_egg(is_hatched);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 蛋ID |
| user_id | INTEGER | FK → user.id | 所属用户 |
| quality | INTEGER | NOT NULL, DEFAULT 1 | 品质：1普通 2优秀 3稀有 4史诗 5传说 |
| pattern_seed | TEXT | NOT NULL, DEFAULT '' | 外观种子JSON（颜色/花纹/体型基因） |
| is_hatched | INTEGER | NOT NULL, DEFAULT 0 | 是否已孵化 |
| hatch_start_at | INTEGER | NOT NULL, DEFAULT 0 | 孵化开始时间戳（0=未开始） |
| hatch_duration | INTEGER | NOT NULL, DEFAULT 0 | 孵化所需时长（秒） |
| talent_points | INTEGER | NOT NULL, DEFAULT 0 | 孵化时随机生成的可分配天赋点 |
| created_at | INTEGER | NOT NULL, DEFAULT 0 | 创建时间 |
| updated_at | INTEGER | NOT NULL, DEFAULT 0 | 更新时间 |

---

## 3. 宠物主表（pet）

存储宠物核心信息与成长状态。

```sql
CREATE TABLE IF NOT EXISTS pet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,                 -- 所属用户
    egg_id          INTEGER NOT NULL,                 -- 来源蛋ID
    name            TEXT    NOT NULL DEFAULT '',       -- 宠物名称
    quality         INTEGER NOT NULL DEFAULT 1,       -- 继承蛋的品质
    level           INTEGER NOT NULL DEFAULT 1,       -- 当前等级
    exp             INTEGER NOT NULL DEFAULT 0,       -- 当前经验值
    stage           INTEGER NOT NULL DEFAULT 0,       -- 蜕变阶段（0幼体 1少年 2成年 3完全体）
    stamina         INTEGER NOT NULL DEFAULT 100,     -- 当前体力值
    stamina_max     INTEGER NOT NULL DEFAULT 100,     -- 体力上限
    satiety         INTEGER NOT NULL DEFAULT 100,     -- 当前饱食度
    satiety_max     INTEGER NOT NULL DEFAULT 100,     -- 饱食度上限
    mood            INTEGER NOT NULL DEFAULT 50,      -- 心情值（0~100）
    is_active       INTEGER NOT NULL DEFAULT 1,       -- 是否为当前出战宠物
    body_seed       TEXT    NOT NULL DEFAULT '',       -- 身体参数种子JSON
    created_at      INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (egg_id)  REFERENCES pet_egg(id)
);

CREATE INDEX idx_pet_user   ON pet(user_id);
CREATE INDEX idx_pet_active ON pet(user_id, is_active);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 宠物ID |
| user_id | INTEGER | FK → user.id | 所属用户 |
| egg_id | INTEGER | FK → pet_egg.id | 来源蛋 |
| name | TEXT | NOT NULL, DEFAULT '' | 宠物名称（玩家自定义） |
| quality | INTEGER | NOT NULL, DEFAULT 1 | 品质等级（继承自蛋） |
| level | INTEGER | NOT NULL, DEFAULT 1 | 当前等级 |
| exp | INTEGER | NOT NULL, DEFAULT 0 | 当前经验值 |
| stage | INTEGER | NOT NULL, DEFAULT 0 | 蜕变阶段：0幼体 1少年 2成年 3完全体 |
| stamina | INTEGER | NOT NULL, DEFAULT 100 | 当前体力 |
| stamina_max | INTEGER | NOT NULL, DEFAULT 100 | 体力上限 |
| satiety | INTEGER | NOT NULL, DEFAULT 100 | 当前饱食度 |
| satiety_max | INTEGER | NOT NULL, DEFAULT 100 | 饱食度上限 |
| mood | INTEGER | NOT NULL, DEFAULT 50 | 心情值（0~100） |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | 是否出战中 |
| body_seed | TEXT | NOT NULL, DEFAULT '' | 身体渲染参数JSON |
| created_at | INTEGER | NOT NULL, DEFAULT 0 | 创建时间 |
| updated_at | INTEGER | NOT NULL, DEFAULT 0 | 更新时间 |

---

## 4. 宠物属性表（pet_attr）

存储宠物的六维基础属性与天赋加成。每只宠物一条记录。

```sql
CREATE TABLE IF NOT EXISTS pet_attr (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id          INTEGER NOT NULL UNIQUE,           -- 关联宠物（一对一）
    -- 六维基础属性（天赋分配 + 成长累加）
    str_base        INTEGER NOT NULL DEFAULT 0,        -- 力量-基础值
    str_talent      INTEGER NOT NULL DEFAULT 0,        -- 力量-天赋加成
    agi_base        INTEGER NOT NULL DEFAULT 0,        -- 敏捷-基础值
    agi_talent      INTEGER NOT NULL DEFAULT 0,        -- 敏捷-天赋加成
    vit_base        INTEGER NOT NULL DEFAULT 0,        -- 体质-基础值
    vit_talent      INTEGER NOT NULL DEFAULT 0,        -- 体质-天赋加成
    int_base        INTEGER NOT NULL DEFAULT 0,        -- 智力-基础值
    int_talent      INTEGER NOT NULL DEFAULT 0,        -- 智力-天赋加成
    per_base        INTEGER NOT NULL DEFAULT 0,        -- 感知-基础值
    per_talent      INTEGER NOT NULL DEFAULT 0,        -- 感知-天赋加成
    cha_base        INTEGER NOT NULL DEFAULT 0,        -- 魅力-基础值
    cha_talent      INTEGER NOT NULL DEFAULT 0,        -- 魅力-天赋加成
    -- 衍生属性（由服务端根据公式计算，缓存在此）
    hp_max          INTEGER NOT NULL DEFAULT 0,        -- 生命上限
    atk             INTEGER NOT NULL DEFAULT 0,        -- 攻击力
    def             INTEGER NOT NULL DEFAULT 0,        -- 防御力
    spd             INTEGER NOT NULL DEFAULT 0,        -- 速度
    crit_rate       INTEGER NOT NULL DEFAULT 0,        -- 暴击率（万分比）
    dodge_rate      INTEGER NOT NULL DEFAULT 0,        -- 闪避率（万分比）
    created_at      INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (pet_id) REFERENCES pet(id)
);

CREATE UNIQUE INDEX idx_attr_pet ON pet_attr(pet_id);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 记录ID |
| pet_id | INTEGER | FK → pet.id, UNIQUE | 关联宠物（一对一） |
| str_base | INTEGER | DEFAULT 0 | 力量基础值 |
| str_talent | INTEGER | DEFAULT 0 | 力量天赋加成 |
| agi_base | INTEGER | DEFAULT 0 | 敏捷基础值 |
| agi_talent | INTEGER | DEFAULT 0 | 敏捷天赋加成 |
| vit_base | INTEGER | DEFAULT 0 | 体质基础值 |
| vit_talent | INTEGER | DEFAULT 0 | 体质天赋加成 |
| int_base | INTEGER | DEFAULT 0 | 智力基础值 |
| int_talent | INTEGER | DEFAULT 0 | 智力天赋加成 |
| per_base | INTEGER | DEFAULT 0 | 感知基础值 |
| per_talent | INTEGER | DEFAULT 0 | 感知天赋加成 |
| cha_base | INTEGER | DEFAULT 0 | 魅力基础值 |
| cha_talent | INTEGER | DEFAULT 0 | 魅力天赋加成 |
| hp_max | INTEGER | DEFAULT 0 | 生命上限（衍生） |
| atk | INTEGER | DEFAULT 0 | 攻击力（衍生） |
| def | INTEGER | DEFAULT 0 | 防御力（衍生） |
| spd | INTEGER | DEFAULT 0 | 速度（衍生） |
| crit_rate | INTEGER | DEFAULT 0 | 暴击率（万分比） |
| dodge_rate | INTEGER | DEFAULT 0 | 闪避率（万分比） |
| created_at | INTEGER | DEFAULT 0 | 创建时间 |
| updated_at | INTEGER | DEFAULT 0 | 更新时间 |

### 属性映射关系

| 六维属性 | 影响的衍生属性 | 影响的渲染参数 |
|----------|---------------|---------------|
| 力量(STR) | atk, hp_max | 体型宽度、头部大小 |
| 敏捷(AGI) | spd, dodge_rate | 移动速度、腿部步频 |
| 体质(VIT) | hp_max, def, stamina_max | 身体节数、体节粗细 |
| 智力(INT) | 技能冷却、AI行为丰富度 | 视野角度、眼睛大小 |
| 感知(PER) | crit_rate, 视野距离 | FOV距离、警惕反应 |
| 魅力(CHA) | 社交收益、交易加成 | 花纹复杂度、颜色饱和度 |

---

## 5. 宠物技能表（pet_skill）

存储宠物已学习的技能。每只宠物可拥有多个技能。

```sql
CREATE TABLE IF NOT EXISTS pet_skill (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id          INTEGER NOT NULL,                  -- 关联宠物
    skill_code      TEXT    NOT NULL,                   -- 技能代码（如 'bite', 'tail_whip'）
    skill_level     INTEGER NOT NULL DEFAULT 1,         -- 技能等级
    cooldown        INTEGER NOT NULL DEFAULT 0,         -- 当前冷却剩余（秒）
    is_equipped     INTEGER NOT NULL DEFAULT 0,         -- 是否装备到技能栏（0/1）
    slot_index      INTEGER NOT NULL DEFAULT -1,        -- 技能栏位置（-1=未装备，0~3=栏位）
    unlocked_at     INTEGER NOT NULL DEFAULT 0,         -- 解锁时间
    created_at      INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (pet_id) REFERENCES pet(id)
);

CREATE INDEX idx_skill_pet ON pet_skill(pet_id);
CREATE UNIQUE INDEX idx_skill_unique ON pet_skill(pet_id, skill_code);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 记录ID |
| pet_id | INTEGER | FK → pet.id | 关联宠物 |
| skill_code | TEXT | NOT NULL | 技能代码标识符 |
| skill_level | INTEGER | NOT NULL, DEFAULT 1 | 技能等级 |
| cooldown | INTEGER | NOT NULL, DEFAULT 0 | 当前冷却剩余秒数 |
| is_equipped | INTEGER | NOT NULL, DEFAULT 0 | 是否装备 |
| slot_index | INTEGER | NOT NULL, DEFAULT -1 | 技能栏位置（-1=未装备） |
| unlocked_at | INTEGER | NOT NULL, DEFAULT 0 | 解锁时间 |
| created_at | INTEGER | NOT NULL, DEFAULT 0 | 创建时间 |
| updated_at | INTEGER | NOT NULL, DEFAULT 0 | 更新时间 |

### 技能代码预定义

| skill_code | 名称 | 类型 | 解锁条件 |
|------------|------|------|----------|
| bite | 撕咬 | 主动-物理 | 默认技能 |
| tail_whip | 尾击 | 主动-物理 | STR ≥ 10 |
| camouflage | 伪装 | 主动-辅助 | AGI ≥ 15 |
| venom_spit | 毒液喷射 | 主动-特殊 | INT ≥ 12 |
| keen_eye | 锐眼 | 被动-感知 | PER ≥ 10 |
| thick_skin | 厚皮 | 被动-防御 | VIT ≥ 15 |
| charm_aura | 魅力光环 | 被动-社交 | CHA ≥ 12 |
| regenerate | 再生 | 被动-恢复 | VIT ≥ 20, stage ≥ 2 |

---

## 6. 玩家日志表（log）

记录玩家所有关键操作，用于审计、防刷和数据分析。

```sql
CREATE TABLE IF NOT EXISTS log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,                  -- 操作用户
    action          TEXT    NOT NULL,                   -- 操作类型
    target_type     TEXT    NOT NULL DEFAULT '',        -- 目标类型（pet/egg/user/system）
    target_id       INTEGER NOT NULL DEFAULT 0,        -- 目标ID
    detail          TEXT    NOT NULL DEFAULT '',        -- 详情JSON
    ip              TEXT    NOT NULL DEFAULT '',        -- 请求IP
    created_at      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX idx_log_user   ON log(user_id);
CREATE INDEX idx_log_action ON log(action);
CREATE INDEX idx_log_time   ON log(created_at);
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 日志ID |
| user_id | INTEGER | FK → user.id | 操作用户 |
| action | TEXT | NOT NULL | 操作类型代码 |
| target_type | TEXT | DEFAULT '' | 目标类型 |
| target_id | INTEGER | DEFAULT 0 | 目标ID |
| detail | TEXT | DEFAULT '' | 详情JSON |
| ip | TEXT | DEFAULT '' | 请求IP地址 |
| created_at | INTEGER | DEFAULT 0 | 操作时间 |

### 操作类型定义

| action | 说明 | detail内容示例 |
|--------|------|---------------|
| register | 注册 | `{}` |
| login | 登录 | `{"ip":"..."}` |
| egg_claim | 领取蛋 | `{"egg_id":1,"quality":3}` |
| hatch_start | 开始孵化 | `{"egg_id":1}` |
| hatch_finish | 孵化完成 | `{"egg_id":1,"pet_id":1,"talent_points":12}` |
| talent_assign | 天赋分配 | `{"pet_id":1,"str":3,"agi":2,...}` |
| feed | 喂食 | `{"pet_id":1,"food":"insect","satiety_delta":20}` |
| evolve | 蜕变 | `{"pet_id":1,"from_stage":0,"to_stage":1}` |
| skill_unlock | 技能解锁 | `{"pet_id":1,"skill_code":"tail_whip"}` |
| gold_change | 金币变动 | `{"delta":100,"reason":"daily_login","balance":500}` |
| pet_rename | 宠物改名 | `{"pet_id":1,"old":"","new":"小绿"}` |

---

## 7. ER关系图

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│   user   │1────N│ pet_egg  │1────1│   pet    │
│          │       │          │       │          │
│ id (PK)  │       │ user_id  │       │ user_id  │
│ username │       │ quality  │       │ egg_id   │
│ gold     │       │ is_hatched│      │ level    │
│ diamond  │       └──────────┘       │ stage    │
└──────────┘                          └────┬─────┘
      │                                    │
      │                              1─────┤─────1
      │                              │           │
      │                        ┌─────┴────┐ ┌────┴─────┐
      │                        │ pet_attr │ │pet_skill │
      │                        │          │ │          │
      │                        │ pet_id   │ │ pet_id   │
      │                        │ str_base │ │skill_code│
      │                        │ agi_base │ │skill_lvl │
      │                        └──────────┘ └──────────┘
      │
      │1────N
      │
┌─────┴────┐
│   log    │
│          │
│ user_id  │
│ action   │
│ detail   │
└──────────┘
```

### 关系说明

| 关系 | 类型 | 说明 |
|------|------|------|
| user → pet_egg | 1:N | 一个用户可拥有多个蛋 |
| pet_egg → pet | 1:1 | 一个蛋孵化出一只宠物 |
| user → pet | 1:N | 一个用户可拥有多只宠物 |
| pet → pet_attr | 1:1 | 每只宠物一套属性 |
| pet → pet_skill | 1:N | 每只宠物多个技能 |
| user → log | 1:N | 每个用户多条日志 |

---

## 8. 初始化脚本位置

数据库初始化建表逻辑位于 `server/db.js`，在服务启动时自动执行 `CREATE TABLE IF NOT EXISTS`。

所有表的 `created_at` / `updated_at` 由服务端业务代码在插入/更新时显式设置 `Math.floor(Date.now() / 1000)`，不使用数据库触发器。
