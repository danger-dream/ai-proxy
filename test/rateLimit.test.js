const assert = require('assert')
const RateLimiter = require('../rateLimit')

describe('RateLimiter', () => {
    it('should limit requests correctly', () => {
        const limiter = new RateLimiter(2, 1000) // 2 requests per second
        const clientId = 'testClient'

        assert.strictEqual(limiter.isRateLimited(clientId), false)
        assert.strictEqual(limiter.isRateLimited(clientId), false)
        assert.strictEqual(limiter.isRateLimited(clientId), true)

        // Wait for the limit to reset
        setTimeout(() => {
            assert.strictEqual(limiter.isRateLimited(clientId), false)
        }, 1000)
    })
})
