# Web爬虫宠物养成游戏 - 前端Canvas与服务端数据同步规则

> 核心原则：**服务端权威**  
> 前端仅负责渲染和交互，所有数值计算、随机逻辑、状态变更均在服务端完成  
> 前端不存储任何可信数据，所有展示数据来自服务端响应

---

## 1. 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                      用户交互层                              │
│  鼠标/触摸事件 → UI按钮 → 面板交互                           │
├─────────────────────────────────────────────────────────────┤
│                      UI层 (ui/*.js)                         │
│  面板渲染、按钮状态、弹窗、提示信息                            │
│  ↕ 调用数据层API / 监听数据变更                               │
├─────────────────────────────────────────────────────────────┤
│                   数据层 (pet-manager.js + api.js)           │
│  HTTP请求封装、本地数据缓存、状态同步调度                      │
│  ↕ 推送渲染参数 / 接收服务端JSON                              │
├─────────────────────────────────────────────────────────────┤
│                   渲染层 (renderer/*.js)                     │
│  Canvas绘制、脊椎物理、IK腿部、视野锥、粒子效果               │
│  ← 只接收渲染参数对象，不发起任何网络请求                      │
├─────────────────────────────────────────────────────────────┤
│                      Canvas画布                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 数据流向

### 2.1 单向数据流

```
服务端响应 → api.js解析 → pet-manager.js缓存 → 渲染参数转换 → renderer绘制
                                                      ↑
                                              game-rules映射公式
                                             （仅用于渲染参数转换，
                                               不用于数值计算）
```

### 2.2 用户操作流

```
用户点击"喂食" → ui/panel.js捕获事件
              → pet-manager.js调用api.js发请求
              → 等待服务端响应
              → 成功：更新本地缓存 → 通知UI刷新 → 通知渲染层更新
              → 失败：显示错误提示，不修改任何本地数据
```

### 2.3 禁止的数据流

- ❌ 渲染层直接调用 `api.js`
- ❌ UI层直接修改 `pet-manager.js` 缓存
- ❌ 前端自行计算经验值/等级/属性变更
- ❌ 前端生成随机数用于游戏逻辑
- ❌ 前端缓存数据作为"真实值"与服务端对比

---

## 3. 同步机制

### 3.1 同步时机

| 场景 | 触发方式 | 调用接口 | 频率 |
|------|---------|---------|------|
| 页面加载 | 自动 | `/api/pet/detail` | 1次 |
| 定时心跳 | 定时器 | `/api/pet/sync` | 每30秒 |
| 用户操作后 | 操作回调 | 对应业务接口 | 即时 |
| 页面重新可见 | visibilitychange | `/api/pet/sync` | 1次 |
| 网络恢复 | online事件 | `/api/pet/sync` | 1次 |

### 3.2 心跳同步

```javascript
// pet-manager.js
const SYNC_INTERVAL = 30000; // 30秒
let syncTimer = null;

function startSync(petId) {
    stopSync();
    syncTimer = setInterval(async () => {
        const res = await api.post('/api/pet/sync', { pet_id: petId });
        if (res.code === 0) {
            updateLocalCache(res.data);
            notifyRendererUpdate();
        }
    }, SYNC_INTERVAL);
}

function stopSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
}
```

### 3.3 可见性同步

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // 页面重新可见时立即同步
        syncPetState();
    }
});

window.addEventListener('online', () => {
    // 网络恢复时立即同步
    syncPetState();
});
```

---

## 4. 渲染参数转换

### 4.1 服务端数据 → 渲染参数

服务端返回的是游戏逻辑数据（属性值、等级等），前端需要转换为渲染参数。

```javascript
// pet-manager.js
function buildRenderParams(petData) {
    const { attrs, pet, body_seed } = petData;
    
    return {
        // 脊椎链参数
        spineNodes: BASE_NODES + Math.floor(attrs.vit.total / 10),
        segLength: BASE_SEG_LEN,
        
        // 体型参数
        bodyWidth: BASE_WIDTH * (1 + attrs.str.total * 0.01),
        headScale: BASE_HEAD * (1 + attrs.str.total * 0.008),
        
        // 运动参数
        moveSpeed: BASE_SPEED * (1 + attrs.agi.total * 0.015),
        legFrequency: BASE_FREQ * (1 + attrs.agi.total * 0.02),
        serpentineAmp: BASE_AMP,
        serpentineFreq: BASE_SERP_FREQ,
        
        // 视野参数
        fovAngle: BASE_FOV * (1 + attrs.int.total * 0.01),
        fovClearDist: BASE_FOV_DIST * (1 + attrs.per.total * 0.015),
        fovMaxDist: BASE_FOV_MAX * (1 + attrs.per.total * 0.02),
        
        // 外观参数
        bodyHue: body_seed.bodyHue,
        bodyLightness: body_seed.bodyLightness,
        patternType: body_seed.patternType,
        patternHue: body_seed.patternHue,
        colorSaturation: BASE_SAT * (1 + attrs.cha.total * 0.01),
        patternComplexity: BASE_PATTERN + Math.floor(attrs.cha.total / 8),
        
        // 阶段修饰
        stageScale: 1 + pet.stage * 0.15,
        
        // 状态指示
        stamina: pet.stamina,
        staminaMax: pet.stamina_max,
        satiety: pet.satiety,
        mood: pet.mood
    };
}
```

### 4.2 渲染参数基础值

```javascript
const BASE_NODES = 22;
const BASE_SEG_LEN = 16;
const BASE_WIDTH = 1.0;
const BASE_HEAD = 1.0;
const BASE_SPEED = 4.0;
const BASE_FREQ = 0.08;
const BASE_AMP = 0.6;
const BASE_SERP_FREQ = 0.15;
const BASE_FOV = 60;        // 度
const BASE_FOV_DIST = 300;  // px
const BASE_FOV_MAX = 500;   // px
const BASE_SAT = 1.0;
const BASE_PATTERN = 1;
```

### 4.3 渲染层接口

```javascript
// renderer/canvas-core.js
class PetRenderer {
    // 接收渲染参数，更新内部状态
    updateParams(renderParams) { ... }
    
    // 每帧调用，绘制当前状态
    draw(ctx, deltaTime) { ... }
    
    // 设置目标位置（鼠标/AI控制）
    setTarget(x, y) { ... }
    
    // 获取当前宠物位置（用于UI定位）
    getPosition() { return { x, y }; }
}
```

---

## 5. 状态衰减的处理

### 5.1 服务端计算

体力和饱食度的自然衰减由服务端在 `/api/pet/sync` 时计算：

```
实际体力 = 上次体力 + 自然恢复 - 时间消耗
实际饱食度 = 上次饱食度 - 时间衰减
```

前端不做任何衰减计算，仅展示服务端返回值。

### 5.2 前端平滑过渡

为避免同步时数值跳变，前端使用线性插值平滑过渡：

```javascript
// 收到新同步数据时
function onSyncUpdate(newData) {
    const oldStamina = localCache.stamina;
    const newStamina = newData.stamina;
    
    // 如果差值较小（正常衰减），使用动画过渡
    if (Math.abs(newStamina - oldStamina) <= 10) {
        animateValue('stamina', oldStamina, newStamina, 1000); // 1秒过渡
    } else {
        // 差值较大（长时间离线），直接更新
        localCache.stamina = newStamina;
    }
}
```

---

## 6. 离线处理

### 6.1 离线检测

```javascript
let isOffline = false;

window.addEventListener('offline', () => {
    isOffline = true;
    showOfflineIndicator();
    stopSync();
});

window.addEventListener('online', () => {
    isOffline = false;
    hideOfflineIndicator();
    syncPetState();
    startSync(currentPetId);
});
```

### 6.2 离线期间行为

- Canvas渲染继续运行（宠物动画不中断）
- 所有操作按钮禁用，显示"离线中"提示
- 不做任何本地数值模拟
- 网络恢复后立即同步，服务端返回离线期间的累积变化

### 6.3 请求重试

```javascript
// api.js
async function post(url, data, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, { ... });
            return await res.json();
        } catch (err) {
            if (i === retries) throw err;
            await sleep(1000 * (i + 1)); // 递增延迟
        }
    }
}
```

---

## 7. 帧循环与数据更新

### 7.1 帧循环独立

Canvas帧循环（requestAnimationFrame）与数据同步完全独立：

```
帧循环（60fps）：物理模拟 → 渲染绘制（使用缓存的渲染参数）
数据同步（30s）：HTTP请求 → 更新缓存 → 触发渲染参数重建
```

### 7.2 渲染参数更新时机

| 事件 | 更新内容 |
|------|---------|
| 页面加载 | 全量渲染参数 |
| 心跳同步 | 状态指示（体力/饱食/心情） |
| 喂食成功 | 饱食度、心情、可能的经验/等级 |
| 蜕变成功 | 全量渲染参数（体型变化） |
| 升级 | 属性相关渲染参数 |

### 7.3 渲染参数缓存

```javascript
// pet-manager.js
let cachedRenderParams = null;

function getRenderParams() {
    return cachedRenderParams;
}

function refreshRenderParams(petData) {
    cachedRenderParams = buildRenderParams(petData);
    // 通知渲染层
    if (renderer) renderer.updateParams(cachedRenderParams);
}
```

---

## 8. 多宠物切换

### 8.1 切换流程

```
1. 用户选择另一只宠物
2. 停止当前宠物的同步定时器
3. 请求 /api/pet/detail 获取新宠物完整数据
4. 重建渲染参数
5. 重置渲染层状态（位置、动画）
6. 启动新宠物的同步定时器
```

### 8.2 切换时的渲染过渡

- 旧宠物淡出（0.5秒 alpha过渡）
- 新宠物从画面中心淡入
- 过渡期间禁用用户操作

---

## 9. 安全同步规则

### 9.1 前端不可信原则

- 前端发送的请求中**不包含**任何数值结果（如"经验+50"）
- 前端只发送**操作意图**（如"喂食fruit"）
- 服务端独立计算所有结果并返回

### 9.2 时间戳校验

- 服务端在 sync 响应中返回 `server_time`
- 前端可用于显示"上次同步：X秒前"
- 前端不使用本地时间做任何游戏逻辑判断

### 9.3 序列号防重放

- 每次操作请求附带递增序列号 `seq`
- 服务端记录每用户最后处理的 `seq`
- 重复或过期的 `seq` 直接拒绝

```javascript
// api.js
let requestSeq = 0;

function getNextSeq() {
    return ++requestSeq;
}

// 每次请求自动附带
async function post(url, data) {
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            'X-Request-Seq': getNextSeq()
        },
        body: JSON.stringify(data)
    });
}
```
