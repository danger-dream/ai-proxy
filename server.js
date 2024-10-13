const config = require('./config')
const RateLimiter = require('./rateLimit')

const rateLimiter = new RateLimiter(config.RATE_LIMIT.REQUESTS, config.RATE_LIMIT.INTERVAL)
app.use((req, res, next) => {
    const clientId = req.ip // or any other unique identifier for the client
    if (rateLimiter.isRateLimited(clientId)) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' })
    }
    next()
})
