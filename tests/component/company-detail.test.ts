// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import CompanyDetailPage from '../../src/client/pages/CompanyDetailPage.vue';

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/companies', component: { template: '<div>companies</div>' } },
      { path: '/companies/:id', component: CompanyDetailPage },
    ],
  });
  router.push(initialPath);
  return router;
}

async function renderAt(path: string) {
  const router = makeRouter(path);
  await router.isReady();
  render(CompanyDetailPage, { global: { plugins: [router] } });
  await flushPromises();
  return router;
}

function emptyDetail(id = 1, name = 'Acme Inc') {
  return { id, name, people: [], cards: [], tags: [] };
}

describe('CompanyDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the company name and styled empty-state messages for people, cards, and tags sections', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => emptyDetail() }));

    await renderAt('/companies/1');

    expect(await screen.findByText('Acme Inc')).toBeTruthy();
    expect(screen.getByTestId('company-people-empty')).toBeTruthy();
    expect(screen.getByTestId('company-cards-empty')).toBeTruthy();
    expect(screen.getByTestId('company-tags-empty')).toBeTruthy();
  });

  it('a rename flow updates the displayed name and surfaces validation messages', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/companies/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => emptyDetail() });
      }
      if (url === '/api/companies/1' && options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string) as { name: string };
        if (!body.name.trim()) {
          return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: { message: 'A name is required' } }) });
        }
        if (body.name === 'Taken Co') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ error: { message: 'That company name is already in use' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, name: body.name }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderAt('/companies/1');
    expect(await screen.findByText('Acme Inc')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    await flushPromises();
    const input = screen.getByRole('textbox', { name: /rename/i });

    await fireEvent.update(input, '');
    await fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await flushPromises();
    expect(await screen.findByText('A name is required')).toBeTruthy();

    await fireEvent.update(input, 'Taken Co');
    await fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await flushPromises();
    expect(await screen.findByText('That company name is already in use')).toBeTruthy();

    await fireEvent.update(input, 'Acme Corp');
    await fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await flushPromises();
    expect(await screen.findByText('Acme Corp')).toBeTruthy();
  });

  it('a populated people section renders the assigned people ordered by last name, replacing the empty state (018-companies US2)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'Acme Inc',
          people: [
            { id: 1, firstName: 'ana', lastName: 'alvarez' },
            { id: 2, firstName: 'Sam', lastName: 'Rivera' },
          ],
          cards: [],
          tags: [],
        }),
      }),
    );

    await renderAt('/companies/1');

    expect(screen.queryByTestId('company-people-empty')).toBeNull();
    const rows = await screen.findAllByTestId('company-person-row');
    expect(rows.map((row) => row.textContent?.trim())).toEqual(['ana alvarez', 'Sam Rivera']);
  });

  it('a populated cards section renders the linked cards ordered by title, replacing the empty state (018-companies US3)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          name: 'Acme Inc',
          people: [],
          cards: [
            { id: 1, title: 'alpha rollout', lane: 'To Do' },
            { id: 2, title: 'Zephyr onboarding', lane: 'Waiting' },
          ],
          tags: [],
        }),
      }),
    );

    await renderAt('/companies/1');

    expect(screen.queryByTestId('company-cards-empty')).toBeNull();
    const rows = await screen.findAllByTestId('company-card-row');
    expect(rows.map((row) => row.textContent?.trim())).toEqual(['alpha rollout', 'Zephyr onboarding']);
  });

  it('the tags section hosts TagInput: a selected suggestion appears as a chip, and a chip can be detached (018-companies US5)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/companies/1' && !options) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, name: 'Acme Inc', people: [], cards: [], tags: [] }) });
      }
      if (url === '/api/tags' && !options) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'VIP', color: '#3B82F6' }] });
      }
      if (url === '/api/companies/1/tags' && options?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ tags: [{ id: 1, name: 'VIP', color: '#3B82F6' }] }) });
      }
      if (url === '/api/companies/1/tags/1' && options?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ tags: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderAt('/companies/1');
    expect(await screen.findByTestId('company-tags-empty')).toBeTruthy();

    await fireEvent.update(screen.getByRole('textbox', { name: /add tag/i }), 'VIP');
    await flushPromises();
    await fireEvent.click(screen.getByTestId('tag-suggestion'));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/companies/1/tags', expect.objectContaining({ method: 'POST', body: JSON.stringify({ tagId: 1 }) }));
    const chips = await screen.findAllByTestId('tag-chip');
    expect(chips.map((chip) => chip.textContent?.trim().replace(/\s*×$/, ''))).toEqual(['VIP']);

    await fireEvent.click(screen.getByRole('button', { name: /remove vip/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/companies/1/tags/1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryAllByTestId('tag-chip')).toHaveLength(0);
  });

  describe('load-more pagination (018-companies US4)', () => {
    function detailWith(peopleCount: number, cardsCount: number) {
      return {
        id: 1,
        name: 'Acme Inc',
        people: Array.from({ length: peopleCount }, (_, i) => ({ id: i + 1, firstName: 'Person', lastName: String(i + 1).padStart(2, '0') })),
        cards: Array.from({ length: cardsCount }, (_, i) => ({ id: i + 1, title: `Card ${String(i + 1).padStart(2, '0')}`, lane: 'To Do' })),
        tags: [],
      };
    }

    it('shows the first 25 of 30 people and 30 cards, each with its own load-more control that independently reveals the rest', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => detailWith(30, 30) }));

      await renderAt('/companies/1');

      expect((await screen.findAllByTestId('company-person-row'))).toHaveLength(25);
      expect(screen.getAllByTestId('company-card-row')).toHaveLength(25);

      const [peopleLoadMore, cardsLoadMore] = screen.getAllByRole('button', { name: /show all/i });
      await fireEvent.click(peopleLoadMore!);
      await flushPromises();

      expect(screen.getAllByTestId('company-person-row')).toHaveLength(30);
      expect(screen.getAllByTestId('company-card-row')).toHaveLength(25);

      await fireEvent.click(cardsLoadMore!);
      await flushPromises();

      expect(screen.getAllByTestId('company-card-row')).toHaveLength(30);
    });

    it('shows everything with no load-more control when a section has 25 or fewer entries', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => detailWith(25, 3) }));

      await renderAt('/companies/1');

      expect((await screen.findAllByTestId('company-person-row'))).toHaveLength(25);
      expect(screen.getAllByTestId('company-card-row')).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
    });
  });
});
