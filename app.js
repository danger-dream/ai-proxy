const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const claudeProxy = require('./claude-proxy');
const openaiProxy = require('./openai-proxy');

const config = require('./config');
const RateLimiter = require('./rateLimit');
const ipManager = require('./ipManager');
const { writeLog, sendResponse, logger } = require('./utils');

const PROXY_PORT = config.PROXY_PORT;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Anthropic-Version, Anthropic-Beta, Authorization, OpenAI-Beta',
    'Access-Control-Max-Age': '86400' // 24小时
};

// 创建速率限制器
const rateLimiter = new RateLimiter(config.RATE_LIMIT.REQUESTS, config.RATE_LIMIT.INTERVAL);

// 确保message目录存在
const MESSAGE_DIR = path.join(__dirname, 'message');
if (!fs.existsSync(MESSAGE_DIR)) {
    fs.mkdirSync(MESSAGE_DIR);
}

// 每小时清理一次 IP 错误计数器
setInterval(() => ipManager.cleanupIPErrorCounter(), 60 * 60 * 1000);

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || '');
    const sourceIP = req.socket.remoteAddress;

    // 处理CORS预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    // 为所有响应添加CORS头
    Object.keys(CORS_HEADERS).forEach(header => {
        res.setHeader(header, CORS_HEADERS[header]);
    });

    // 检查 IP 是否在黑名单中
    if (ipManager.isBlacklisted(sourceIP)) {
        sendResponse(res, 403, { error: 'IP 已被禁止访问' });
        return;
    }

    // 检查速率限制
    if (rateLimiter.isRateLimited(sourceIP)) {
        sendResponse(res, 429, { error: '请求过于频繁，请稍后再试' });
        return;
    }

    // 根据 host 选择适当的代理
    const hostname = parsedUrl.hostname;
    if (hostname) {
        const proxyContext = { 
            logger, 
            recordIPError: ipManager.recordIPError.bind(ipManager), 
            writeLog, 
            sendResponse,
            MESSAGE_DIR
        };

        if (hostname.startsWith('claude.api.')) {
            claudeProxy.handleRequest(req, res, proxyContext);
        } else if (hostname.startsWith('openai.api.')) {
            openaiProxy.handleRequest(req, res, proxyContext);
        } else {
            sendResponse(res, 404, { error: '不支持的API' });
        }
    } else {
        sendResponse(res, 400, { error: '缺少host头' });
    }
});

server.listen(PROXY_PORT, () => {
	logger.log(`API代理正在监听端口 ${PROXY_PORT}`)
})

// 错误处理
server.on('error', error => {
	logger.error('服务器错误:', error)
})

process.on('uncaughtException', error => {
	logger.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason, promise) => {
	logger.error('未处理的拒绝:', reason)
})
