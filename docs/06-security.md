# Web爬虫宠物养成游戏 - 全局强制约束规则

> 本文档定义所有开发阶段必须遵守的安全、防作弊和数据完整性约束  
> 任何代码变更不得违反本文档中的规则  
> 规则编号格式：`S-{类别}{序号}`，便于代码注释引用

---

## 1. 服务端权威（S-A系列）

### S-A01：服务端为唯一计算源

所有游戏数值的计算（经验值、属性、金币、品质随机、天赋点生成）**必须且只能**在服务端执行。前端不得包含任何数值计算逻辑。

**检查方法：** 前端代码中不得出现 `game-rules.js` 的数值常量引用（渲染映射公式除外）。

### S-A02：前端仅发送操作意图

前端请求体中**禁止**包含计算结果。只允许发送操作标识符。

```
✗ { "action": "feed", "exp_gain": 15, "satiety_gain": 30 }
✓ { "pet_id": 1, "food": "fruit" }
```

### S-A03：随机数服务端生成

所有涉及游戏逻辑的随机数（品质随机、掉落、暴击判定）必须使用 `server/utils/random.js` 中的安全随机函数，禁止使用 `Math.random()`。

```javascript
// server/utils/random.js
const crypto = require('crypto');

function secureRandom(min, max) {
    const range = max - min + 1;
    const bytes = crypto.randomBytes(4);
    const value = bytes.readUInt32BE(0);
    return min + (value % range);
}
```

### S-A04：服务端状态校验

每个业务接口在执行操作前，必须从数据库读取最新状态进行校验，不得依赖前端传入的状态值或内存缓存。

---

## 2. 身份与鉴权（S-B系列）

### S-B01：Token鉴权

除 `/api/user/register` 和 `/api/user/login` 外，所有接口必须通过 `middleware/auth.js` 校验 JWT Token。

### S-B02：资源归属校验

所有涉及资源操作的接口，必须校验目标资源（蛋、宠物）的 `user_id` 等于当前 Token 中的 `uid`。

```javascript
// 每个路由必须包含
if (pet.user_id !== req.uid) {
    return res.json({ code: 1003, data: null, msg: '权限不足' });
}
```

### S-B03：密码安全

- 密码使用 bcrypt 哈希，cost factor ≥ 10
- 禁止明文存储、日志输出、接口返回密码
- 密码长度限制：6~32字符

### S-B04：Token安全

- JWT密钥从环境变量读取，禁止硬编码
- Token有效期24小时，不支持续期（过期需重新登录）
- Token Payload仅包含 `uid`、`iat`、`exp`，不包含敏感信息

---

## 3. 输入校验（S-C系列）

### S-C01：参数类型校验

所有接口参数必须经过 `server/utils/validator.js` 的类型和范围校验。

```javascript
// validator.js 示例
function validateFeed(body) {
    const errors = [];
    if (!Number.isInteger(body.pet_id) || body.pet_id <= 0) {
        errors.push('pet_id必须为正整数');
    }
    const validFoods = ['insect', 'fruit', 'meat', 'live_prey', 'spirit_bug'];
    if (!validFoods.includes(body.food)) {
        errors.push('无效的食物类型');
    }
    return errors;
}
```

### S-C02：字符串过滤

所有用户输入的字符串（用户名、昵称、宠物名）必须：
- 去除首尾空白
- 过滤HTML标签（防XSS）
- 限制长度（见各接口定义）
- 禁止纯空白字符串

```javascript
function sanitize(str, maxLen) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/<[^>]*>/g, '').slice(0, maxLen);
}
```

### S-C03：数值范围校验

所有数值参数必须校验合理范围，拒绝负数、超大数、NaN、Infinity。

```javascript
function isValidInt(val, min, max) {
    return Number.isInteger(val) && val >= min && val <= max;
}
```

### S-C04：JSON解析安全

请求体 JSON 解析失败时，返回 `{ code: 1001, msg: '请求格式错误' }`，不得暴露解析错误详情。

---

## 4. 频率限制（S-D系列）

### S-D01：全局限流

使用 `middleware/rate-limit.js` 对所有接口实施限流。

```javascript
// 限流配置
const RATE_LIMITS = {
    '/api/user/register': { window: 60, max: 5, key: 'ip' },
    '/api/user/login':    { window: 60, max: 10, key: 'ip' },
    '/api/nurture/feed':  { window: 60, max: 2, key: 'uid' },
    '/api/pet/sync':      { window: 60, max: 12, key: 'uid' },
    'default':            { window: 60, max: 30, key: 'uid' }
};
```

### S-D02：业务冷却

喂食、休息等操作有业务冷却时间，由服务端记录上次操作时间并校验。前端冷却倒计时仅为UI提示，不作为实际限制。

### S-D03：每日上限

金币获取有每日上限（500），服务端按自然日（UTC+8 00:00）重置计数。

### S-D04：限流响应

触发限流时返回 `{ code: 9001, msg: '请求过于频繁', data: { retry_after: 秒数 } }`。

---

## 5. 数据完整性（S-E系列）

### S-E01：事务保护

涉及多表操作的业务（孵化完成、蜕变）必须使用 SQLite 事务：

```javascript
db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    try {
        // 多个写操作
        db.run('INSERT INTO pet ...');
        db.run('INSERT INTO pet_attr ...');
        db.run('UPDATE pet_egg SET is_hatched = 1 ...');
        db.run('INSERT INTO log ...');
        db.run('COMMIT');
    } catch (err) {
        db.run('ROLLBACK');
        throw err;
    }
});
```

### S-E02：幂等性

同一操作重复提交不得产生重复效果：
- 领取蛋：检查 `egg_claimed` 标志
- 孵化完成：检查宠物是否已创建
- 蜕变：检查当前阶段是否已变更

### S-E03：余额非负

金币、体力、饱食度等资源扣减前必须检查余额充足，扣减后不得出现负数。

```javascript
if (user.gold < cost) {
    return { code: 5002, msg: '金币不足' };
}
// 使用 SQL 条件更新防并发
db.run('UPDATE user SET gold = gold - ? WHERE id = ? AND gold >= ?',
    [cost, userId, cost]);
```

### S-E04：操作日志

所有关键操作必须写入 `log` 表，包含：用户ID、操作类型、目标、详情JSON、IP地址、时间戳。

### S-E05：外键约束

虽然 SQLite 外键默认关闭，启动时必须执行：

```javascript
db.run('PRAGMA foreign_keys = ON');
```

---

## 6. 通信安全（S-F系列）

### S-F01：HTTPS（生产环境）

生产环境必须使用 HTTPS，开发环境允许 HTTP。

### S-F02：CORS限制

```javascript
const cors = require('cors');
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Seq']
}));
```

### S-F03：请求头校验

- 必须包含 `Content-Type: application/json`
- 鉴权接口必须包含 `Authorization` 头
- 拒绝超大请求体（限制 `express.json({ limit: '100kb' })`)

### S-F04：错误信息脱敏

生产环境下，`code: 9999` 的错误响应不得包含堆栈信息、SQL语句、文件路径等内部细节。

```javascript
app.use((err, req, res, next) => {
    console.error(err); // 仅服务端日志
    res.json({
        code: 9999,
        data: null,
        msg: process.env.NODE_ENV === 'production'
            ? '服务器内部错误'
            : err.message
    });
});
```

---

## 7. 防作弊（S-G系列）

### S-G01：前端代码不可信

前端代码视为完全可被篡改，所有校验逻辑必须在服务端重复执行。前端校验仅用于改善用户体验。

### S-G02：请求序列号

每个操作请求携带递增序列号 `X-Request-Seq`，服务端记录每用户最后处理的序列号，拒绝重复或倒退的请求。

### S-G03：操作频率异常检测

服务端记录每用户的操作频率，当短时间内操作次数异常时（如1分钟内50次喂食请求），记录告警日志并临时封禁。

```javascript
// 异常检测阈值
const ABUSE_THRESHOLDS = {
    feed: { window: 300, max: 10 },    // 5分钟内10次
    evolve: { window: 3600, max: 5 },  // 1小时内5次
    rename: { window: 3600, max: 10 }  // 1小时内10次
};
```

### S-G04：金币变动审计

所有金币变动必须记录到 log 表，包含变动原因和变动后余额。定期审计日志，检查余额一致性。

### S-G05：禁止客户端时间

游戏逻辑中的所有时间判断（冷却、孵化、每日重置）使用服务端时间 `Math.floor(Date.now() / 1000)`，不接受客户端传入的时间参数。

---

## 8. 代码质量约束（S-H系列）

### S-H01：禁止硬编码数值

所有游戏数值必须定义在 `server/models/game-rules.js` 中，业务代码通过引用常量使用。

### S-H02：错误处理

所有 async 函数必须有 try-catch，所有数据库操作必须处理错误回调。未捕获的异常通过全局错误中间件处理。

### S-H03：日志规范

- 使用 `console.log` / `console.error`（后续可替换为日志库）
- 日志中禁止输出密码、Token完整值、用户敏感信息
- 错误日志必须包含请求路径、用户ID、错误信息

### S-H04：环境变量

敏感配置通过环境变量注入：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 3000 |
| JWT_SECRET | JWT签名密钥 | （无默认，必须设置） |
| NODE_ENV | 运行环境 | development |
| ALLOWED_ORIGIN | CORS允许源 | http://localhost:3000 |
| DB_PATH | SQLite数据库路径 | ./data/game.db |

### S-H05：依赖安全

- 定期检查依赖漏洞（`npm audit`）
- 锁定依赖版本（使用 `package-lock.json`）
- 最小化依赖数量，核心依赖：express, better-sqlite3, bcryptjs, jsonwebtoken, cors

---

## 9. 规则索引

| 编号 | 简述 | 类别 |
|------|------|------|
| S-A01 | 服务端唯一计算源 | 服务端权威 |
| S-A02 | 前端仅发送操作意图 | 服务端权威 |
| S-A03 | 随机数服务端生成 | 服务端权威 |
| S-A04 | 服务端状态校验 | 服务端权威 |
| S-B01 | Token鉴权 | 身份鉴权 |
| S-B02 | 资源归属校验 | 身份鉴权 |
| S-B03 | 密码安全 | 身份鉴权 |
| S-B04 | Token安全 | 身份鉴权 |
| S-C01 | 参数类型校验 | 输入校验 |
| S-C02 | 字符串过滤 | 输入校验 |
| S-C03 | 数值范围校验 | 输入校验 |
| S-C04 | JSON解析安全 | 输入校验 |
| S-D01 | 全局限流 | 频率限制 |
| S-D02 | 业务冷却 | 频率限制 |
| S-D03 | 每日上限 | 频率限制 |
| S-D04 | 限流响应 | 频率限制 |
| S-E01 | 事务保护 | 数据完整性 |
| S-E02 | 幂等性 | 数据完整性 |
| S-E03 | 余额非负 | 数据完整性 |
| S-E04 | 操作日志 | 数据完整性 |
| S-E05 | 外键约束 | 数据完整性 |
| S-F01 | HTTPS | 通信安全 |
| S-F02 | CORS限制 | 通信安全 |
| S-F03 | 请求头校验 | 通信安全 |
| S-F04 | 错误信息脱敏 | 通信安全 |
| S-G01 | 前端代码不可信 | 防作弊 |
| S-G02 | 请求序列号 | 防作弊 |
| S-G03 | 操作频率异常检测 | 防作弊 |
| S-G04 | 金币变动审计 | 防作弊 |
| S-G05 | 禁止客户端时间 | 防作弊 |
| S-H01 | 禁止硬编码数值 | 代码质量 |
| S-H02 | 错误处理 | 代码质量 |
| S-H03 | 日志规范 | 代码质量 |
| S-H04 | 环境变量 | 代码质量 |
| S-H05 | 依赖安全 | 代码质量 |
