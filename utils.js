const fs = require('fs')
const path = require('path')
const { LOG_PATH } = require('./config')

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

function sendResponse(res, statusCode, content) {
	try {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(content))
	} catch (error) {
		logger.error('发送响应时发生错误:', error)
	}
}

function generateLogFileName() {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}.log`
}

function writeLog(logData) {
	const logFileName = generateLogFileName()
	if (!fs.existsSync(LOG_PATH)) {
		fs.mkdirSync(LOG_PATH, { recursive: true })
	}
	const logFilePath = path.join(LOG_PATH, logFileName)
	const logEntry = JSON.stringify(logData) + '\n'

	try {
		fs.appendFile(logFilePath, logEntry, err => {
			if (err) {
				logger.error('写入日志文件时发生错误:', err)
			}
		})
	} catch (error) {
		logger.error('写入日志文件时发生错误:', error)
	}
}

function getRequestIp(req) {
	let ip =
		req.headers['x-forwarded-for'] ||
		req.headers['cf-connecting-ip'] ||
		req.headers['fastly-client-ip'] ||
		req.headers['x-real-ip'] ||
		req.connection.remoteAddress ||
		req.socket.remoteAddress ||
		req.connection.socket.remoteAddress
	if (ip) {
		if (ip.startsWith('::ffff:')) {
			ip = ip.substring(7)
		}
		return ip.split(',')[0].trim()
	}
	return 'unknown'
}

module.exports = {
	logger,
	sendResponse,
	writeLog,
	generateLogFileName,
	getRequestIp
}
