const http = require('http')
const openaiProxy = require('./openai-proxy')
const claudeProxy = require('./claude-proxy')
const url = require('url')
const config = require('./config')
const RateLimiter = require('./rateLimit')
const ipManager = require('./ipManager')
const { sendResponse, logger } = require('./utils')

const PROXY_PORT = config.PROXY_PORT

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Anthropic-Version, Anthropic-Beta, Authorization, OpenAI-Beta',
	'Access-Control-Max-Age': '86400'
}

// 创建速率限制器
const rateLimiter = new RateLimiter(config.RATE_LIMIT_REQUESTS, config.RATE_LIMIT_INTERVAL)

// 每小时清理一次 IP 错误计数器
setInterval(() => ipManager.cleanupIPErrorCounter(), 60 * 60 * 1000)

const server = http.createServer((req, res) => {
	const sourceIP = req.socket.remoteAddress

	// 处理CORS预检请求
	if (req.method === 'OPTIONS') {
		res.writeHead(204, CORS_HEADERS)
		res.end()
		return
	}
	const parsedUrl = url.parse(req.url || '')
	if (parsedUrl.path === '/ping') {
		sendResponse(res, 200, { pong: Date.now() })
		return 
	}

	// 为所有响应添加CORS头
	Object.keys(CORS_HEADERS).forEach(header => {
		res.setHeader(header, CORS_HEADERS[header])
	})

	// 检查 IP 是否在黑名单中
	if (ipManager.isBlacklisted(sourceIP)) {
		sendResponse(res, 403, { error: 'IP 已被禁止访问' })
		return
	}

	// 检查速率限制
	if (rateLimiter.isRateLimited(sourceIP)) {
		sendResponse(res, 429, { error: '请求过于频繁，请稍后再试' })
		return
	}
	// 根据 host 选择适当的代理
	const hostname = req.headers.host
	if (hostname) {
		if (hostname.startsWith('claude.api.')) {
			claudeProxy.handleRequest(req, res, ipManager.recordIPError.bind(ipManager))
		} else if (hostname.startsWith('openai.api.')) {
			openaiProxy.handleRequest(req, res, ipManager.recordIPError.bind(ipManager))
		} else {
			sendResponse(res, 404, { error: '不支持的API' })
		}
	} else {
		sendResponse(res, 400, { error: '未识别的 hostname' })
	}
})

server.listen(PROXY_PORT, () => {
	logger.log(`API代理正在监听端口 ${PROXY_PORT}`)
	logger.log(`当前配置: ${JSON.stringify(config, undefined, '\t')}`)
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
