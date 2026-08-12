import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Style contract for the dark-mode readability feature (016): every surface and
// text color in client SFCs must come from the --wh-* palette tokens, and the
// card treatments Tyler asked for must stay declared. CSS presentation is not
// computable in jsdom, so these are source-level regression pins; the computed
// values are evidenced by the browser-tester run in docs/evidence.

const CLIENT_ROOT = join(__dirname, '../../src/client');

function clientVueFiles(dir = CLIENT_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return clientVueFiles(path);
    return entry.name.endsWith('.vue') ? [path] : [];
  });
}

function styleOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('no hardcoded dark-mode literals in client components', () => {
  const files = clientVueFiles();

  it('finds the client SFCs (sanity)', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files.map((f) => [f.slice(CLIENT_ROOT.length + 1), f]))(
    '%s uses palette tokens, not near-black surface hexes or sub-AA white text',
    (_name, path) => {
      const source = styleOf(path);
      // Old surface literals that vanish against the palette background.
      expect(source).not.toMatch(/#1f1f24|#18181c|#101014/i);
      // Text colors below the AA-passing tiers (0.72 secondary / 0.58 muted).
      // Alphas <= 0.5 are allowed only for borders/overlays (border-color,
      // background-color, ...), never for the text `color:` property itself.
      expect(source).not.toMatch(/(?<!-)color:\s*rgba\(255,\s*255,\s*255,\s*0\.[0-5]\d*\)/);
    },
  );
});

describe('card treatments stay declared', () => {
  it('EmailConversationPage renders each message as an outlined surface card', () => {
    const source = styleOf(join(CLIENT_ROOT, 'pages/EmailConversationPage.vue'));
    const rule = source.match(/\.email-message \{[^}]*\}/)?.[0];
    expect(rule).toBeTruthy();
    expect(rule).toContain('background: var(--wh-surface)');
    expect(rule).toContain('border: 1px solid var(--wh-border)');
    expect(rule).toContain('border-radius');
  });

  it('App.vue declares the shared contained-card table and list styles', () => {
    const source = styleOf(join(CLIENT_ROOT, 'App.vue'));
    for (const selector of ['.wh-table-card', '.wh-table th', '.wh-table tbody tr:hover', '.wh-card-list']) {
      expect(source).toContain(selector);
    }
    const tableCard = source.match(/\.wh-table-card \{[^}]*\}/)?.[0];
    expect(tableCard).toContain('background: var(--wh-surface)');
    expect(tableCard).toContain('border: 1px solid var(--wh-border)');
  });
});
