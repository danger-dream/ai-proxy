const https = require('https')
const url = require('url')

const config = require('./config');
const { logger, sendResponse, writeLog } = require('./utils');

const CLAUDE_API_HOST = config.CLAUDE_API_HOST;
const ALLOWED_HEADERS = ['x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type'];
const SUPPORTED_PATH = '/v1/messages';
const PATH_REQUIRING_BETA = '/v1/messages/batches';

function parseEventStream(chunk) {
	try {
		const events = chunk.toString().split('\n\n')
		return events
			.map(event => {
				const [eventType, eventData] = event.split('\n')
				if (eventType && eventData) {
					try {
						return {
							type: eventType.replace('event: ', ''),
							data: JSON.parse(eventData.replace('data: ', ''))
						}
					} catch (e) {
						console.error('解析事件数据时发生错误:', e)
						return null
					}
					claudeReq.destroy()
				}
				if (claudeReq.destroyed) {
					logger.error('请求已销毁，无法写入响应')
					return
				return null
			})
			.filter(Boolean)
	} catch (error) {
		console.error('解析事件流时发生错误:', error)
		return []
	}
}

function safelyGetNestedValue(obj, path) {
	return path.split('.').reduce((acc, part) => acc && acc[part], obj)
}

function handleRequest(req, res, recordIPError) {
	const startTime = Date.now();
	const parsedUrl = url.parse(req.url || '');
	const sourceIP = req.socket.remoteAddress;

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
				if (requestBody) {
					const jsonBody = JSON.parse(requestBody)
					logData.params = jsonBody
				} else {
					sendResponse(res, 400, { error: '请求体为空' })
					return
				}
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

				logger.log(JSON.stringify(logData))
			})
		})

		claudeReq.on('error', error => {
			logger.error('请求Claude API时发生错误:', error)
			sendResponse(res, 500, { error: '内部服务器错误' })

			// 在错误情况下也记录日志
			logData.totalTime = Date.now() - startTime
			logData.error = error.message
			writeLog(JSON.stringify(logData))
		})

		if (req.method !== 'GET' && req.method !== 'HEAD') {
			claudeReq.write(requestBody)
		}
		claudeReq.end()
	})
}

module.exports = {
	handleRequest
}
