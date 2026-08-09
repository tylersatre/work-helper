import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileCachePlugin } from '../../src/server/services/email/graph-auth.js';

describe('fileCachePlugin', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mail-token-cache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the token cache file and its parent directory as owner-only (0600/0700) — it holds a live mailbox refresh token', async () => {
    const cachePath = join(dir, 'nested', 'mail-token-cache.json');
    const plugin = fileCachePlugin(cachePath);

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => '{"fake":"cache"}', deserialize: () => {} },
    } as never);

    const fileMode = statSync(cachePath).mode & 0o777;
    expect(fileMode).toBe(0o600);

    const dirMode = statSync(join(dir, 'nested')).mode & 0o777;
    expect(dirMode).toBe(0o700);
  });

  it('tightens permissions on an already-existing cache file written before this fix', async () => {
    const cachePath = join(dir, 'mail-token-cache.json');
    const plugin = fileCachePlugin(cachePath);

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => '{"first":"write"}', deserialize: () => {} },
    } as never);
    // Simulate a pre-fix world-readable file already on disk.
    const { chmodSync } = await import('node:fs');
    chmodSync(cachePath, 0o644);

    await plugin.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => '{"second":"write"}', deserialize: () => {} },
    } as never);

    const fileMode = statSync(cachePath).mode & 0o777;
    expect(fileMode).toBe(0o600);
  });
});
