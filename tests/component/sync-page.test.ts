// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { NDatePicker } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SyncPage from '../../src/client/pages/SyncPage.vue';

interface SyncRunView {
  id: number;
  ranAt: number;
  startDate: string;
  endDate: string;
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatLocalDate(d);
}

function todayIso(): string {
  return formatLocalDate(new Date());
}

function run(overrides: Partial<SyncRunView> = {}): SyncRunView {
  return {
    id: 1,
    ranAt: Date.parse('2026-08-08T12:00:00Z'),
    startDate: '2026-08-01',
    endDate: '2026-08-08',
    source: 'web',
    status: 'success',
    newCount: 2,
    updatedCount: 0,
    error: null,
    ...overrides,
  };
}

function mockFetch(getRuns: () => SyncRunView[], postHandler?: (body: unknown) => Promise<{ status: number; body: unknown }>) {
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/email-sync/runs' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: getRuns() }) });
    }
    if (url === '/api/email-sync/runs' && options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      if (postHandler) {
        return postHandler(body).then((r) => ({ ok: r.status < 400, status: r.status, json: async () => r.body }));
      }
      return Promise.resolve({ ok: true, status: 201, json: async () => run() });
    }
    return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
  });
}

function datePickers(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents(NDatePicker);
}

function mountPage() {
  return mount(SyncPage, { attachTo: document.body });
}

describe('SyncPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('prefills start 30 days before today / end today, and shows a styled "No syncs yet" empty state when no runs exist', async () => {
    vi.stubGlobal('fetch', mockFetch(() => []));

    const wrapper = mountPage();
    await flushPromises();

    const [start, end] = datePickers(wrapper);
    expect(start!.props('value')).toBe(Date.parse(`${isoDaysAgo(30)}T00:00:00`));
    expect(end!.props('value')).toBe(Date.parse(`${todayIso()}T00:00:00`));

    expect(screen.getByTestId('sync-history-empty')).toBeTruthy();
    expect(screen.getByText(/no syncs yet/i)).toBeTruthy();
  });

  it('prefills start from the newest successful run\'s endDate when history exists', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => [run({ id: 2, endDate: '2026-08-08', status: 'success' }), run({ id: 1, endDate: '2026-08-01', status: 'failure' })]),
    );

    const wrapper = mountPage();
    await flushPromises();

    const [start] = datePickers(wrapper);
    expect(start!.props('value')).toBe(Date.parse('2026-08-08T00:00:00'));
  });

  it('rejects missing dates and start-after-end with an inline message, firing no POST', async () => {
    const fetchMock = mockFetch(() => []);
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage();
    await flushPromises();

    const [start, end] = datePickers(wrapper);
    start!.vm.$emit('update:value', null);
    end!.vm.$emit('update:value', null);
    await flushPromises();

    await fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    await flushPromises();
    expect(screen.getByTestId('sync-validation-error').textContent).toMatch(/required/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/email-sync/runs', expect.objectContaining({ method: 'POST' }));

    start!.vm.$emit('update:value', Date.parse('2026-08-09T00:00:00'));
    end!.vm.$emit('update:value', Date.parse('2026-08-02T00:00:00'));
    await flushPromises();

    await fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    await flushPromises();
    expect(screen.getByTestId('sync-validation-error').textContent).toMatch(/start date must not be after end date/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/email-sync/runs', expect.objectContaining({ method: 'POST' }));
  });

  it('disables the Sync button and shows an in-progress indicator while the POST is pending, then renders the result', async () => {
    let resolvePost!: (value: { status: number; body: unknown }) => void;
    const pending = new Promise<{ status: number; body: unknown }>((resolve) => {
      resolvePost = resolve;
    });
    vi.stubGlobal(
      'fetch',
      mockFetch(() => [], () => pending),
    );

    mountPage();
    await flushPromises();

    const button = screen.getByRole('button', { name: /sync/i }) as HTMLButtonElement;
    await fireEvent.click(button);
    await flushPromises();

    expect(button.disabled).toBe(true);
    expect(screen.getByTestId('sync-in-progress')).toBeTruthy();

    resolvePost({ status: 201, body: run({ newCount: 2, updatedCount: 0 }) });
    await flushPromises();

    expect(button.disabled).toBe(false);
    const result = screen.getByTestId('sync-result');
    expect(result.textContent).toContain('2 new, 0 updated');
  });

  it('renders a failure result with the error text', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => [], async () => ({ status: 201, body: run({ status: 'failure', error: 'Mailbox unreachable', newCount: 0, updatedCount: 0 }) })),
    );

    mountPage();
    await flushPromises();
    await fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    await flushPromises();

    expect(screen.getByTestId('sync-result').textContent).toContain('Mailbox unreachable');
  });

  it('shows a fallback error message (not a blank screen) when a failed POST returns an error body outside the {error:{message}} shape', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/email-sync/runs' && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ statusCode: 500, error: 'Internal Server Error', message: 'boom' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    mountPage();
    await flushPromises();
    await fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    await flushPromises();

    expect(screen.getByTestId('sync-validation-error').textContent?.trim()).toBeTruthy();
    const button = screen.getByRole('button', { name: /sync/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('shows a fallback error message (not a blank screen) when the POST response body is not valid JSON', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/email-sync/runs' && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    mountPage();
    await flushPromises();
    await fireEvent.click(screen.getByRole('button', { name: /sync/i }));
    await flushPromises();

    expect(screen.getByTestId('sync-validation-error').textContent?.trim()).toBeTruthy();
    const button = screen.getByRole('button', { name: /sync/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('renders the run history newest-first with when/range/source/status/counts', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => [
        run({ id: 2, source: 'mcp', status: 'success', newCount: 1, updatedCount: 3 }),
        run({ id: 1, source: 'web', status: 'failure', error: 'boom' }),
      ]),
    );

    mountPage();
    await flushPromises();

    const rows = await screen.findAllByTestId('sync-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('mcp');
    expect(rows[0]!.textContent).toContain('1 new / 3 updated');
    expect(rows[1]!.textContent).toContain('web');
    expect(rows[1]!.textContent).toContain('boom');
  });
});
