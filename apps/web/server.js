import Fastify from 'fastify';
import fastifyExpress from '@fastify/express';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  const fastify = Fastify({ logger: true });
  const isProduction = process.env.NODE_ENV === 'production';

  // Core Fastify routes (API proxied or handled here if needed)
  fastify.get('/health', async () => ({ status: 'ok', mode: isProduction ? 'prod' : 'dev' }));

  if (isProduction) {
    // Production: Use Astro Middleware
    await fastify.register(fastifyExpress);
    const { handler } = await import('./dist/server/entry.mjs');
    await fastify.use(handler);
    
    // Serve static assets
    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, 'dist', 'client'),
    });

  } else {
    // Development: Proxy to Astro Dev Server (HMR support)
    // We assume 'pnpm astro dev' is running or we spawn it.
    // Spawning it keeps the "single entry point" feel.
    console.log('Starting Astro Dev Server...');
    const { spawn } = await import('child_process');
    const astro = spawn('pnpm', ['astro', 'dev'], { 
      stdio: 'inherit',
      shell: true
    });
    
    // Cleanup astro process on exit
    process.on('SIGINT', () => astro.kill());
    process.on('SIGTERM', () => astro.kill());

    // Register Proxy
    await fastify.register(import('@fastify/http-proxy'), {
      upstream: 'http://localhost:4321', 
      prefix: '/', 
      http2: false
    });
  }

  try {
    const address = await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`Fastify server running on ${address}`);
    if (!isProduction) console.log('Proxying to Astro at http://localhost:4321');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
