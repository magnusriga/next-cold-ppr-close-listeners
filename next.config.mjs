import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs/config';

// Set NO_CACHE_HANDLER=1 at build time for the negative control (default cache handler).
const customCacheHandler = process.env.NO_CACHE_HANDLER
  ? {}
  : {
      cacheHandler: fileURLToPath(new URL('./cache-handler.mjs', import.meta.url)),
      cacheMaxMemorySize: 0,
    };

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  compress: true,
  ...customCacheHandler,
};

export default withSentryConfig(nextConfig, {
  telemetry: false,
  silent: true,
  sourcemaps: { disable: true },
  release: { create: false, finalize: false },
});
