import { describe, expect, it } from 'vitest';
import { flattenSyncableFolders } from '../../src/server/services/email/sync.js';
import type { MailFolderNode } from '../../src/server/services/email/provider.js';

function node(overrides: Partial<MailFolderNode>): MailFolderNode {
  return { id: overrides.id ?? 'id', name: overrides.name ?? 'name', wellKnown: overrides.wellKnown ?? null, children: overrides.children ?? [] };
}

describe('flattenSyncableFolders', () => {
  it('keeps Inbox, Sent Items, Archive, and custom folders at any nesting depth', () => {
    const tree: MailFolderNode[] = [
      node({ id: 'inbox', name: 'Inbox', wellKnown: 'inbox' }),
      node({ id: 'sentitems', name: 'Sent Items', wellKnown: 'sentitems' }),
      node({
        id: 'archive',
        name: 'Archive',
        wellKnown: 'archive',
        children: [node({ id: 'archive-2024', name: '2024', children: [node({ id: 'archive-2024-q1', name: 'Q1' })] })],
      }),
      node({ id: 'projects', name: 'Projects', children: [node({ id: 'projects-acme', name: 'Acme' })] }),
    ];

    const flattened = flattenSyncableFolders(tree);

    expect(flattened.map((f) => f.id).sort()).toEqual(
      ['inbox', 'sentitems', 'archive', 'archive-2024', 'archive-2024-q1', 'projects', 'projects-acme'].sort(),
    );
  });

  it('prunes junkemail/deleteditems/drafts nodes with all their descendants', () => {
    const tree: MailFolderNode[] = [
      node({ id: 'inbox', name: 'Inbox', wellKnown: 'inbox' }),
      node({
        id: 'junkemail',
        name: 'Junk Email',
        wellKnown: 'junkemail',
        children: [node({ id: 'junk-sub', name: 'Suspicious' })],
      }),
      node({
        id: 'deleteditems',
        name: 'Deleted Items',
        wellKnown: 'deleteditems',
        children: [node({ id: 'deleted-sub', name: 'Old projects' })],
      }),
      node({
        id: 'drafts',
        name: 'Drafts',
        wellKnown: 'drafts',
        children: [node({ id: 'drafts-sub', name: 'Unsent' })],
      }),
    ];

    const flattened = flattenSyncableFolders(tree);

    expect(flattened.map((f) => f.id)).toEqual(['inbox']);
  });
});
