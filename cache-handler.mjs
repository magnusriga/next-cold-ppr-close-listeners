// Minimal in-memory cache handler implementing the documented `cacheHandler` interface:
// https://nextjs.org/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath
// The Map starts empty in every server process, so the first request is a cold cache miss.
const cache = new Map();

export default class CacheHandler {
  async get(key) {
    return cache.get(key) ?? null;
  }

  async set(key, data, ctx) {
    cache.set(key, { value: data, lastModified: Date.now(), tags: ctx.tags });
  }

  async revalidateTag(tags) {
    const targets = Array.isArray(tags) ? tags : [tags];
    for (const [key, entry] of cache) {
      if (entry.tags?.some((tag) => targets.includes(tag))) cache.delete(key);
    }
  }

  resetRequestCache() {}
}
