// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LinkedCompanies from '../../src/client/components/LinkedCompanies.vue';

async function waitForDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
}

describe('LinkedCompanies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('search suggests existing companies by substring, excludes companies already linked, and offers no create option', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/companies?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, name: 'Acme Corp' },
            { id: 2, name: 'Globex' },
          ],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(LinkedCompanies, { props: { taskId: 1, companies: [{ id: 2, name: 'Globex' }] } });

    await fireEvent.update(screen.getByRole('textbox', { name: /search companies/i }), 'a');
    await waitForDebounce();

    const results = await screen.findAllByTestId('company-search-result');
    expect(results).toHaveLength(1);
    expect(results[0]!.textContent).toContain('Acme Corp');
    expect(results[0]!.textContent).not.toContain('Globex');
    expect(screen.queryByText(/create/i)).toBeNull();
  });

  it('adding a company via a search result links it and shows it on the card', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/companies?q=')) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Acme Corp' }] });
      }
      if (url === '/api/tasks/1/companies' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [{ id: 1, name: 'Acme Corp' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emitted } = render(LinkedCompanies, { props: { taskId: 1, companies: [] } });

    await fireEvent.update(screen.getByRole('textbox', { name: /search companies/i }), 'acm');
    await waitForDebounce();

    const result = await screen.findByTestId('company-search-result');
    await fireEvent.click(within(result).getByRole('button', { name: 'Link' }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/1/companies',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ companyId: 1 }) }),
    );
    expect(emitted()['update:companies']?.[0]).toEqual([[{ id: 1, name: 'Acme Corp' }]]);
  });

  it('a remove control unlinks a linked company', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/tasks/1/companies/1' && options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1, people: [], notes: [], tags: [], companies: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emitted } = render(LinkedCompanies, { props: { taskId: 1, companies: [{ id: 1, name: 'Acme Corp' }] } });

    const linked = screen.getByTestId('linked-company');
    await fireEvent.click(within(linked).getByRole('button', { name: 'Remove' }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/1/companies/1', expect.objectContaining({ method: 'DELETE' }));
    expect(emitted()['update:companies']?.[0]).toEqual([[]]);
  });
});
