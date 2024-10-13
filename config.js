module.exports = {
    PROXY_PORT: 6543,
    IP_ERROR_THRESHOLD: 10,
    ERROR_WINDOW: 24 * 60 * 60 * 1000, // 1天
    RATE_LIMIT: {
        REQUESTS: 100,
        INTERVAL: 60 * 1000 // 1分钟
    },
    CLAUDE_API_HOST: 'api.anthropic.com',
    OPENAI_API_HOST: 'api.openai.com',
    BLACK_API_HOST: 'api.example.com' // 请替换为实际的Black API主机
}
