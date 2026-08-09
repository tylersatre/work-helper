import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ComposeResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface WaitForHttpOptions {
  timeoutMs?: number;
  intervalMs?: number;
  method?: string;
  expectStatus?: (status: number) => boolean;
}

export interface Harness {
  /** Scratch temp directory holding the working-tree copy. */
  dir: string;
  /** Unique `docker compose -p` project name for this harness instance. */
  projectName: string;
  /** Dynamically chosen free host port, written into `.env` as WORK_HELPER_PORT. */
  port: number;
  /** Test MCP_TOKEN_SECRET written into `.env`. */
  mcpTokenSecret: string;
  /**
   * AUTHENTIK_USERINFO_URL written into `.env`, pointing at `identityProviderContainerName`'s
   * expected DNS name on the `work-helper` network. Written up front so the app container starts
   * with it configured; a test starts the actual stub identity provider container under this name
   * before exercising the authorize flow.
   */
  identityProviderUrl: string;
  /** The container name a test must use when starting the throwaway stub identity provider. */
  identityProviderContainerName: string;
  /** `http://127.0.0.1:<port>` */
  baseUrl: string;
  /** Runs `docker compose -p <project> <args>` in the scratch dir; never throws. */
  compose(args: string[]): Promise<ComposeResult>;
  up(extraArgs?: string[]): Promise<ComposeResult>;
  down(extraArgs?: string[]): Promise<ComposeResult>;
  restart(extraArgs?: string[]): Promise<ComposeResult>;
  logs(extraArgs?: string[]): Promise<ComposeResult>;
  /** Container ID of the given service (default `work-helper`) in this project. */
  containerId(service?: string): Promise<string>;
  /** Runs an arbitrary `docker <args>` command; never throws. */
  docker(args: string[]): Promise<ComposeResult>;
  /** Registers an out-of-compose container (Caddy, throwaway clients) for teardown cleanup. */
  trackContainer(containerId: string): void;
  /** Rewrites `.env` in the scratch dir. `undefined` values omit the key entirely. */
  writeEnv(vars: Record<string, string | undefined>): void;
  /** Writes a file relative to the scratch dir (e.g. `config/lanes.json`, a source file for simulated updates). */
  writeFile(relPath: string, contents: string): void;
  /** Reads a file relative to the scratch dir. */
  readFile(relPath: string): string;
  /** `fetch` against the published port. */
  fetchApp(path: string, init?: RequestInit): Promise<Response>;
  /** Polls `fetchApp(path)` until it succeeds (2xx by default) or the timeout elapses. */
  waitForHttp(path: string, opts?: WaitForHttpOptions): Promise<Response>;
  /** Tears down: `compose down -v --rmi local`, removes tracked containers, deletes the scratch dir. */
  teardown(): Promise<void>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('expected a TCP address'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function copyWorkingTree(repoRoot: string, destDir: string): void {
  const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
  const relPaths = output.split('\0').filter(Boolean);
  for (const relPath of relPaths) {
    const src = join(repoRoot, relPath);
    if (!existsSync(src)) {
      continue;
    }
    const dest = join(destDir, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}

function envFileContents(vars: Record<string, string | undefined>): string {
  return Object.entries(vars)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
    .concat('\n');
}

async function run(command: string, args: string[], cwd: string): Promise<ComposeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd, maxBuffer: 1024 * 1024 * 256 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string; message: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? err.message };
  }
}

export interface CreateHarnessOptions {
  /** Test MCP_TOKEN_SECRET. Defaults to a random value. */
  mcpTokenSecret?: string;
}

// A self-contained Node script (no repo imports — it runs inside a bare node:22-alpine container)
// honoring the same simulation contract as tests/integration/helpers/stub-identity-provider.ts:
// 200 + preferred_username for the one token it was started with, 401 for anything else.
const STUB_IDENTITY_SCRIPT = `
const http = require('http');
const token = process.env.HONORED_TOKEN;
const username = process.env.STUB_USERNAME || 'tyler';
http
  .createServer((req, res) => {
    const auth = req.headers.authorization;
    const presented = auth && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (presented === token) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ preferred_username: username }));
    } else {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
    }
  })
  .listen(8080, '0.0.0.0');
`;

/**
 * Starts the stub identity provider as a throwaway container on the `work-helper` network, under
 * `harness.identityProviderContainerName` — the DNS name `harness.identityProviderUrl` already
 * points at. Tracked for teardown. Returns the container id.
 */
export async function startStubIdentityContainer(harness: Harness, honoredToken: string, username = 'tyler'): Promise<string> {
  const run = await harness.docker([
    'run',
    '-d',
    '--name',
    harness.identityProviderContainerName,
    '--network',
    'work-helper',
    '-e',
    `HONORED_TOKEN=${honoredToken}`,
    '-e',
    `STUB_USERNAME=${username}`,
    'node:22-alpine',
    'node',
    '-e',
    STUB_IDENTITY_SCRIPT,
  ]);
  if (run.code !== 0) {
    throw new Error(`docker run stub-identity failed:\n${run.stderr}`);
  }
  const containerId = run.stdout.trim();
  harness.trackContainer(containerId);

  // The container is running as soon as `docker run` returns, but the Node process inside it
  // (and the network's DNS registration for its name) can lag a beat behind that — wait until the
  // stub is actually answering before any caller relies on other containers reaching it by name.
  const deadline = Date.now() + 5_000;
  let ready = false;
  while (Date.now() < deadline) {
    const probe = await harness.docker(['exec', containerId, 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8080/application/o/userinfo/']);
    // wget exits non-zero on a non-2xx response too (401 here) — any exit code other than "connection
    // refused"-style failure proves the server is listening. A cleanly-parsed CurlResult isn't needed;
    // stderr classifies unreachable vs. merely-unauthorized.
    if (probe.code === 0 || !/connection refused|could not connect/i.test(probe.stderr)) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) {
    throw new Error(`stub identity container ${containerId} never became ready`);
  }

  return containerId;
}

export async function createHarness(opts: CreateHarnessOptions = {}): Promise<Harness> {
  const repoRoot = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'work-helper-deploy-'));
  copyWorkingTree(repoRoot, dir);

  const projectName = `wh${randomBytes(4).toString('hex')}`;
  const port = await getFreePort();
  const mcpTokenSecret = opts.mcpTokenSecret ?? `test-${randomBytes(8).toString('hex')}`;
  const identityProviderContainerName = `${projectName}-stub-identity`;
  const identityProviderUrl = `http://${identityProviderContainerName}:8080/application/o/userinfo/`;
  const trackedContainers: string[] = [];

  writeFileSync(
    join(dir, '.env'),
    envFileContents({
      MCP_TOKEN_SECRET: mcpTokenSecret,
      AUTHENTIK_USERINFO_URL: identityProviderUrl,
      WORK_HELPER_PORT: String(port),
    }),
  );

  const baseUrl = `http://127.0.0.1:${port}`;

  const harness: Harness = {
    dir,
    projectName,
    port,
    mcpTokenSecret,
    identityProviderUrl,
    identityProviderContainerName,
    baseUrl,

    compose(args: string[]) {
      return run('docker', ['compose', '-p', projectName, ...args], dir);
    },

    up(extraArgs: string[] = []) {
      return harness.compose(['up', '-d', '--build', ...extraArgs]);
    },

    down(extraArgs: string[] = []) {
      return harness.compose(['down', ...extraArgs]);
    },

    restart(extraArgs: string[] = []) {
      return harness.compose(['restart', ...extraArgs]);
    },

    logs(extraArgs: string[] = []) {
      return harness.compose(['logs', ...extraArgs]);
    },

    async containerId(service = 'work-helper') {
      const result = await harness.compose(['ps', '-q', service]);
      const id = result.stdout.trim();
      if (!id) {
        throw new Error(`no running container for service "${service}" (project ${projectName})`);
      }
      return id;
    },

    docker(args: string[]) {
      return run('docker', args, dir);
    },

    trackContainer(containerId: string) {
      trackedContainers.push(containerId);
    },

    writeEnv(vars: Record<string, string | undefined>) {
      writeFileSync(join(dir, '.env'), envFileContents(vars));
    },

    writeFile(relPath: string, contents: string) {
      const dest = join(dir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, contents);
    },

    readFile(relPath: string) {
      return readFileSync(join(dir, relPath), 'utf8');
    },

    fetchApp(path: string, init?: RequestInit) {
      return fetch(`${baseUrl}${path}`, init);
    },

    async waitForHttp(path: string, waitOpts: WaitForHttpOptions = {}) {
      const timeoutMs = waitOpts.timeoutMs ?? 30_000;
      const intervalMs = waitOpts.intervalMs ?? 500;
      const expectStatus = waitOpts.expectStatus ?? ((status: number) => status >= 200 && status < 300);
      const deadline = Date.now() + timeoutMs;
      let lastError: unknown;

      while (Date.now() < deadline) {
        try {
          const response = await harness.fetchApp(path, { method: waitOpts.method ?? 'GET' });
          if (expectStatus(response.status)) {
            return response;
          }
          lastError = new Error(`unexpected status ${response.status}`);
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      throw new Error(`waitForHttp(${path}) timed out after ${timeoutMs}ms: ${String(lastError)}`);
    },

    async teardown() {
      // Remove tracked out-of-compose containers (Caddy, throwaway clients) first: if any are still
      // attached to the network, `compose down` cannot remove it and leaks it (research R7).
      for (const containerId of trackedContainers) {
        await run('docker', ['rm', '-f', containerId], dir);
      }
      await harness.compose(['down', '-v', '--rmi', 'local']);
      rmSync(dir, { recursive: true, force: true });
    },
  };

  return harness;
}
