const http = require('http')
const https = require('https')
const url = require('url')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CLAUDE_API_HOST = 'api.anthropic.com'
const PROXY_PORT = 6543

const ALLOWED_HEADERS = ['x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type']
const SUPPORTED_PATH = '/v1/messages'
const PATH_REQUIRING_BETA = '/v1/messages/batches'

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Anthropic-Version, Anthropic-Beta',
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
const IP_ERROR_THRESHOLD = 10
const ERROR_WINDOW = 24 * 60 * 60 * 1000 // 1天

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

// 在启动时加载IP数据
loadIPData()

function generateLogFileName() {
	const now = new Date()
	const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] // YYYYMMDDTHHMMSS
	const randomString = crypto.randomBytes(4).toString('hex') // 8位随机字符串
	return `${timestamp}_${randomString}.json`
}

function parseEventStream(chunk) {
	try {
		const events = chunk.toString().split('\n\n')
		return events
			.map(event => {
				const [eventType, eventData] = event.split('\n')
				if (eventType && eventData) {
					return {
						type: eventType.replace('event: ', ''),
						data: JSON.parse(eventData.replace('data: ', ''))
					}
				}
				return null
			})
			.filter(Boolean)
	} catch (error) {
		logger.error('解析事件流时发生错误:', error)
		return []
	}
}

function safelyGetNestedValue(obj, path) {
	return path.split('.').reduce((acc, part) => acc && acc[part], obj)
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

	// 初始化日志对象
	const logData = {
		sourceIP,
		path: parsedUrl.path,
		apiKey: req.headers['x-api-key'],
		params: {},
		totalTime: 0,
		inputTokens: null,
		outputTokens: null
	}

	// 验证路径是否支持
	if (!parsedUrl.pathname?.startsWith(SUPPORTED_PATH)) {
		recordIPError(sourceIP, 'unsupported_path')
		sendResponse(res, 404, { error: '不支持的API路径' })
		return
	}

	// 验证x-api-key是否存在
	if (!req.headers['x-api-key']) {
		recordIPError(sourceIP, 'missing_api_key')
		sendResponse(res, 401, { error: '缺少x-api-key' })
		return
	}

	// 验证需要anthropic-beta的路径
	if (parsedUrl.pathname?.startsWith(PATH_REQUIRING_BETA) && !req.headers['anthropic-beta']) {
		recordIPError(sourceIP, 'missing_beta_header')
		sendResponse(res, 400, { error: '此路径需要anthropic-beta header' })
		return
	}

	// 构建发送到Claude API的请求选项
	const options = {
		hostname: CLAUDE_API_HOST,
		port: 443,
		path: parsedUrl.path,
		method: req.method,
		headers: {}
	}

	// 仅保留允许的header
	ALLOWED_HEADERS.forEach(header => {
		if (req.headers[header]) {
			options.headers[header] = req.headers[header]
		}
	})

	options.headers['host'] = CLAUDE_API_HOST

	let requestBody = ''
	req.on('data', chunk => {
		requestBody += chunk.toString()
	})

	req.on('end', () => {
		// 验证消息参数是否为JSON（仅对POST和PUT请求）
		if ((req.method === 'POST' || req.method === 'PUT') && req.headers['content-type'] === 'application/json') {
			try {
				const jsonBody = JSON.parse(requestBody)
				logData.params = jsonBody
			} catch (e) {
				sendResponse(res, 400, { error: '无效的JSON格式' })
				return
			}
		}

		const claudeReq = https.request(options, claudeRes => {
			res.writeHead(claudeRes.statusCode || 500, claudeRes.headers)

			let responseBody = ''
			const isEventStream = claudeRes.headers['content-type'] === 'text/event-stream'

			claudeRes.on('data', chunk => {
				responseBody += chunk

				try {
					res.write(chunk)
				} catch (error) {
					logger.error('写入响应时发生错误:', error)
					claudeReq.destroy()
				}

				if (isEventStream) {
					try {
						const events = parseEventStream(chunk)
						events.forEach(event => {
							const inputTokens = safelyGetNestedValue(event, 'data.message.usage.input_tokens')
							const outputTokens = safelyGetNestedValue(event, 'data.usage.output_tokens')

							if (inputTokens) logData.inputTokens = inputTokens
							if (outputTokens) logData.outputTokens = outputTokens
						})
					} catch {}
				}
			})

			claudeRes.on('end', () => {
				try {
					res.end()
				} catch (error) {
					logger.error('结束响应时发生错误:', error)
				}

				logData.totalTime = Date.now() - startTime

				if (!isEventStream) {
					try {
						const jsonResponse = JSON.parse(responseBody)
						if (jsonResponse.usage) {
							logData.inputTokens = jsonResponse.usage.input_tokens
							logData.outputTokens = jsonResponse.usage.output_tokens
						}
					} catch (e) {
						logger.error('解析非流式响应时发生错误:', e)
					}
				}

				// 请求成功，清除该 IP 的错误记录
				if (ipData.ip_error_counter[sourceIP]) {
					delete ipData.ip_error_counter[sourceIP]
					saveIPData() // 保存更新后的IP数据
				}

				writeLog(logData)
			})
		})

		claudeReq.on('error', error => {
			logger.error('请求Claude API时发生错误:', error)
			sendResponse(res, 500, { error: '内部服务器错误' })

			// 在错误情况下也记录日志
			logData.totalTime = Date.now() - startTime
			logData.error = error.message
			writeLog(logData)
		})

		if (req.method !== 'GET' && req.method !== 'HEAD') {
			claudeReq.write(requestBody)
		}
		claudeReq.end()
	})
})

server.listen(PROXY_PORT, () => {
	logger.log(`Claude API代理正在监听端口 ${PROXY_PORT}`)
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
