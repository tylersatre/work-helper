// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import PersonDetailPage from '../../src/client/pages/PersonDetailPage.vue';

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/people/:id', component: PersonDetailPage }],
  });
  router.push(initialPath);
  return router;
}

describe('PersonDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the person's primary email and phone values and renders the edit form without contact inputs", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [{ id: 1, value: 'sam.rivera@example.com', isPrimary: true, createdAt: 1 }],
          phones: [{ id: 2, value: '555-0100', isPrimary: true, createdAt: 1 }],
          extraFields: {},
          createdAt: 1,
          tags: [],
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Sam Rivera')).toBeTruthy();
    expect(screen.getByText(/sam\.rivera@example\.com/)).toBeTruthy();
    expect(screen.getByText(/555-0100/)).toBeTruthy();
    expect(screen.queryByLabelText('Email', { exact: true })).toBeNull();
    expect(screen.queryByLabelText('Phone', { exact: true })).toBeNull();
  });

  it("mounts a ContactEntryList for the person's emails", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [
            { id: 1, value: 'sam.rivera@example.com', isPrimary: true, createdAt: 1 },
            { id: 2, value: 'sam.personal@example.com', isPrimary: false, createdAt: 2 },
          ],
          phones: [],
          extraFields: {},
          createdAt: 1,
          tags: [],
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const rows = await screen.findAllByTestId('contact-entry-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('sam.rivera@example.com');
    expect(rows[1]?.textContent).toContain('sam.personal@example.com');
  });

  it("mounts a second ContactEntryList for the person's phones", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [],
          phones: [
            { id: 1, value: '555-0100', isPrimary: true, createdAt: 1 },
            { id: 2, value: '555-0199', isPrimary: false, createdAt: 2 },
          ],
          extraFields: {},
          createdAt: 1,
          tags: [],
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const rows = await screen.findAllByTestId('contact-entry-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('555-0100');
    expect(rows[1]?.textContent).toContain('555-0199');
  });

  it('renders without error when the person has no email or phone entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Cy',
          lastName: 'Cole',
          emails: [],
          phones: [],
          extraFields: {},
          createdAt: 1,
          tags: [],
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Cy Cole')).toBeTruthy();
  });

  it("renders chips for the person's tags", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [],
          phones: [],
          extraFields: {},
          createdAt: 1,
          tags: [
            { id: 1, name: 'Q3', color: '#22C55E' },
            { id: 2, name: 'VIP', color: '#3B82F6' },
          ],
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const chips = await screen.findAllByTestId('tag-chip');
    expect(chips.map((chip) => chip.textContent?.trim().replace(/\s*×$/, ''))).toEqual(['Q3', 'VIP']);
  });

  it('removing a chip calls DELETE /api/people/:id/tags/:tagId and updates the list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/people/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [{ id: 1, name: 'VIP', color: '#3B82F6' }],
          }),
        });
      }
      if (url === '/api/people/1/tags/1' && options?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ tags: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.click(await screen.findByRole('button', { name: /remove vip/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/people/1/tags/1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryAllByTestId('tag-chip')).toHaveLength(0);
  });

  it('the TagInput attaches via POST /api/people/:id/tags', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/people/1' && !options) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [],
          }),
        });
      }
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/api/people/1/tags' && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ tags: [{ id: 5, name: 'Roadmap', color: '#EAB308' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    await fireEvent.update(screen.getByRole('textbox', { name: /add tag/i }), 'Roadmap');
    await flushPromises();
    await fireEvent.click(screen.getByTestId('tag-create-option'));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/people/1/tags',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Roadmap' }) }),
    );
    expect(await screen.findByText('Roadmap')).toBeTruthy();
  });

  it('mounts the email section between Phones and Tags (FR-015)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/people/1') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [],
          }),
        });
      }
      if (url === '/api/people/1/email-conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            conversations: [{ conversationId: 9, subject: 'Quote attached', latestMessageAt: 1, addresses: [{ address: 'sam.rivera@example.com', roles: ['from'] }] }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const sections = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const phonesIndex = sections.indexOf('Phones');
    const emailIndex = sections.indexOf('Email');
    const tagsIndex = sections.indexOf('Tags');
    expect(phonesIndex).toBeGreaterThanOrEqual(0);
    expect(emailIndex).toBeGreaterThan(phonesIndex);
    expect(tagsIndex).toBeGreaterThan(emailIndex);

    expect(await screen.findByTestId('person-email-row')).toBeTruthy();
  });
});
