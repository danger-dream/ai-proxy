const fs = require('fs')
const config = require('./config')
const { logger } = require('./utils')

class IPManager {
	constructor() {
		this.BLACK_LIST_FILE = config.BLACK_LIST_PATH
		this.ipData = { blacks: new Set(), ip_error_counter: {} }
		this.IP_ERROR_THRESHOLD = config.IP_ERROR_THRESHOLD
		this.ERROR_WINDOW = config.ERROR_WINDOW
		this.loadIPData()
	}

	loadIPData() {
		try {
			const data = fs.readFileSync(this.BLACK_LIST_FILE, 'utf8')
			const parsedData = JSON.parse(data)
			this.ipData.blacks = new Set(parsedData.blacks)
			this.ipData.ip_error_counter = parsedData.ip_error_counter
			logger.log('IP数据已加载')
		} catch (error) {
			if (error.code !== 'ENOENT') {
				logger.error('读取IP数据文件时发生错误:', error)
			} else {
				logger.log('IP数据文件不存在，将创建新文件')
			}
			this.ipData = { blacks: new Set(), ip_error_counter: {} }
		}
	}

	saveIPData() {
		const dataToSave = {
			blacks: Array.from(this.ipData.blacks),
			ip_error_counter: this.ipData.ip_error_counter
		}
		fs.writeFile(this.BLACK_LIST_FILE, JSON.stringify(dataToSave, null, 2), err => {
			if (err) {
				logger.error('保存IP数据文件时发生错误:', err)
			} else {
				logger.log('IP数据已保存')
			}
		})
	}

	recordIPError(ip, errorType) {
		const now = Date.now()
		if (!this.ipData.ip_error_counter[ip]) {
			this.ipData.ip_error_counter[ip] = { count: 0, firstError: now, lastError: now, errorType }
		}
		this.ipData.ip_error_counter[ip].count++
		this.ipData.ip_error_counter[ip].lastError = now
		this.ipData.ip_error_counter[ip].errorType = errorType

		if (this.ipData.ip_error_counter[ip].count >= this.IP_ERROR_THRESHOLD && now - this.ipData.ip_error_counter[ip].firstError <= this.ERROR_WINDOW) {
			this.ipData.blacks.add(ip)
			logger.log(`IP ${ip} 已被加入黑名单`)
			this.saveIPData()
		}
	}

	isBlacklisted(ip) {
		return this.ipData.blacks.has(ip)
	}

	cleanupIPErrorCounter() {
		const now = Date.now()
		let hasChanges = false
		for (const ip in this.ipData.ip_error_counter) {
			if (now - this.ipData.ip_error_counter[ip].lastError > this.ERROR_WINDOW) {
				delete this.ipData.ip_error_counter[ip]
				hasChanges = true
			}
		}
		if (hasChanges) {
			this.saveIPData()
		}
	}
}

module.exports = new IPManager()
