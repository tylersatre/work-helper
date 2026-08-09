import { randomBytes } from 'node:crypto';
import http, { request as httpRequest } from 'node:http';
import { URL } from 'node:url';

const USERINFO_PATH = '/application/o/userinfo/';

interface Args {
  port: number;
  upstream: string;
  username: string;
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/outpost-sim.ts [options]

Simulates the Authentik proxy outpost for local dev: serves a stub userinfo endpoint and
reverse-proxies everything else to --upstream, injecting X-authentik-jwt on every proxied
request — exactly the shape the real outpost produces. Point AUTHENTIK_USERINFO_URL at this
sim's userinfo endpoint when starting the dev server, then browse (or point an MCP client)
through this sim's port instead of the dev server's port directly.

Options:
  --port <n>        Port to listen on (default: 9400)
  --upstream <url>  Dev server to proxy to (default: http://127.0.0.1:3000)
  --username <s>     Username the stub token resolves to (default: tyler)
  -h, --help          Show this help
`);
}

function parseArgs(argv: string[]): Args {
  let port = 9400;
  let upstream = 'http://127.0.0.1:3000';
  let username = 'tyler';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') {
      port = Number(argv[(i += 1)]);
    } else if (arg === '--upstream') {
      upstream = argv[(i += 1)] as string;
    } else if (arg === '--username') {
      username = argv[(i += 1)] as string;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`invalid --port: ${String(port)}`);
  }

  return { port, upstream, username };
}

async function selfCheck(port: number, honoredToken: string): Promise<void> {
  const base = `http://127.0.0.1:${port}${USERINFO_PATH}`;

  const honored = await fetch(base, { headers: { authorization: `Bearer ${honoredToken}` } });
  if (honored.status !== 200) {
    throw new Error(`self-check failed: the honored stub token got ${honored.status}, expected 200`);
  }
  const body = (await honored.json()) as { preferred_username?: unknown };
  if (typeof body.preferred_username !== 'string' || body.preferred_username.length === 0) {
    throw new Error('self-check failed: preferred_username missing or empty in the honored-token response');
  }

  const dishonored = await fetch(base, { headers: { authorization: 'Bearer not-the-honored-token' } });
  if (dishonored.status !== 401) {
    throw new Error(`self-check failed: a dishonored token got ${dishonored.status}, expected 401`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const upstreamUrl = new URL(args.upstream);
  const token = randomBytes(24).toString('base64url');

  const server = http.createServer((req, res) => {
    if (req.url === USERINFO_PATH) {
      const authHeader = req.headers.authorization;
      const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

      if (presented === token) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ preferred_username: args.username }));
      } else {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_token' }));
      }
      return;
    }

    const proxyReq = httpRequest(
      {
        host: upstreamUrl.hostname,
        port: upstreamUrl.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, 'x-authentik-jwt': token, host: upstreamUrl.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `outpost-sim: upstream unreachable: ${error.message}` } }));
    });
    req.pipe(proxyReq);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, '127.0.0.1', resolve);
  });

  console.log(`[outpost-sim] listening on http://127.0.0.1:${args.port}, proxying to ${args.upstream}`);
  console.log(`[outpost-sim] userinfo endpoint: http://127.0.0.1:${args.port}${USERINFO_PATH}`);
  console.log(`[outpost-sim] injecting X-authentik-jwt for username "${args.username}" on every proxied request`);

  await selfCheck(args.port, token);
  console.log('[outpost-sim] self-check passed — the stub userinfo endpoint matches the simulation contract');
}

main().catch((error: unknown) => {
  console.error('[outpost-sim]', error instanceof Error ? error.message : error);
  process.exit(1);
});
