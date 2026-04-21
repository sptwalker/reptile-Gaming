/**
 * 本地开发调试工具
 * 用法: node server/dev.js [命令]
 *
 * 命令:
 *   (无参数)     启动开发服务器（带彩色请求日志）
 *   seed         生成测试数据（用户+宠物+Token）
 *   db           交互式数据库查询
 *   reset        重置数据库（删除 data/game.db 重建）
 *   routes       列出所有已注册路由
 *   test-api     自动化冒烟测试（注册→登录→领蛋→孵化→管理员）
 *   token <uid>  为指定用户签发调试Token
 */

'use strict';

const path = require('path');
const fs   = require('fs');

process.chdir(path.join(__dirname, '..'));

const cmd = process.argv[2] || 'serve';

/* ── 彩色输出 ── */
const C = {
    R: '\x1b[0m',  B: '\x1b[1m',
    red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m',
    blu: '\x1b[34m', cyn: '\x1b[36m', gry: '\x1b[90m',
};
const log = {
    info:  (...a) => console.log(C.cyn + '[DEV]' + C.R, ...a),
    ok:    (...a) => console.log(C.grn + '[OK]' + C.R, ...a),
    warn:  (...a) => console.log(C.yel + '[WARN]' + C.R, ...a),
    err:   (...a) => console.log(C.red + '[ERR]' + C.R, ...a),
    title: (t) => console.log('\n' + C.B + C.blu + '=== ' + t + ' ===' + C.R + '\n'),
};

/* ── 命令路由 ── */
const commands = { serve, seed, db: dbShell, reset, routes, 'test-api': testApi, token: genToken };
if (!commands[cmd]) {
    log.err('未知命令: ' + cmd);
    console.log('\n可用命令: ' + Object.keys(commands).join(', '));
    process.exit(1);
}
commands[cmd]();

/* ═══════════════════════════════════════════
 * 1. serve — 启动开发服务器 + 请求日志
 * ═══════════════════════════════════════════ */
function serve() {
    log.title('开发服务器启动');

    const origListen = require('express').application.listen;
    require('express').application.listen = function (...args) {
        this.use((req, _res, next) => {
            const start = Date.now();
            const origEnd = _res.end;
            _res.end = function (...a) {
                const ms = Date.now() - start;
                const sc = _res.statusCode;
                const cc = sc < 400 ? C.grn : C.red;
                const m = req.method.padEnd(4);
                const t = new Date().toLocaleTimeString('zh-CN');
                console.log(C.gry + t + C.R + ' ' + cc + m + C.R + ' ' + req.path + ' ' + C.gry + ms + 'ms' + C.R + ' ' + cc + sc + C.R);
                origEnd.apply(this, a);
            };
            next();
        });
        return origListen.apply(this, args);
    };

    require('./index');

    const config = require('./config');
    log.info('前端: ' + C.B + 'http://localhost:' + config.PORT + C.R);
    log.info('管理后台: ' + C.B + 'http://localhost:' + config.PORT + '/admin.html' + C.R);
    log.info('管理密钥: ' + C.yel + (process.env.ADMIN_KEY || 'reptile_admin_2026') + C.R);
    log.info('数据库: ' + C.gry + path.resolve(config.DB_PATH) + C.R);
    log.info('按 Ctrl+C 停止');
}

/* ═══════════════════════════════════════════
 * 2. seed — 生成测试数据
 * ═══════════════════════════════════════════ */
function seed() {
    log.title('生成测试数据');

    const { initDB, getDB, now } = require('./db');
    initDB();
    const db = getDB();
    const { hashPassword, signToken } = require('./utils/crypto');
    const rules = require('./models/game-rules');

    const ts = now();

    /* 测试用户 */
    const users = [
        { username: 'test1', password: '123456', nickname: '测试玩家1' },
        { username: 'test2', password: '123456', nickname: '测试玩家2' },
        { username: 'test3', password: '123456', nickname: '测试玩家3' },
    ];

    const created = [];
    for (const u of users) {
        const ex = db.prepare('SELECT id FROM user WHERE username = ?').get(u.username);
        if (ex) {
            log.warn('用户 ' + u.username + ' 已存在 (ID: ' + ex.id + ')，跳过');
            created.push({ ...u, id: ex.id });
            continue;
        }
        const hash = hashPassword(u.password);
        const r = db.prepare(
            'INSERT INTO user (username, password_hash, nickname, gold, diamond, egg_claimed, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)'
        ).run(u.username, hash, u.nickname, 5000, ts, ts, ts);
        const uid = Number(r.lastInsertRowid);
        created.push({ ...u, id: uid });
        log.ok('创建用户: ' + u.username + ' (ID: ' + uid + ', 金币: 5000)');
    }

    /* 为每个用户创建宠物 */
    const qn = { 1: '普通', 2: '优秀', 3: '稀有', 4: '史诗', 5: '传说' };
    for (const u of created) {
        const ep = db.prepare('SELECT id FROM pet WHERE user_id = ?').get(u.id);
        if (ep) { log.warn('用户 ' + u.username + ' 已有宠物，跳过'); continue; }

        const quality = Math.min(u.id, 5);
        const gender = u.id % 2 === 0 ? 2 : 1;

        const eggR = db.prepare(
            'INSERT INTO pet_egg (user_id, quality, pattern_seed, is_hatched, talent_points, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)'
        ).run(u.id, quality, 'seed_' + ts + '_' + u.id, ts, ts);
        const eggId = Number(eggR.lastInsertRowid);

        const level = 3 + u.id * 2;
        const stage = level >= 10 ? 2 : (level >= 5 ? 1 : 0);
        const petR = db.prepare(
            "INSERT INTO pet (user_id, egg_id, name, quality, gender, level, exp, stage, stamina, stamina_max, satiety, satiety_max, mood, is_active, body_seed, gene_set, appearance_gene, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 100, 100, 100, 100, 80, 1, ?, '', '', ?, ?)"
        ).run(u.id, eggId, u.nickname + '的蜥蜴', quality, gender, level, stage, 'seed_' + ts + '_' + u.id, ts, ts);
        const petId = Number(petR.lastInsertRowid);

        const tr = rules.TALENT_RANGE[quality] || { min: 6, max: 10 };
        const base = rules.INIT_ATTR_BASE + (level - 1) * rules.GROWTH_PER_LEVEL;
        const a = {};
        for (const key of rules.ATTR_KEYS) {
            a[key + '_base'] = base;
            a[key + '_talent'] = tr.min + Math.floor(Math.random() * (tr.max - tr.min + 1));
        }
        db.prepare(
            'INSERT INTO pet_attr (pet_id, str_base, str_talent, agi_base, agi_talent, vit_base, vit_talent, int_base, int_talent, per_base, per_talent, cha_base, cha_talent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(petId, a.str_base, a.str_talent, a.agi_base, a.agi_talent, a.vit_base, a.vit_talent, a.int_base, a.int_talent, a.per_base, a.per_talent, a.cha_base, a.cha_talent, ts, ts);

        for (const sk of rules.INITIAL_SKILLS) {
            db.prepare(
                'INSERT INTO pet_skill (pet_id, skill_code, skill_level, is_equipped, slot_index, unlocked_at, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)'
            ).run(petId, sk.skill_code, sk.skill_level, sk.slot_index, ts, ts, ts);
        }

        log.ok('创建宠物: Pet#' + petId + ' [' + qn[quality] + '] Lv.' + level + ' ' + (gender === 1 ? '♂' : '♀') + ' -> ' + u.username);
    }

    /* 签发调试Token */
    log.title('调试 Token (24h有效)');
    for (const u of created) {
        const user = db.prepare('SELECT token_version FROM user WHERE id = ?').get(u.id);
        const token = signToken(u.id, user.token_version || 1);
        console.log('  ' + C.cyn + u.username + C.R + ' (ID:' + u.id + '): ' + C.gry + token + C.R);
    }

    /* 数据统计 */
    log.title('数据库统计');
    const tables = ['user', 'pet_egg', 'pet', 'pet_attr', 'pet_skill', 'log', 'arena_pet', 'battle_challenge', 'breeding_record', 'treadmill'];
    for (const t of tables) {
        try {
            const count = db.prepare('SELECT COUNT(*) AS c FROM ' + t).get().c;
            console.log('  ' + t.padEnd(20) + ' ' + C.B + count + C.R + ' 条');
        } catch (_) {}
    }

    log.ok('测试数据生成完毕！');
    log.info('启动服务: npm run dev');
    log.info('登录账号: test1 / 123456');
}

/* ═══════════════════════════════════════════
 * 3. db — 交互式数据库查询
 * ═══════════════════════════════════════════ */
function dbShell() {
    log.title('数据库交互查询');

    const { initDB, getDB } = require('./db');
    initDB();
    const db = getDB();

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: C.cyn + 'sql> ' + C.R
    });

    console.log('输入 SQL 语句查询，特殊命令:');
    console.log('  ' + C.yel + '.tables' + C.R + '       列出所有表');
    console.log('  ' + C.yel + '.schema <表名>' + C.R + ' 查看表结构');
    console.log('  ' + C.yel + '.count' + C.R + '        所有表行数统计');
    console.log('  ' + C.yel + '.users' + C.R + '        列出所有用户');
    console.log('  ' + C.yel + '.pets' + C.R + '         列出所有宠物');
    console.log('  ' + C.yel + '.exit' + C.R + '         退出');
    console.log('');

    rl.prompt();
    rl.on('line', (line) => {
        const input = line.trim();
        if (!input) { rl.prompt(); return; }

        try {
            if (input === '.exit' || input === '.quit') {
                rl.close(); process.exit(0);
            }
            if (input === '.tables') {
                const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
                rows.forEach(r => console.log('  ' + r.name));
            } else if (input.startsWith('.schema')) {
                const table = input.split(/\s+/)[1];
                if (!table) { log.warn('用法: .schema <表名>'); }
                else {
                    const cols = db.pragma('table_info(' + table + ')');
                    console.log('\n  ' + C.B + table + C.R + ' (' + cols.length + ' 列):');
                    cols.forEach(c => {
                        const pk = c.pk ? ' ' + C.yel + 'PK' + C.R : '';
                        const nn = c.notnull ? ' ' + C.red + 'NOT NULL' + C.R : '';
                        const df = c.dflt_value !== null ? ' ' + C.gry + 'DEFAULT ' + c.dflt_value + C.R : '';
                        console.log('    ' + c.name.padEnd(20) + ' ' + C.cyn + c.type + C.R + pk + nn + df);
                    });
                }
            } else if (input === '.count') {
                const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
                for (const t of tables) {
                    const c = db.prepare('SELECT COUNT(*) AS c FROM ' + t.name).get().c;
                    console.log('  ' + t.name.padEnd(22) + ' ' + C.B + c + C.R);
                }
            } else if (input === '.users') {
                const rows = db.prepare('SELECT id, username, nickname, gold, diamond, last_login_at FROM user ORDER BY id').all();
                console.table(rows);
            } else if (input === '.pets') {
                const rows = db.prepare('SELECT p.id, p.user_id, p.name, p.quality, p.level, p.stage, p.gender, p.stamina, p.mood FROM pet p ORDER BY p.id').all();
                console.table(rows);
            } else {
                const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(input);
                if (isSelect) {
                    const rows = db.prepare(input).all();
                    if (rows.length === 0) {
                        log.info('(空结果)');
                    } else if (rows.length <= 50) {
                        console.table(rows);
                    } else {
                        console.table(rows.slice(0, 50));
                        log.warn('共 ' + rows.length + ' 行，仅显示前50行');
                    }
                } else {
                    const result = db.prepare(input).run();
                    log.ok('影响 ' + result.changes + ' 行');
                }
            }
        } catch (e) {
            log.err(e.message);
        }
        rl.prompt();
    });
}

/* ═══════════════════════════════════════════
 * 4. reset — 重置数据库
 * ═══════════════════════════════════════════ */
function reset() {
    const config = require('./config');
    const dbPath = path.resolve(config.DB_PATH);

    log.title('重置数据库');

    const files = [dbPath, dbPath + '-wal', dbPath + '-shm'];
    for (const f of files) {
        if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            log.ok('已删除: ' + f);
        }
    }

    const { initDB } = require('./db');
    initDB();
    log.ok('数据库已重建！');
    log.info('运行 npm run seed 生成测试数据');
}

/* ═══════════════════════════════════════════
 * 5. routes — 列出所有路由
 * ═══════════════════════════════════════════ */
function routes() {
    log.title('已注册 API 路由');

    const { initDB } = require('./db');
    initDB();

    const routeFiles = [
        { prefix: '/api/user',      file: './routes/user' },
        { prefix: '/api/egg',       file: './routes/egg' },
        { prefix: '/api/hatch',     file: './routes/hatch' },
        { prefix: '/api/pet',       file: './routes/pet' },
        { prefix: '/api/nurture',   file: './routes/nurture' },
        { prefix: '/api/log',       file: './routes/log' },
        { prefix: '/api/treadmill', file: './routes/treadmill' },
        { prefix: '/api/breeding',  file: './routes/breeding' },
        { prefix: '/api/arena',     file: './routes/arena' },
        { prefix: '/api/admin',     file: './routes/admin' },
    ];

    let total = 0;
    for (const rf of routeFiles) {
        try {
            const router = require(rf.file);
            const stack = router.stack || [];
            const authTag = rf.prefix === '/api/admin' ? C.yel + '[ADMIN]' + C.R :
                           (rf.prefix === '/api/user' ? C.gry + '[混合]' + C.R : C.grn + '[AUTH]' + C.R);

            for (const layer of stack) {
                if (layer.route) {
                    const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
                    const fullPath = rf.prefix + layer.route.path;
                    console.log('  ' + methods.padEnd(6) + ' ' + fullPath.padEnd(40) + ' ' + authTag);
                    total++;
                }
            }
        } catch (e) {
            log.warn('加载 ' + rf.file + ' 失败: ' + e.message);
        }
    }
    console.log('\n  ' + C.B + '共 ' + total + ' 个端点' + C.R);
}

/* ═══════════════════════════════════════════
 * 6. test-api — 自动化冒烟测试
 * ═══════════════════════════════════════════ */
async function testApi() {
    log.title('API 冒烟测试');

    const config = require('./config');
    const BASE = 'http://localhost:' + config.PORT;

    async function api(method, urlPath, body, headers) {
        const opts = {
            method,
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
        };
        if (body) opts.body = JSON.stringify(body);
        try {
            const r = await fetch(BASE + urlPath, opts);
            return await r.json();
        } catch (e) {
            return { code: 9999, msg: '连接失败: ' + e.message };
        }
    }

    const ts = Date.now();
    const testUser = 'smoke_' + ts;
    const testPass = 'test123456';
    let token = '';
    let passed = 0, failed = 0;

    function check(name, res, expectCode) {
        expectCode = expectCode || 0;
        if (res.code === expectCode) {
            log.ok(name + ' ' + C.gry + '(code: ' + res.code + ')' + C.R);
            passed++;
        } else {
            log.err(name + ' -- 期望 code=' + expectCode + ', 实际 code=' + res.code + ', msg=' + res.msg);
            failed++;
        }
        return res;
    }

    /* 注册 */
    check('注册', await api('POST', '/api/user/register', {
        username: testUser, password: testPass, nickname: '冒烟测试'
    }));

    /* 登录 */
    const loginRes = check('登录', await api('POST', '/api/user/login', {
        username: testUser, password: testPass
    }));
    token = (loginRes.data && loginRes.data.token) || '';

    const authH = { Authorization: 'Bearer ' + token };

    /* 用户信息 */
    check('用户信息', await api('POST', '/api/user/info', {}, authH));

    /* 领蛋 */
    check('领取宠物蛋', await api('POST', '/api/egg/claim', {}, authH));

    /* 蛋列表 */
    const eggsRes = check('蛋列表', await api('POST', '/api/egg/list', {}, authH));

    /* 开始孵化 */
    const eggId = eggsRes.data && eggsRes.data.eggs && eggsRes.data.eggs[0] && eggsRes.data.eggs[0].id;
    if (eggId) {
        check('开始孵化', await api('POST', '/api/hatch/start', { egg_id: eggId }, authH));
    }

    /* 管理员统计 */
    const adminH = { 'X-Admin-Key': process.env.ADMIN_KEY || 'reptile_admin_2026' };
    check('管理员-统计', await api('GET', '/api/admin/stats', null, adminH));
    check('管理员-数值', await api('GET', '/api/admin/rules', null, adminH));

    /* 404 */
    check('404接口', await api('POST', '/api/nonexistent'), 1001);

    /* 无Token */
    check('无Token拒绝', await api('POST', '/api/egg/list'), 1002);

    /* 结果 */
    log.title('测试结果');
    console.log('  ' + C.grn + '通过: ' + passed + C.R + '  ' + (failed > 0 ? C.red : C.gry) + '失败: ' + failed + C.R);
    if (failed > 0) process.exit(1);
}

/* ═══════════════════════════════════════════
 * 7. token — 为指定用户签发Token
 * ═══════════════════════════════════════════ */
function genToken() {
    const uid = parseInt(process.argv[3]);
    if (!uid) {
        log.err('用法: node server/dev.js token <uid>');
        process.exit(1);
    }

    const { initDB, getDB } = require('./db');
    initDB();
    const db = getDB();
    const { signToken } = require('./utils/crypto');

    const user = db.prepare('SELECT id, username, nickname, token_version FROM user WHERE id = ?').get(uid);
    if (!user) {
        log.err('用户 ID=' + uid + ' 不存在');
        process.exit(1);
    }

    const token = signToken(user.id, user.token_version || 1);
    log.ok('用户: ' + user.username + ' (' + user.nickname + ')');
    console.log('\nToken:\n' + token + '\n');
    console.log(C.gry + 'curl 用法:' + C.R);
    console.log('curl -X POST http://localhost:3000/api/user/info -H "Authorization: Bearer ' + token + '" -H "Content-Type: application/json"');
    console.log('');
}
