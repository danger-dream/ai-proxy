const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function generateLogFileName() {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] // YYYYMMDDTHHMMSS
    const randomString = crypto.randomBytes(4).toString('hex') // 8位随机字符串
    return `${timestamp}_${randomString}.json`
}

function writeLog(logData, MESSAGE_DIR) {
    const logFileName = generateLogFileName()
    fs.writeFile(path.join(MESSAGE_DIR, logFileName), JSON.stringify(logData, null, 2), err => {
        if (err) {
            console.error('写入日志文件时发生错误:', err)
        }
    })
}

function sendResponse(res, statusCode, content) {
    try {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(content))
    } catch (error) {
        console.error('发送响应时发生错误:', error)
    }
}

module.exports = {
    generateLogFileName,
    writeLog,
    sendResponse
}
