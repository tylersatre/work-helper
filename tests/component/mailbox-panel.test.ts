// @vitest-environment jsdom
import { screen } from '@testing-library/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MailboxPanel from '../../src/client/components/MailboxPanel.vue';
import SyncPage from '../../src/client/pages/SyncPage.vue';

type MailboxStatus =
  | { state: 'not-configured'; missing: string[] }
  | { state: 'not-connected'; reason: 'never-signed-in' | 'expired'; detail?: string; attempt?: SignInAttempt }
  | { state: 'connected'; account: string };

type SignInAttempt = { status: 'pending'; verificationUri: string; userCode: string; expiresAt: number } | { status: 'failed'; error: string };

function mockFetch(getStatus: () => MailboxStatus, onConnect?: () => MailboxStatus) {
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/mailbox' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => getStatus() });
    }
    if (url === '/api/mailbox/connect' && options?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => (onConnect ? onConnect() : getStatus()) });
    }
    if (url === '/api/email-sync/runs' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('MailboxPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders "Not connected" with a Connect button given a not-connected/never-signed-in status', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ({ state: 'not-connected', reason: 'never-signed-in' })));

    mount(MailboxPanel, { attachTo: document.body });
    await flushPromises();

    expect(screen.getByTestId('mailbox-not-connected')).toBeTruthy();
    expect(screen.getByTestId('mailbox-connect')).toBeTruthy();
  });

  it('renders the verification link, code, copy control, and waiting indicator given a pending attempt', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({
        state: 'not-connected',
        reason: 'never-signed-in',
        attempt: { status: 'pending', verificationUri: 'https://microsoft.com/devicelogin', userCode: 'ABC-DEF-123', expiresAt: Date.now() + 900_000 },
      })),
    );

    mount(MailboxPanel, { attachTo: document.body });
    await flushPromises();

    const link = screen.getByTestId('mailbox-verification-link') as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.href).toContain('microsoft.com/devicelogin');
    expect(screen.getByTestId('mailbox-code').textContent).toContain('ABC-DEF-123');
    expect(screen.getByTestId('mailbox-copy-code')).toBeTruthy();
    expect(screen.getByTestId('mailbox-pending')).toBeTruthy();
  });

  it('renders "Connected as <account>" given a connected status', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ({ state: 'connected', account: 'tyler@example.com' })));

    mount(MailboxPanel, { attachTo: document.body });
    await flushPromises();

    expect(screen.getByTestId('mailbox-connected').textContent).toContain('tyler@example.com');
  });

  it('clicking Connect calls POST /api/mailbox/connect', async () => {
    const fetchMock = mockFetch(
      () => ({ state: 'not-connected', reason: 'never-signed-in' }),
      () => ({
        state: 'not-connected',
        reason: 'never-signed-in',
        attempt: { status: 'pending', verificationUri: 'https://microsoft.com/devicelogin', userCode: 'ABC-DEF-123', expiresAt: Date.now() + 900_000 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(MailboxPanel, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('[data-testid="mailbox-connect"]').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/mailbox/connect', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('mailbox-pending')).toBeTruthy();
  });

  it('polls GET /api/mailbox every ~3s while pending and re-renders on state change (FR-005)', async () => {
    vi.useFakeTimers();
    let connected = false;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/mailbox' && (!options || options.method === undefined)) {
        const status: MailboxStatus = connected
          ? { state: 'connected', account: 'tyler@example.com' }
          : {
              state: 'not-connected',
              reason: 'never-signed-in',
              attempt: { status: 'pending', verificationUri: 'https://microsoft.com/devicelogin', userCode: 'ABC-DEF-123', expiresAt: Date.now() + 900_000 },
            };
        return Promise.resolve({ ok: true, json: async () => status });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    mount(MailboxPanel, { attachTo: document.body });
    await flushPromises();
    expect(screen.getByTestId('mailbox-pending')).toBeTruthy();

    connected = true;
    await vi.advanceTimersByTimeAsync(3500);
    await flushPromises();

    expect(screen.getByTestId('mailbox-connected')).toBeTruthy();
  });
});

describe('SyncPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mounts MailboxPanel above the sync form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/mailbox') return Promise.resolve({ ok: true, json: async () => ({ state: 'not-connected', reason: 'never-signed-in' }) });
        if (url === '/api/email-sync/runs') return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    const wrapper = mount(SyncPage, { attachTo: document.body });
    await flushPromises();

    const panel = wrapper.findComponent(MailboxPanel);
    expect(panel.exists()).toBe(true);

    const panelEl = screen.getByTestId('mailbox-not-connected');
    const formEl = wrapper.get('.sync-form').element;
    // DOCUMENT_POSITION_FOLLOWING (4) set on formEl means panelEl precedes it.
    expect(panelEl.compareDocumentPosition(formEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
