/**
 * 全局配置中心
 * 所有敏感配置从环境变量读取，禁止硬编码 (S-H04)
 * JWT密钥必须通过环境变量设置 (S-B04)
 */

'use strict';

module.exports = {
    /** 服务端口 */
    PORT: parseInt(process.env.PORT, 10) || 3000,

    /** JWT 签名密钥 — 生产环境必须通过 JWT_SECRET 环境变量设置 */
    JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PROD',

    /** JWT 有效期（秒）— 24小时 */
    JWT_EXPIRES_IN: 86400,

    /** SQLite 数据库文件路径 */
    DB_PATH: process.env.DB_PATH || './data/game.db',

    /** 运行环境 */
    NODE_ENV: process.env.NODE_ENV || 'development',

    /** CORS 允许的前端源 — 生产环境必须通过 ALLOWED_ORIGIN 环境变量指定域名 */
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || (process.env.NODE_ENV === 'production' ? undefined : '*'),

    /** bcrypt 哈希轮数 (S-B03: cost factor ≥ 10) */
    BCRYPT_ROUNDS: 10,

    /** 请求体大小限制 (S-F03) */
    BODY_LIMIT: '100kb'
};
