# Cold PPR fallback render registers duplicate `close` listeners

Minimal reproduction for a Next.js `MaxListenersExceededWarning` on `ServerResponse`.

With Cache Components (PPR), a custom `cacheHandler` and an empty cache, the first
request to a dynamic route (`/[slug]`, no `generateStaticParams`) in a fresh server
process renders two work stores against the same response. Each one registers its own
`AfterContext` close callback and its own fetch-metrics close callback, so the response
carries two more `close` listeners than a warm request. With Sentry's two default HTTP
server listeners on top, the cold response reaches 11 and Node prints:

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 close listeners added to [ServerResponse]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
```

The cache handler is a small in-memory `Map` that implements the documented
[`cacheHandler`](https://nextjs.org/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath)
interface. It starts empty in every process, like a shared cache (for example Redis)
after a new deployment. Sentry uses a dummy DSN and a transport that never sends anything.

## Versions

- `next` 16.3.8 (also reproduced on 16.4.0-canary.60)
- `react` / `react-dom` 19.3.0
- `@sentry/nextjs` 11.1.0
- Node.js 26.10.0, Linux x64

## Steps

```sh
npm install
npm run build
npm start            # node --trace-warnings node_modules/next/dist/bin/next start
```

Wait about two seconds after `Ready` so Sentry has finished initializing, then in a second terminal:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/cold   # cold: 200, warning printed
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/cold   # warm: 200, no warning
```

Restart the server to empty the cache, and the first request warns again. Any slug
works; only the first request for the route in each process is cold.

To see every registration and the peak per response, use `npm run start:trace` instead of
`npm start`. It preloads [`trace-close-listeners.mjs`](./trace-close-listeners.mjs), which
only observes `ServerResponse` listener registration; it does not add listeners or
change listener limits.

### Negative controls

- **Default cache handler.** Build and start with `NO_CACHE_HANDLER=1` (set it for both
  commands, since `next start` evaluates `next.config.mjs` again):
  `NO_CACHE_HANDLER=1 npm run build && NO_CACHE_HANDLER=1 npm start`. Cold and warm
  responses both peak at 9; no warning.
- **Without Sentry.** Remove `instrumentation.js` and `withSentryConfig`. The cold
  response peaks at 9 and the warm response at 7. The two extra listeners are still
  registered, they just stay under Node's default limit of 10.

## Expected behavior

A cold response registers the same number of `close` listeners as a warm response
(9 here), or the render work stores share one response-close subscription. No
`MaxListenersExceededWarning`.

## Actual behavior

| Request | Peak `close` listeners | Warning |
| --- | --- | --- |
| First request in process, custom `cacheHandler` | 11 | yes |
| Second request | 9 | no |
| Default cache handler, first or second | 9 | no |
| Without Sentry, custom `cacheHandler`, first / second | 9 / 7 | no |

Both cold and warm responses return HTTP 200. The listeners are released when the
response closes; this report is about the duplicate registrations, not a confirmed leak.

## Listener owners on the cold response

From `npm run start:trace` (the 11th registration triggers the warning):

| # | Owner | Source (`next/dist/...` unless noted) |
| --- | --- | --- |
| 1 | Sentry HTTP server instrumentation: request session | `@sentry/nextjs` HTTP integration |
| 2 | Sentry HTTP server instrumentation: response status on isolation scope | `@sentry/nextjs` HTTP integration |
| 3 | Router server: release compression stream on premature close | `server/lib/router-server.js:262` |
| 4 | `signalFromNodeResponse` abort controller (router) | `server/lib/router-server.js:358` → `server/web/spec-extension/adapters/next-request.js:50` |
| 5 | `signalFromNodeResponse` abort controller (Proxy) | `server/next-server.js:1185` (`runMiddleware`) → `next-request.js:50` |
| 6 | `AfterContext`, first work store | `server/after/after-context.js:35` |
| 7 | Stop fetch-metrics tracking, first work store | `server/app-render/app-render.js:1509` |
| 8 | `AfterContext`, **second** work store | same as 6 |
| 9 | Stop fetch-metrics tracking, **second** work store | same as 7 |
| 10 | `pipeToNodeResponse` abort controller | `server/pipe-readable.js:127` → `next-request.js:50` |
| 11 | `createWriterFromResponse`: remove `drain` listener | `server/pipe-readable.js:47` |

The warm response has the same list without 8 and 9.

The stack frames of most registrations go through `next/dist/compiled/compression`,
because compression wraps `res.on`. Compression itself owns only registration 3.

## Files

- `app/[slug]/page.jsx`: `Suspense` around an async component that awaits `params`, renders a
  `'use cache'` + `cacheLife('max')` child and a child that awaits `headers()`.
- `app/layout.jsx`: static root layout.
- `cache-handler.mjs`: in-memory `cacheHandler`.
- `next.config.mjs`: `cacheComponents`, `compress`, `cacheHandler`, `cacheMaxMemorySize: 0`,
  wrapped with `withSentryConfig` (uploads and telemetry disabled).
- `instrumentation.js`: `Sentry.init` with a dummy DSN and a no-op transport.
- `proxy.js`: returns `NextResponse.next()`.
- `trace-close-listeners.mjs`: optional diagnostic preload.
