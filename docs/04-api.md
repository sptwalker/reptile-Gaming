# Web爬虫宠物养成游戏 - RESTful API接口文档

> 基础路径：`/api`  
> 请求方式：全部 `POST`  
> Content-Type：`application/json`  
> 鉴权方式：Header `Authorization: Bearer {token}`（标注🔒的接口需要）  
> 响应格式：`{ "code": 0, "data": {}, "msg": "success" }`

---

## 1. 用户模块（/api/user）

### 1.1 注册

```
POST /api/user/register
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✓ | 用户名（3~16字符，字母数字下划线） |
| password | string | ✓ | 密码（6~32字符） |
| nickname | string | ✗ | 昵称（默认=username，最长16字符） |

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "user_id": 1,
        "username": "player1",
        "nickname": "player1"
    },
    "msg": "success"
}
```

**错误码：** 1001参数错误, 2001用户已存在

---

### 1.2 登录

```
POST /api/user/login
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✓ | 用户名 |
| password | string | ✓ | 密码 |

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "token": "eyJhbGciOi...",
        "expires_in": 86400,
        "user": {
            "id": 1,
            "username": "player1",
            "nickname": "player1",
            "gold": 50,
            "diamond": 0,
            "egg_claimed": 0
        }
    },
    "msg": "success"
}
```

**错误码：** 1001参数错误, 2002密码错误

---

### 1.3 获取用户信息 🔒

```
POST /api/user/info
```

**请求参数：** 无（通过token识别用户）

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "id": 1,
        "username": "player1",
        "nickname": "player1",
        "gold": 150,
        "diamond": 0,
        "egg_claimed": 1,
        "last_login_at": 1745136000,
        "created_at": 1745049600
    },
    "msg": "success"
}
```

**错误码：** 1002未登录/Token过期

---

## 2. 宠物蛋模块（/api/egg）

### 2.1 领取初始蛋 🔒

```
POST /api/egg/claim
```

**请求参数：** 无

**业务逻辑：**
1. 检查 `user.egg_claimed == 0`
2. 服务端随机品质（加权随机）
3. 生成 `pattern_seed`
4. 创建 `pet_egg` 记录
5. 设置 `user.egg_claimed = 1`

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "egg_id": 1,
        "quality": 3,
        "quality_name": "稀有",
        "pattern_seed": {
            "bodyHue": 120,
            "bodyLightness": 40,
            "patternType": 2,
            "patternHue": 60,
            "patternDensity": 3,
            "eyeColor": 30,
            "tailRatio": 0.35,
            "headShape": 1
        }
    },
    "msg": "success"
}
```

**错误码：** 1002未登录, 3002已领取过蛋

---

### 2.2 查询我的蛋列表 🔒

```
POST /api/egg/list
```

**请求参数：** 无

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "eggs": [
            {
                "id": 1,
                "quality": 3,
                "quality_name": "稀有",
                "is_hatched": 0,
                "hatch_start_at": 0,
                "hatch_duration": 600,
                "talent_points": 0,
                "created_at": 1745049600
            }
        ]
    },
    "msg": "success"
}
```

---

## 3. 孵化模块（/api/hatch）

### 3.1 开始孵化 🔒

```
POST /api/hatch/start
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| egg_id | number | ✓ | 蛋ID |

**业务逻辑：**
1. 校验蛋属于当前用户且未孵化
2. 检查无其他蛋正在孵化
3. 设置 `hatch_start_at = now()`
4. 根据品质设置 `hatch_duration`

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "egg_id": 1,
        "hatch_start_at": 1745136000,
        "hatch_duration": 600,
        "estimated_finish": 1745136600
    },
    "msg": "success"
}
```

**错误码：** 3001蛋不存在, 4001已有蛋在孵化中

---

### 3.2 查询孵化状态 🔒

```
POST /api/hatch/status
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| egg_id | number | ✓ | 蛋ID |

**成功响应（孵化中）：**

```json
{
    "code": 0,
    "data": {
        "egg_id": 1,
        "status": "hatching",
        "progress": 0.65,
        "remaining_seconds": 210
    },
    "msg": "success"
}
```

**成功响应（孵化完成）：**

```json
{
    "code": 0,
    "data": {
        "egg_id": 1,
        "status": "ready",
        "progress": 1.0,
        "talent_points": 17,
        "quality": 3
    },
    "msg": "success"
}
```

---

### 3.3 完成孵化（天赋分配） 🔒

```
POST /api/hatch/finish
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| egg_id | number | ✓ | 蛋ID |
| pet_name | string | ✓ | 宠物名称（1~12字符） |
| talents | object | ✓ | 天赋分配 |
| talents.str | number | ✓ | 力量天赋点 |
| talents.agi | number | ✓ | 敏捷天赋点 |
| talents.vit | number | ✓ | 体质天赋点 |
| talents.int | number | ✓ | 智力天赋点 |
| talents.per | number | ✓ | 感知天赋点 |
| talents.cha | number | ✓ | 魅力天赋点 |

**服务端校验：**
- `sum(talents) === egg.talent_points`
- 每项 `>= 0`
- 蛋状态为已孵化且未创建宠物

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pet_id": 1,
        "name": "小绿",
        "quality": 3,
        "level": 1,
        "stage": 0,
        "attrs": {
            "str": { "base": 5, "talent": 3, "total": 8 },
            "agi": { "base": 5, "talent": 4, "total": 9 },
            "vit": { "base": 5, "talent": 3, "total": 8 },
            "int": { "base": 5, "talent": 2, "total": 7 },
            "per": { "base": 5, "talent": 3, "total": 8 },
            "cha": { "base": 5, "talent": 2, "total": 7 }
        },
        "derived": {
            "hp_max": 109, "atk": 35, "def": 21,
            "spd": 26, "crit_rate": 560, "dodge_rate": 480
        }
    },
    "msg": "success"
}
```

**错误码：** 4001孵化未完成, 4002天赋分配错误

---

## 4. 宠物模块（/api/pet）

### 4.1 获取宠物列表 🔒

```
POST /api/pet/list
```

**请求参数：** 无

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pets": [
            {
                "id": 1,
                "name": "小绿",
                "quality": 3,
                "level": 5,
                "stage": 0,
                "stamina": 80,
                "stamina_max": 100,
                "satiety": 65,
                "satiety_max": 100,
                "mood": 70,
                "is_active": 1,
                "created_at": 1745136600
            }
        ]
    },
    "msg": "success"
}
```

---

### 4.2 获取宠物详情 🔒

```
POST /api/pet/detail
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pet_id | number | ✓ | 宠物ID |

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pet": {
            "id": 1, "name": "小绿", "quality": 3,
            "level": 5, "exp": 230, "exp_next": 750,
            "stage": 0, "stage_name": "幼体",
            "stamina": 80, "stamina_max": 100,
            "satiety": 65, "satiety_max": 100,
            "mood": 70, "is_active": 1
        },
        "attrs": {
            "str": { "base": 13, "talent": 3, "total": 16 },
            "agi": { "base": 13, "talent": 4, "total": 17 },
            "vit": { "base": 13, "talent": 3, "total": 16 },
            "int": { "base": 13, "talent": 2, "total": 15 },
            "per": { "base": 13, "talent": 3, "total": 16 },
            "cha": { "base": 13, "talent": 2, "total": 15 }
        },
        "derived": {
            "hp_max": 213, "atk": 68, "def": 45,
            "spd": 50, "crit_rate": 1140, "dodge_rate": 920
        },
        "skills": [
            {
                "skill_code": "bite", "skill_level": 2,
                "is_equipped": 1, "slot_index": 0
            }
        ],
        "body_seed": { "bodyHue": 120, "patternType": 2 },
        "render_params": {
            "bodyWidth": 1.16, "headScale": 1.128,
            "moveSpeed": 1.255, "spineNodes": 23,
            "fovAngle": 1.15, "fovDistance": 1.32,
            "colorSaturation": 1.15
        }
    },
    "msg": "success"
}
```

---

### 4.3 同步宠物状态 🔒

```
POST /api/pet/sync
```

用于前端定期同步宠物的实时状态（体力/饱食度自然衰减后的最新值）。

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pet_id | number | ✓ | 宠物ID |

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pet_id": 1,
        "stamina": 78,
        "satiety": 60,
        "mood": 68,
        "exp": 230,
        "level": 5,
        "gold": 145,
        "server_time": 1745140200
    },
    "msg": "success"
}
```

---

### 4.4 宠物改名 🔒

```
POST /api/pet/rename
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pet_id | number | ✓ | 宠物ID |
| name | string | ✓ | 新名称（1~12字符） |

**成功响应：**

```json
{
    "code": 0,
    "data": { "pet_id": 1, "name": "翠鳞", "gold_cost": 20 },
    "msg": "success"
}
```

**错误码：** 5002金币不足

---

## 5. 养成模块（/api/nurture）

### 5.1 喂食 🔒

```
POST /api/nurture/feed
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pet_id | number | ✓ | 宠物ID |
| food | string | ✓ | 食物代码（insect/fruit/meat/live_prey/spirit_bug） |

**服务端校验：**
- 金币足够
- 饱食度未满
- 喂食冷却已过（30秒）
- 体力 > 0（spirit_bug需要体力≥10）

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pet_id": 1,
        "food": "fruit",
        "gold_cost": 10,
        "gold_remain": 135,
        "satiety": { "before": 60, "after": 90 },
        "exp": { "before": 230, "after": 245 },
        "mood_delta": 5,
        "level_up": false,
        "next_feed_at": 1745140230
    },
    "msg": "success"
}
```

**错误码：** 5001体力不足, 5002金币不足, 9001请求过于频繁（冷却中）

---

### 5.2 蜕变 🔒

```
POST /api/nurture/evolve
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pet_id | number | ✓ | 宠物ID |

**服务端校验：**
- 等级达到蜕变要求
- 品质允许目标阶段
- 体力 ≥ 50
- 金币足够
- 属性条件满足

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pet_id": 1,
        "stage": { "before": 0, "after": 1, "name": "少年" },
        "gold_cost": 100,
        "stamina_cost": 50,
        "level_cap_new": 25,
        "stamina_max_new": 120,
        "satiety_max_new": 110,
        "attr_bonus": { "str": 3, "agi": 3, "vit": 3, "int": 3, "per": 3, "cha": 3 },
        "new_skill_slots": 3,
        "render_changes": {
            "bodyWidth": 1.19,
            "spineNodes": 24
        }
    },
    "msg": "success"
}
```

**错误码：** 5001体力不足, 5002金币不足, 5003蜕变条件不满足

---

### 5.3 休息 🔒

```
POST /api/nurture/rest
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pet_id | number | ✓ | 宠物ID |

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "pet_id": 1,
        "stamina": { "before": 30, "after": 50 },
        "next_rest_at": 1745141800
    },
    "msg": "success"
}
```

**错误码：** 9001请求过于频繁（冷却中）

---

## 6. 日志模块（/api/log）

### 6.1 查询操作日志 🔒

```
POST /api/log/list
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | ✗ | 筛选操作类型 |
| page | number | ✗ | 页码（默认1） |
| page_size | number | ✗ | 每页条数（默认20，最大50） |

**成功响应：**

```json
{
    "code": 0,
    "data": {
        "total": 42,
        "page": 1,
        "page_size": 20,
        "logs": [
            {
                "id": 42,
                "action": "feed",
                "target_type": "pet",
                "target_id": 1,
                "detail": "{\"food\":\"fruit\",\"satiety_delta\":30}",
                "created_at": 1745140200
            }
        ]
    },
    "msg": "success"
}
```

---

## 7. 错误码汇总

| code | 含义 | 触发场景 |
|------|------|---------|
| 0 | 成功 | — |
| 1001 | 参数错误 | 缺少必填字段、格式不合法 |
| 1002 | 未登录/Token过期 | 无token或token无效 |
| 1003 | 权限不足 | 操作他人资源 |
| 2001 | 用户已存在 | 注册重复用户名 |
| 2002 | 密码错误 | 登录密码不匹配 |
| 3001 | 蛋不存在 | egg_id无效或不属于当前用户 |
| 3002 | 已领取过蛋 | 重复领取初始蛋 |
| 4001 | 孵化未完成 | 尝试完成未就绪的孵化 |
| 4002 | 天赋分配错误 | 点数总和不匹配或存在负数 |
| 5001 | 体力不足 | 操作需要体力但不够 |
| 5002 | 金币不足 | 购买/操作需要金币但不够 |
| 5003 | 蜕变条件不满足 | 等级/属性/品质不达标 |
| 9001 | 请求过于频繁 | 触发限流或冷却 |
| 9999 | 服务器内部错误 | 未预期的异常 |

---

## 8. 限流规则

| 接口 | 限流策略 |
|------|---------|
| /api/user/register | 同IP 5次/分钟 |
| /api/user/login | 同IP 10次/分钟，同用户名 5次/分钟 |
| /api/nurture/feed | 同用户 2次/分钟（含业务冷却30秒） |
| /api/pet/sync | 同用户 12次/分钟 |
| 其他接口 | 同用户 30次/分钟 |

---

## 9. Token规范

- 算法：HS256 JWT
- 有效期：24小时（86400秒）
- Payload：`{ "uid": 用户ID, "iat": 签发时间, "exp": 过期时间 }`
- 密钥存储：`server/config.js` 的 `JWT_SECRET`（从环境变量读取）
- 刷新策略：前端在token剩余有效期 < 1小时时自动重新登录
