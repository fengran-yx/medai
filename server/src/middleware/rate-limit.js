/**
 * 极简内存限流：按 IP + 路径计数，窗口过期自动重置。
 * 不引外部依赖，单机足够；多实例部署时应换成 Redis。
 */
const buckets = new Map();

/**
 * @param {{windowMs?: number, max?: number, message?: string}} opts
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = '操作过于频繁，请稍后再试' } = {}) {
  return (req, res, next) => {
    const ip = (req.ip || req.socket?.remoteAddress || 'unknown').replace('::ffff:', '');
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();

    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }

    b.count += 1;
    const remain = Math.max(0, b.resetAt - now);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));

    if (b.count > max) {
      res.set('Retry-After', String(Math.ceil(remain / 1000)));
      return res.status(429).json({
        code: 429,
        message,
        retryAfterSeconds: Math.ceil(remain / 1000),
      });
    }
    next();
  };
}

/** 定期清理过期桶，避免内存无限增长 */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 5 * 60 * 1000).unref();

export default rateLimit;
