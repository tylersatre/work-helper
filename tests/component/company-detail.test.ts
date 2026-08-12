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
});
