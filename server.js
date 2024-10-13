const http = require('http')
const url = require('url')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const claudeProxy = require('./claude-proxy')
const openaiProxy = require('./openai-proxy')

const config = require('./config')
const RateLimiter = require('./rateLimit')
const { writeLog, sendResponse } = require('./utils')

const PROXY_PORT = config.PROXY_PORT

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Anthropic-Version, Anthropic-Beta, Authorization, OpenAI-Beta',
	'Access-Control-Max-Age': '86400' // 24小时
}

// 自定义 logger
const logger = {
	formatDate: () => {
		const offset = 8 * 60 * 60 * 1000 // UTC+8 offset in milliseconds
		const utc8Date = new Date(new Date().getTime() + offset)
		return utc8Date.toISOString().replace('T', ' ').slice(0, 19)
	},
	log: (...args) => {
		console.log(`[${logger.formatDate()}] LOG:`, ...args)
	},
	error: (...args) => {
		console.error(`[${logger.formatDate()}] ERROR:`, ...args)
	}
}

// IP 黑名单和错误计数器
const BLACK_LIST_FILE = path.join(__dirname, 'black.json')
let ipData = { blacks: new Set(), ip_error_counter: {} }
const IP_ERROR_THRESHOLD = config.IP_ERROR_THRESHOLD
const ERROR_WINDOW = config.ERROR_WINDOW

// 创建速率限制器
const rateLimiter = new RateLimiter(config.RATE_LIMIT.REQUESTS, config.RATE_LIMIT.INTERVAL)

// 确保message目录存在
const MESSAGE_DIR = path.join(__dirname, 'message')
if (!fs.existsSync(MESSAGE_DIR)) {
	fs.mkdirSync(MESSAGE_DIR)
}

// 读取黑名单和错误计数器
function loadIPData() {
	try {
		const data = fs.readFileSync(BLACK_LIST_FILE, 'utf8')
		const parsedData = JSON.parse(data)
		ipData.blacks = new Set(parsedData.blacks)
		ipData.ip_error_counter = parsedData.ip_error_counter
		logger.log('IP数据已加载')
	} catch (error) {
		if (error.code !== 'ENOENT') {
			logger.error('读取IP数据文件时发生错误:', error)
		} else {
			logger.log('IP数据文件不存在，将创建新文件')
		}
		ipData = { blacks: new Set(), ip_error_counter: {} }
	}
}

// 保存黑名单和错误计数器
function saveIPData() {
	const dataToSave = {
		blacks: Array.from(ipData.blacks),
		ip_error_counter: ipData.ip_error_counter
	}
	fs.writeFile(BLACK_LIST_FILE, JSON.stringify(dataToSave, null, 2), err => {
		if (err) {
			logger.error('保存IP数据文件时发生错误:', err)
		} else {
			logger.log('IP数据已保存')
		}
	})
}

// 在启动时加载IP数
loadIPData()

function generateLogFileName() {
	const now = new Date()
	const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] // YYYYMMDDTHHMMSS
	const randomString = crypto.randomBytes(4).toString('hex') // 8位随机字符串
	return `${timestamp}_${randomString}.json`
}

function sendResponse(res, statusCode, content) {
	try {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(content))
	} catch (error) {
		logger.error('发送响应时发生错误:', error)
	}
}

function writeLog(logData) {
	const logFileName = generateLogFileName()
	fs.writeFile(path.join(MESSAGE_DIR, logFileName), JSON.stringify(logData, null, 2), err => {
		if (err) {
			logger.error('写入日志文件时发生错误:', err)
		}
	})
}

function recordIPError(ip, errorType) {
	const now = Date.now()
	if (!ipData.ip_error_counter[ip]) {
		ipData.ip_error_counter[ip] = { count: 0, firstError: now, lastError: now, errorType }
	}
	ipData.ip_error_counter[ip].count++
	ipData.ip_error_counter[ip].lastError = now
	ipData.ip_error_counter[ip].errorType = errorType

	if (ipData.ip_error_counter[ip].count >= IP_ERROR_THRESHOLD && now - ipData.ip_error_counter[ip].firstError <= ERROR_WINDOW) {
		ipData.blacks.add(ip)
		logger.log(`IP ${ip} 已被加入黑名单`)
		saveIPData() // 保存更新后的IP数据
	}
}

function cleanupIPErrorCounter() {
	const now = Date.now()
	let hasChanges = false
	for (const ip in ipData.ip_error_counter) {
		if (now - ipData.ip_error_counter[ip].lastError > ERROR_WINDOW) {
			delete ipData.ip_error_counter[ip]
			hasChanges = true
		}
	}
	if (hasChanges) {
		saveIPData() // 如果有变化，保存更新后的IP数据
	}
}

// 每小时清理一次 IP 错误计数器
setInterval(cleanupIPErrorCounter, 60 * 60 * 1000)

const server = http.createServer((req, res) => {
	const startTime = Date.now()
	const parsedUrl = url.parse(req.url || '')
	const sourceIP = req.socket.remoteAddress

	// 处理CORS预检请求
	if (req.method === 'OPTIONS') {
		res.writeHead(204, CORS_HEADERS)
		res.end()
		return
	}

	// 为所有响应添加CORS头
	Object.keys(CORS_HEADERS).forEach(header => {
		res.setHeader(header, CORS_HEADERS[header])
	})

	// 检查 IP 是否在黑名单中
	if (ipData.blacks.has(sourceIP)) {
		sendResponse(res, 403, { error: 'IP 已被禁止访问' })
		return
	}

	// 根据 host 选择适当的代理
	const host = req.headers.host
	if (host) {
		if (host.startsWith('claude.api.')) {
			claudeProxy.handleRequest(req, res, { logger, recordIPError, writeLog, sendResponse })
		} else if (host.startsWith('openai.api.')) {
			openaiProxy.handleRequest(req, res, { logger, recordIPError, writeLog, sendResponse })
		} else {
			sendResponse(res, 404, { error: '不支持的API' })
		}
	} else {
		sendResponse(res, 400, { error: '缺少host头' })
	}
})

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

module.exports = {
	logger,
	recordIPError,
	writeLog,
	sendResponse
}
