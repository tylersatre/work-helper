// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/vue';
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
    expect(within(screen.getByTestId('email-sync-section')).getByText(/no syncs yet/i)).toBeTruthy();
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

    await fireEvent.click(within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }));
    await flushPromises();
    expect(screen.getByTestId('sync-validation-error').textContent).toMatch(/required/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/email-sync/runs', expect.objectContaining({ method: 'POST' }));

    start!.vm.$emit('update:value', Date.parse('2026-08-09T00:00:00'));
    end!.vm.$emit('update:value', Date.parse('2026-08-02T00:00:00'));
    await flushPromises();

    await fireEvent.click(within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }));
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

    const button = within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }) as HTMLButtonElement;
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
    await fireEvent.click(within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }));
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
    await fireEvent.click(within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }));
    await flushPromises();

    expect(screen.getByTestId('sync-validation-error').textContent?.trim()).toBeTruthy();
    const button = within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }) as HTMLButtonElement;
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
    await fireEvent.click(within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }));
    await flushPromises();

    expect(screen.getByTestId('sync-validation-error').textContent?.trim()).toBeTruthy();
    const button = within(screen.getByTestId('email-sync-section')).getByRole('button', { name: /sync/i }) as HTMLButtonElement;
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

// --- Calendar section (T010, US1) -----------------------------------------------------------
//
// Mirrors the email section's assertions one-for-one with `calendar-`-prefixed test ids. The
// calendar Sync form is expected to live inside a container carrying data-testid
// "calendar-sync-section" (so its two NDatePickers can be located unambiguously alongside the
// email section's), and its Sync button is expected to carry data-testid "calendar-sync-button"
// (the email button has no testid of its own — it is located via the existing ".sync-form button"
// class selector, unchanged from the tests above). Both requirements are new contract surface
// this test file establishes for the SyncPage.vue implementation (T018).

interface CalendarSyncRunView {
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

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

function calendarRun(overrides: Partial<CalendarSyncRunView> = {}): CalendarSyncRunView {
  return {
    id: 1,
    ranAt: Date.parse('2026-08-08T12:00:00Z'),
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    source: 'web',
    status: 'success',
    newCount: 2,
    updatedCount: 0,
    error: null,
    ...overrides,
  };
}

interface MockFetchAllOptions {
  emailRuns?: SyncRunView[];
  emailPost?: (body: unknown) => Promise<{ status: number; body: unknown }>;
  calendarRuns?: CalendarSyncRunView[];
  calendarPost?: (body: unknown) => Promise<{ status: number; body: unknown }>;
  running?: boolean | (() => boolean);
}

/** Handles both sync kinds' GET/POST routes plus GET /api/sync/status, defaulting to empty/idle. */
function mockFetchAll(opts: MockFetchAllOptions = {}) {
  const { emailRuns = [], emailPost, calendarRuns = [], calendarPost, running = false } = opts;
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/email-sync/runs' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: emailRuns }) });
    }
    if (url === '/api/email-sync/runs' && options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      if (emailPost) return emailPost(body).then((r) => ({ ok: r.status < 400, status: r.status, json: async () => r.body }));
      return Promise.resolve({ ok: true, status: 201, json: async () => run() });
    }
    if (url === '/api/calendar-sync/runs' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: calendarRuns }) });
    }
    if (url === '/api/calendar-sync/runs' && options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      if (calendarPost) return calendarPost(body).then((r) => ({ ok: r.status < 400, status: r.status, json: async () => r.body }));
      return Promise.resolve({ ok: true, status: 201, json: async () => calendarRun() });
    }
    if (url === '/api/sync/status') {
      const isRunning = typeof running === 'function' ? running() : running;
      return Promise.resolve({ ok: true, json: async () => ({ running: isRunning }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

function calendarSection(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-testid="calendar-sync-section"]');
}

function calendarDatePickers(wrapper: ReturnType<typeof mount>) {
  return calendarSection(wrapper).findAllComponents(NDatePicker);
}

function calendarButton(): HTMLButtonElement {
  return screen.getByTestId('calendar-sync-button') as HTMLButtonElement;
}

function emailButton(wrapper: ReturnType<typeof mount>): HTMLButtonElement {
  return wrapper.get('.sync-form button').element as HTMLButtonElement;
}

describe('SyncPage calendar section', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('prefills start 30 days before today / end 30 days after today, and shows calendar-sync-history-empty when no calendar runs exist', async () => {
    vi.stubGlobal('fetch', mockFetchAll());

    const wrapper = mountPage();
    await flushPromises();

    const [start, end] = calendarDatePickers(wrapper);
    expect(start!.props('value')).toBe(Date.parse(`${isoDaysAgo(30)}T00:00:00`));
    expect(end!.props('value')).toBe(Date.parse(`${isoDaysAhead(30)}T00:00:00`));

    expect(screen.getByTestId('calendar-sync-history-empty')).toBeTruthy();
  });

  it('keeps the rolling ±30-day prefill even when calendar run history exists (no history-derived prefill, unlike email)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchAll({ calendarRuns: [calendarRun({ id: 1, endDate: '2026-01-01', status: 'success' })] }),
    );

    const wrapper = mountPage();
    await flushPromises();

    const [start, end] = calendarDatePickers(wrapper);
    expect(start!.props('value')).toBe(Date.parse(`${isoDaysAgo(30)}T00:00:00`));
    expect(end!.props('value')).toBe(Date.parse(`${isoDaysAhead(30)}T00:00:00`));
  });

  it('rejects missing dates and start-after-end with an inline message, firing no POST', async () => {
    const fetchMock = mockFetchAll();
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPage();
    await flushPromises();

    const [start, end] = calendarDatePickers(wrapper);
    start!.vm.$emit('update:value', null);
    end!.vm.$emit('update:value', null);
    await flushPromises();

    await fireEvent.click(calendarButton());
    await flushPromises();
    expect(screen.getByTestId('calendar-sync-validation-error').textContent).toMatch(/required/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/calendar-sync/runs', expect.objectContaining({ method: 'POST' }));

    start!.vm.$emit('update:value', Date.parse('2026-08-31T00:00:00'));
    end!.vm.$emit('update:value', Date.parse('2026-08-01T00:00:00'));
    await flushPromises();

    await fireEvent.click(calendarButton());
    await flushPromises();
    expect(screen.getByTestId('calendar-sync-validation-error').textContent).toMatch(/start date must not be after end date/i);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/calendar-sync/runs', expect.objectContaining({ method: 'POST' }));
  });

  it('disables both Sync buttons and shows an in-progress indicator while the calendar POST is pending, then renders the result', async () => {
    let resolvePost!: (value: { status: number; body: unknown }) => void;
    const pending = new Promise<{ status: number; body: unknown }>((resolve) => {
      resolvePost = resolve;
    });
    vi.stubGlobal('fetch', mockFetchAll({ calendarPost: () => pending }));

    const wrapper = mountPage();
    await flushPromises();

    await fireEvent.click(calendarButton());
    await flushPromises();

    expect(calendarButton().disabled).toBe(true);
    expect(emailButton(wrapper).disabled).toBe(true);
    expect(screen.getByTestId('calendar-sync-in-progress')).toBeTruthy();

    resolvePost({ status: 201, body: calendarRun({ newCount: 3, updatedCount: 1 }) });
    await flushPromises();

    expect(calendarButton().disabled).toBe(false);
    expect(emailButton(wrapper).disabled).toBe(false);
    const result = screen.getByTestId('calendar-sync-result');
    expect(result.textContent).toContain('3 new, 1 updated');
  });

  it('renders a calendar failure result with the error text', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchAll({
        calendarPost: async () => ({ status: 201, body: calendarRun({ status: 'failure', error: 'Mailbox unreachable', newCount: 0, updatedCount: 0 }) }),
      }),
    );

    mountPage();
    await flushPromises();
    await fireEvent.click(calendarButton());
    await flushPromises();

    expect(screen.getByTestId('calendar-sync-result').textContent).toContain('Mailbox unreachable');
  });

  it('renders the calendar run history newest-first with when/range/source/status/counts/error', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchAll({
        calendarRuns: [
          calendarRun({ id: 2, source: 'mcp', status: 'success', newCount: 4, updatedCount: 1 }),
          calendarRun({ id: 1, source: 'web', status: 'failure', error: 'calendar boom' }),
        ],
      }),
    );

    mountPage();
    await flushPromises();

    const rows = await screen.findAllByTestId('calendar-sync-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('mcp');
    expect(rows[0]!.textContent).toContain('4 new / 1 updated');
    expect(rows[1]!.textContent).toContain('web');
    expect(rows[1]!.textContent).toContain('calendar boom');
  });

  it('disables both Sync buttons while GET /api/sync/status reports a sync running elsewhere (e.g. MCP-triggered), then re-enables once it clears', async () => {
    vi.useFakeTimers();
    let running = true;
    vi.stubGlobal('fetch', mockFetchAll({ running: () => running }));

    const wrapper = mountPage();
    await flushPromises();

    expect(calendarButton().disabled).toBe(true);
    expect(emailButton(wrapper).disabled).toBe(true);

    running = false;
    await vi.advanceTimersByTimeAsync(3500);
    await flushPromises();

    expect(calendarButton().disabled).toBe(false);
    expect(emailButton(wrapper).disabled).toBe(false);
    vi.useRealTimers();
  });

  it('leaves the email section\'s existing prefill and history behavior unchanged when the calendar section is also present', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchAll({
        emailRuns: [run({ id: 2, endDate: '2026-08-08', status: 'success' }), run({ id: 1, endDate: '2026-08-01', status: 'failure' })],
        calendarRuns: [calendarRun({ id: 1 })],
      }),
    );

    const wrapper = mountPage();
    await flushPromises();

    const [emailStart] = datePickers(wrapper);
    expect(emailStart!.props('value')).toBe(Date.parse('2026-08-08T00:00:00'));

    const emailRows = await screen.findAllByTestId('sync-history-row');
    expect(emailRows).toHaveLength(2);
  });
});

// --- Signature panel (US4) -------------------------------------------------------------------

function mockFetchWithSignature(opts: {
  signature?: string | null;
  putHandler?: (body: unknown) => Promise<{ status: number; body: unknown }>;
} = {}) {
  const { signature = null, putHandler } = opts;
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/email-signature' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ signature }) });
    }
    if (url === '/api/email-signature' && options?.method === 'PUT') {
      const body = JSON.parse(options.body as string);
      if (putHandler) return putHandler(body).then((r) => ({ ok: r.status < 400, status: r.status, json: async () => r.body }));
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    }
    if (url === '/api/email-sync/runs' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
    }
    if (url === '/api/calendar-sync/runs' && (!options || options.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) });
    }
    if (url === '/api/sync/status') {
      return Promise.resolve({ ok: true, json: async () => ({ running: false }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('SyncPage signature panel (US4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the empty state before any signature has been saved', async () => {
    vi.stubGlobal('fetch', mockFetchWithSignature({ signature: null }));

    mountPage();
    await flushPromises();

    const panel = screen.getByTestId('signature-section');
    expect(within(panel).getByText(/no signature saved/i)).toBeTruthy();
  });

  it('entering HTML and saving PUTs the value', async () => {
    let putBody: unknown;
    vi.stubGlobal(
      'fetch',
      mockFetchWithSignature({
        signature: null,
        putHandler: async (body) => {
          putBody = body;
          return { status: 200, body };
        },
      }),
    );

    mountPage();
    await flushPromises();

    const panel = screen.getByTestId('signature-section');
    await fireEvent.update(within(panel).getByRole('textbox'), '<p>Tyler Satre</p><p>Example Corp</p>');
    await fireEvent.click(within(panel).getByRole('button', { name: /save/i }));
    await flushPromises();

    expect(putBody).toEqual({ signature: '<p>Tyler Satre</p><p>Example Corp</p>' });
  });

  it('shows the saved value across a remount (persistence)', async () => {
    vi.stubGlobal('fetch', mockFetchWithSignature({ signature: '<p>Tyler Satre</p>' }));

    mountPage();
    await flushPromises();
    document.body.innerHTML = '';
    mountPage();
    await flushPromises();

    const panel = screen.getByTestId('signature-section');
    expect((within(panel).getByRole('textbox') as HTMLTextAreaElement).value).toBe('<p>Tyler Satre</p>');
  });

  it('shows an error line on a failed save', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWithSignature({
        signature: null,
        putHandler: async () => ({ status: 400, body: { error: { message: 'Invalid signature' } } }),
      }),
    );

    mountPage();
    await flushPromises();

    const panel = screen.getByTestId('signature-section');
    await fireEvent.update(within(panel).getByRole('textbox'), '<p>New</p>');
    await fireEvent.click(within(panel).getByRole('button', { name: /save/i }));
    await flushPromises();

    expect(within(panel).getByText('Invalid signature')).toBeTruthy();
  });
});
