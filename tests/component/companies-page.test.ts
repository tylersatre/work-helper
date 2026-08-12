// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompaniesPage from '../../src/client/pages/CompaniesPage.vue';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/companies', component: CompaniesPage },
      { path: '/companies/:id', component: { template: '<div>company</div>' } },
    ],
  });
}

async function renderPage() {
  const router = makeRouter();
  router.push('/companies');
  await router.isReady();
  render(CompaniesPage, { global: { plugins: [router] } });
  await flushPromises();
  return router;
}

describe('CompaniesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a styled empty state when no companies exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await renderPage();

    expect(await screen.findByTestId('companies-empty')).toBeTruthy();
  });

  it('lists companies alphabetically as provided by the server, each linking to its detail page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 1, name: 'Acme Inc' },
          { id: 2, name: 'Zephyr Co' },
        ],
      }),
    );

    await renderPage();

    const rows = await screen.findAllByTestId('company-row');
    expect(rows.map((row) => row.textContent?.trim())).toEqual(['Acme Inc', 'Zephyr Co']);
    expect(rows[0]!.querySelector('a')?.getAttribute('href')).toBe('/companies/1');
  });

  it('the create form appends the new company to the list on success', async () => {
    let currentCompanies: { id: number; name: string }[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/companies' && options?.method === 'POST') {
        const body = JSON.parse(options.body as string) as { name: string };
        const created = { id: 9, name: body.name };
        currentCompanies = [created];
        return Promise.resolve({ ok: true, status: 201, json: async () => created });
      }
      return Promise.resolve({ ok: true, json: async () => currentCompanies });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderPage();
    expect(await screen.findByTestId('companies-empty')).toBeTruthy();

    await fireEvent.update(screen.getByLabelText(/name/i), 'Acme Inc');
    await fireEvent.click(screen.getByRole('button', { name: /create company/i }));
    await flushPromises();

    const rows = await screen.findAllByTestId('company-row');
    expect(rows.map((row) => row.textContent?.trim())).toEqual(['Acme Inc']);
  });

  it('shows "A name is required" for a blank submission and "That company name is already in use" for a duplicate', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/companies' && options?.method === 'POST') {
        const body = JSON.parse(options.body as string) as { name: string };
        if (!body.name.trim()) {
          return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: { message: 'A name is required' } }) });
        }
        if (body.name === 'Acme Inc') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ error: { message: 'That company name is already in use' } }),
          });
        }
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 9, name: body.name }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderPage();

    await fireEvent.click(screen.getByRole('button', { name: /create company/i }));
    await flushPromises();
    expect(await screen.findByText('A name is required')).toBeTruthy();

    await fireEvent.update(screen.getByLabelText(/name/i), 'Acme Inc');
    await fireEvent.click(screen.getByRole('button', { name: /create company/i }));
    await flushPromises();
    expect(await screen.findByText('That company name is already in use')).toBeTruthy();
  });
});
