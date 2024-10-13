class RateLimiter {
	constructor(limit, interval) {
		this.limit = limit
		this.interval = interval
		this.clients = new Map()
	}

	isRateLimited(clientId) {
		const now = Date.now()
		if (!this.clients.has(clientId)) {
			this.clients.set(clientId, { count: 1, resetTime: now + this.interval })
			return false
		}

		const client = this.clients.get(clientId)
		if (now > client.resetTime) {
			client.count = 1
			client.resetTime = now + this.interval
			return false
		}

		client.count++
		return client.count > this.limit
	}
}

module.exports = RateLimiter
