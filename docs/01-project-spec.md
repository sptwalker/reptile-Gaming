# Web爬虫宠物养成游戏 - 项目规范与目录架构

## 1. 目录结构

```
reptile-Gaming/
├── client/                     # 前端（纯原生JS，无框架）
│   ├── index.html              # 入口页
│   ├── css/
│   │   └── main.css            # 全局样式
│   ├── js/
│   │   ├── app.js              # 入口：初始化、路由、全局状态
│   │   ├── api.js              # 统一HTTP请求封装（fetch + token）
│   │   ├── auth.js             # 登录/注册/token管理
│   │   ├── pet-manager.js      # 宠物数据管理（接收服务端JSON）
│   │   ├── hatch.js            # 孵化流程UI
│   │   ├── nurture.js          # 养成操作UI（喂食/蜕变）
│   │   ├── renderer/
│   │   │   ├── canvas-core.js  # Canvas初始化、帧循环、resize
│   │   │   ├── spine.js        # 脊椎链物理渲染
│   │   │   ├── ik-legs.js      # IK腿部渲染
│   │   │   ├── body.js         # 身体轮廓/头部/纹理渲染
│   │   │   ├── vision.js       # 视野锥渲染
│   │   │   └── effects.js      # 粒子/光效/UI动画
│   │   └── ui/
│   │       ├── panel.js        # 信息面板/属性展示
│   │       ├── inventory.js    # 背包/物品UI
│   │       └── dialog.js       # 弹窗/确认框
│   └── assets/
│       └── (预留图片/音效资源)
├── server/
│   ├── index.js                # 入口：Express启动、中间件挂载
│   ├── config.js               # 全局配置（端口、密钥、限流参数）
│   ├── db.js                   # SQLite连接、初始化建表
│   ├── middleware/
│   │   ├── auth.js             # Token鉴权中间件
│   │   └── rate-limit.js       # 接口限流中间件
│   ├── routes/
│   │   ├── user.js             # 用户注册/登录/信息
│   │   ├── egg.js              # 宠物蛋领取/查询
│   │   ├── hatch.js            # 孵化流程
│   │   ├── pet.js              # 宠物数据同步/查询
│   │   ├── nurture.js          # 喂食/蜕变/体力
│   │   └── log.js              # 操作日志查询
│   ├── services/
│   │   ├── user-service.js     # 用户业务逻辑
│   │   ├── egg-service.js      # 蛋生成/品质随机
│   │   ├── hatch-service.js    # 孵化计算/天赋分配
│   │   ├── pet-service.js      # 宠物数据组装/同步
│   │   ├── nurture-service.js  # 养成/蜕变/饱食计算
│   │   └── economy-service.js  # 金币产出/消耗/防刷
│   ├── models/
│   │   └── game-rules.js       # 全局数值规则（品质/天赋/成长公式）
│   └── utils/
│       ├── crypto.js           # 密码哈希/token生成
│       ├── random.js           # 服务端安全随机数
│       └── validator.js        # 请求参数校验
├── docs/
│   ├── 01-project-spec.md      # 本文件
│   ├── 02-database.md          # 数据库表结构
│   ├── 03-game-rules.md        # 全局数值规则字典
│   ├── 04-api.md               # RESTful API接口文档
│   ├── 05-sync-rules.md        # 前端Canvas与服务端同步规则
│   └── 06-security.md          # 全局强制约束规则
├── game.html                   # 原型演示（单机版蜥蜴模拟器）
├── lizard_params001.json       # 原型参数导出
├── DEVLOG.md                   # 开发日志
├── package.json                # Node.js依赖
└── .gitignore
```

## 2. 编码规范

### 2.1 变量命名

| 场景 | 规则 | 示例 |
|------|------|------|
| JS变量/函数 | camelCase | `petLevel`, `getUserInfo()` |
| JS常量 | UPPER_SNAKE | `MAX_TALENT_POINTS`, `QUALITY_RARE` |
| JS类/构造函数 | PascalCase | `PetRenderer`, `SpineChain` |
| 数据库字段 | lower_snake | `user_id`, `talent_total`, `created_at` |
| API路径 | lower-kebab | `/api/pet-egg/claim` |
| CSS类名 | lower-kebab | `.pet-card`, `.stat-bar` |
| 文件名 | lower-kebab | `pet-manager.js`, `game-rules.js` |

### 2.2 接口命名

```
POST /api/{模块}/{动作}
```

- 模块：`user`, `egg`, `hatch`, `pet`, `nurture`, `log`
- 动作：`register`, `login`, `claim`, `start`, `sync`, `feed`, `evolve`

### 2.3 数据库字段命名

- 全小写 + 下划线分隔
- 主键：`id`（INTEGER AUTO INCREMENT）
- 外键：`{关联表}_id`（如 `user_id`, `pet_id`）
- 时间戳：`created_at`, `updated_at`（INTEGER，Unix秒级时间戳）
- 布尔值：`is_` 前缀（如 `is_claimed`, `is_active`）
- 枚举值：INTEGER 存储，代码中定义常量映射

## 3. 版本管理规则

### 3.1 分支策略

| 分支 | 用途 |
|------|------|
| `master` | 稳定发布版本 |
| `dev` | 开发主线 |
| `feat/{功能名}` | 功能开发分支 |
| `fix/{问题描述}` | 修复分支 |

### 3.2 提交格式

```
{type}: {简述}

type: feat / fix / docs / refactor / chore
```

### 3.3 开发阶段划分

| 阶段 | 内容 | 产出 |
|------|------|------|
| P0-文档 | 规范文档、表结构、API设计 | docs/ 全部文档 |
| P1-基座 | 服务端框架、数据库、用户系统 | 可注册登录 |
| P2-核心 | 蛋系统、孵化、宠物生成 | 可孵化宠物 |
| P3-养成 | 喂食、成长、蜕变、体力 | 完整养成循环 |
| P4-渲染 | Canvas宠物渲染、属性映射 | 可视化宠物 |
| P5-联网 | 多人同屏、社交、对战框架 | 网络游戏雏形 |

### 3.4 禁止硬编码

所有游戏数值必须定义在 `server/models/game-rules.js` 中，禁止在业务代码中出现魔法数字。

```javascript
// ✗ 禁止
if (pet.level >= 10) { ... }

// ✓ 正确
const { EVOLVE_LEVEL } = require('./models/game-rules');
if (pet.level >= EVOLVE_LEVEL) { ... }
```

## 4. 前后端数据交互格式

### 4.1 统一响应结构

```json
{
    "code": 0,
    "data": {},
    "msg": "success"
}
```

### 4.2 状态码定义

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 未登录/Token过期 |
| 1003 | 权限不足 |
| 2001 | 用户已存在 |
| 2002 | 密码错误 |
| 3001 | 宠物蛋不存在 |
| 3002 | 已领取过蛋 |
| 4001 | 孵化未完成 |
| 4002 | 天赋分配错误 |
| 5001 | 体力不足 |
| 5002 | 金币不足 |
| 5003 | 蜕变条件不满足 |
| 9001 | 请求过于频繁 |
| 9999 | 服务器内部错误 |

### 4.3 请求规范

- 全部使用 `POST` 方法
- Content-Type: `application/json`
- 鉴权：Header `Authorization: Bearer {token}`
- 无敏感数据明文传输

## 5. 前端Canvas渲染与业务逻辑分离

### 5.1 分层原则

```
┌─────────────────────────────────────────┐
│  UI层 (ui/*.js)                         │  用户交互、面板、按钮
├─────────────────────────────────────────┤
│  数据层 (pet-manager.js, api.js)        │  服务端数据接收/缓存
├─────────────────────────────────────────┤
│  渲染层 (renderer/*.js)                 │  Canvas绘制，纯视觉
└─────────────────────────────────────────┘
```

### 5.2 规则

- **渲染层**只接收数据对象，不发起任何HTTP请求
- **渲染层**不修改任何宠物属性值
- **数据层**从服务端获取JSON后，构造渲染参数对象传给渲染层
- **UI层**捕获用户操作，调用数据层API，数据层返回后通知渲染层刷新
