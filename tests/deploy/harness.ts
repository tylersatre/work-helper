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
  /** Test CONNECTOR_PASSWORD written into `.env`. */
  password: string;
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
  /** Test CONNECTOR_PASSWORD. Defaults to a random value. */
  password?: string;
}

export async function createHarness(opts: CreateHarnessOptions = {}): Promise<Harness> {
  const repoRoot = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'work-helper-deploy-'));
  copyWorkingTree(repoRoot, dir);

  const projectName = `wh${randomBytes(4).toString('hex')}`;
  const port = await getFreePort();
  const password = opts.password ?? `test-${randomBytes(8).toString('hex')}`;
  const trackedContainers: string[] = [];

  writeFileSync(join(dir, '.env'), envFileContents({ CONNECTOR_PASSWORD: password, WORK_HELPER_PORT: String(port) }));

  const baseUrl = `http://127.0.0.1:${port}`;

  const harness: Harness = {
    dir,
    projectName,
    port,
    password,
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
      await harness.compose(['down', '-v', '--rmi', 'local']);
      for (const containerId of trackedContainers) {
        await run('docker', ['rm', '-f', containerId], dir);
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };

  return harness;
}
