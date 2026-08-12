// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PeoplePage from '../../src/client/pages/PeoplePage.vue';

function entry(id: number, value: string, isPrimary = true) {
  return { id, value, isPrimary, createdAt: id };
}

describe('PeoplePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders people rows with name, primary email, and primary phone in given order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1,
            firstName: 'Ana',
            lastName: 'Alvarez',
            emails: [entry(1, 'ana.alvarez@example.com')],
            phones: [entry(2, '555-0100')],
            extraFields: {},
            createdAt: 1,
            tags: [],
          },
          {
            id: 2,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [entry(3, 'sam.rivera@example.com')],
            phones: [entry(4, '555-0200')],
            extraFields: {},
            createdAt: 2,
            tags: [],
          },
        ],
      }),
    );

    render(PeoplePage);

    const rows = await screen.findAllByTestId('person-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Ana');
    expect(rows[0]?.textContent).toContain('Alvarez');
    expect(rows[0]?.textContent).toContain('ana.alvarez@example.com');
    expect(rows[0]?.textContent).toContain('555-0100');
    expect(rows[1]?.textContent).toContain('Sam');
    expect(rows[1]?.textContent).toContain('Rivera');
  });

  it('shows an empty cell for a person with no email or phone entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1,
            firstName: 'Cy',
            lastName: 'Cole',
            emails: [],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [],
          },
        ],
      }),
    );

    render(PeoplePage);

    const row = await screen.findByTestId('person-row');
    expect(row.textContent).toContain('Cy');
    expect(row.textContent).toContain('Cole');
    expect(row.textContent).not.toContain('null');
    expect(row.textContent).not.toContain('undefined');
  });

  it('picks the entry marked primary, not necessarily the first in the array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [entry(1, 'sam.old@example.com', false), entry(2, 'sam.new@example.com', true)],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [],
          },
        ],
      }),
    );

    render(PeoplePage);

    const row = await screen.findByTestId('person-row');
    expect(row.textContent).toContain('sam.new@example.com');
    expect(row.textContent).not.toContain('sam.old@example.com');
  });

  it('submits the four built-in fields when creating a person', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            id: 3,
            firstName: 'Bo',
            lastName: 'Baker',
            emails: [entry(1, 'bo.baker@example.com')],
            phones: [entry(2, '555-0300')],
            extraFields: {},
            createdAt: 3,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(PeoplePage);
    await flushPromises();

    await fireEvent.update(screen.getByLabelText(/first name/i), 'Bo');
    await fireEvent.update(screen.getByLabelText(/last name/i), 'Baker');
    await fireEvent.update(screen.getByLabelText(/^email/i), 'bo.baker@example.com');
    await fireEvent.update(screen.getByLabelText(/phone/i), '555-0300');
    await fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/people',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ firstName: 'Bo', lastName: 'Baker', email: 'bo.baker@example.com', phone: '555-0300' }),
      }),
    );
  });

  it('shows the server 400 validation message and does not add a row', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'First and last name are required' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(PeoplePage);
    await flushPromises();

    await fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    await flushPromises();

    expect(await screen.findByText(/first and last name are required/i)).toBeTruthy();
    expect(screen.queryAllByTestId('person-row')).toHaveLength(0);
  });

  it('shows the server 409 validation message and does not add a row', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: { message: 'That email is already in use' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(PeoplePage);
    await flushPromises();

    await fireEvent.update(screen.getByLabelText(/first name/i), 'Sam2');
    await fireEvent.update(screen.getByLabelText(/last name/i), 'Rivera');
    await fireEvent.update(screen.getByLabelText(/^email/i), 'Sam.Rivera@example.com');
    await fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    await flushPromises();

    expect(await screen.findByText(/that email is already in use/i)).toBeTruthy();
    expect(screen.queryAllByTestId('person-row')).toHaveLength(0);
  });

  it('shows the empty state with no people; creating a person replaces it with the dense list', async () => {
    let peopleList: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const created = {
          id: 3,
          firstName: 'Bo',
          lastName: 'Baker',
          emails: [entry(1, 'bo.baker@example.com')],
          phones: [entry(2, '555-0300')],
          extraFields: {},
          createdAt: 3,
          tags: [],
        };
        peopleList = [created];
        return Promise.resolve({ ok: true, status: 201, json: async () => created });
      }
      return Promise.resolve({ ok: true, json: async () => peopleList });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(PeoplePage);
    await flushPromises();

    expect(screen.getByTestId('people-empty')).toBeTruthy();
    expect(screen.queryByTestId('person-row')).toBeNull();

    await fireEvent.update(screen.getByLabelText(/first name/i), 'Bo');
    await fireEvent.update(screen.getByLabelText(/last name/i), 'Baker');
    await fireEvent.update(screen.getByLabelText(/^email/i), 'bo.baker@example.com');
    await fireEvent.update(screen.getByLabelText(/phone/i), '555-0300');
    await fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    await flushPromises();

    expect(screen.queryByTestId('people-empty')).toBeNull();
    const row = await screen.findByTestId('person-row');
    expect(row.textContent).toContain('Bo');
    expect(row.textContent).toContain('Baker');
    expect(row.textContent).toContain('bo.baker@example.com');
    expect(row.textContent).toContain('555-0300');
  });

  it('removes a person from the rendered list when their delete action is activated', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [
          {
            id: 1,
            firstName: 'Ana',
            lastName: 'Alvarez',
            emails: [entry(1, 'ana.alvarez@example.com')],
            phones: [entry(2, '555-0100')],
            extraFields: {},
            createdAt: 1,
            tags: [],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(PeoplePage);
    const row = await screen.findByTestId('person-row');

    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 }).mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fireEvent.click(within(row).getByRole('button', { name: /delete/i }));
    await flushPromises();

    expect(screen.queryAllByTestId('person-row')).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/people/1', expect.objectContaining({ method: 'DELETE' }));
  });

  it("renders tag chips on each person's row from their tags, with no tag input or remove affordance", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [entry(1, 'sam.rivera@example.com')],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [
              { id: 1, name: 'Q3', color: '#22C55E' },
              { id: 2, name: 'VIP', color: '#3B82F6' },
            ],
          },
        ],
      }),
    );

    render(PeoplePage);

    const row = await screen.findByTestId('person-row');
    const chips = within(row).getAllByTestId('tag-chip');
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['Q3', 'VIP']);
    expect(within(row).queryByRole('textbox')).toBeNull();
    expect(within(row).queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('lays out tag chips in a wrapper inside the tags cell, so the td itself stays a table cell (flex on a td breaks row alignment)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1,
            firstName: 'Sam',
            lastName: 'Rivera',
            emails: [entry(1, 'sam.rivera@example.com')],
            phones: [],
            extraFields: {},
            createdAt: 1,
            tags: [{ id: 1, name: 'Q3', color: '#22C55E' }],
          },
        ],
      }),
    );

    render(PeoplePage);

    const row = await screen.findByTestId('person-row');
    const chipWrapper = row.querySelector('td > .people-table-tag-chips');
    expect(chipWrapper).toBeTruthy();
    expect(within(chipWrapper as HTMLElement).getAllByTestId('tag-chip')).toHaveLength(1);

    const table = row.closest('table');
    expect(table?.classList.contains('wh-table')).toBe(true);
    expect(table?.parentElement?.classList.contains('wh-table-card')).toBe(true);
  });
});
