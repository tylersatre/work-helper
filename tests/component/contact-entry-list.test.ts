// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContactEntryList from '../../src/client/components/ContactEntryList.vue';

function entry(id: number, value: string, isPrimary: boolean) {
  return { id, value, isPrimary, createdAt: id };
}

describe('ContactEntryList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders each entry value with a primary marker on the primary entry', () => {
    render(ContactEntryList, {
      props: {
        heading: 'Emails',
        emptyStateText: 'No email addresses yet.',
        apiBase: '/api/people/1/emails',
        entries: [entry(1, 'sam.rivera@example.com', true), entry(2, 'sam.personal@example.com', false)],
      },
    });

    const rows = screen.getAllByTestId('contact-entry-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/sam\.rivera@example\.com/)).toBeTruthy();
    expect(within(rows[0]!).getByTestId('primary-marker')).toBeTruthy();
    expect(within(rows[1]!).queryByTestId('primary-marker')).toBeNull();
  });

  it('shows the empty-state text when there are no entries', () => {
    render(ContactEntryList, {
      props: { heading: 'Emails', emptyStateText: 'No email addresses yet.', apiBase: '/api/people/1/emails', entries: [] },
    });

    expect(screen.getByText('No email addresses yet.')).toBeTruthy();
  });

  it('adding an entry POSTs to the api base and re-renders from the returned entries list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ entries: [entry(1, 'sam.rivera@example.com', true)] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emitted } = render(ContactEntryList, {
      props: { heading: 'Emails', emptyStateText: 'No email addresses yet.', apiBase: '/api/people/1/emails', entries: [] },
    });

    await fireEvent.update(screen.getByLabelText(/add email/i), 'sam.rivera@example.com');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/people/1/emails',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ value: 'sam.rivera@example.com' }) }),
    );
    expect(emitted()['update:entries']?.[0]).toEqual([[entry(1, 'sam.rivera@example.com', true)]]);
    expect(screen.getAllByTestId('contact-entry-row')).toHaveLength(1);
  });

  it('editing an entry PATCHes the entry and re-renders from the returned entries list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [entry(1, 'sam.p@example.com', true)] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ContactEntryList, {
      props: {
        heading: 'Emails',
        emptyStateText: 'No email addresses yet.',
        apiBase: '/api/people/1/emails',
        entries: [entry(1, 'sam.rivera@example.com', true)],
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    await fireEvent.update(screen.getByDisplayValue('sam.rivera@example.com'), 'sam.p@example.com');
    await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/people/1/emails/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ value: 'sam.p@example.com' }) }),
    );
    expect(await screen.findByText(/sam\.p@example\.com/)).toBeTruthy();
  });

  it('marking an entry primary PUTs to the primary sub-path and re-renders from the returned entries list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [entry(1, 'sam.rivera@example.com', false), entry(2, 'sam.personal@example.com', true)] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ContactEntryList, {
      props: {
        heading: 'Emails',
        emptyStateText: 'No email addresses yet.',
        apiBase: '/api/people/1/emails',
        entries: [entry(1, 'sam.rivera@example.com', true), entry(2, 'sam.personal@example.com', false)],
      },
    });

    const rows = screen.getAllByTestId('contact-entry-row');
    await fireEvent.click(within(rows[1]!).getByRole('button', { name: /make primary/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/people/1/emails/2/primary', expect.objectContaining({ method: 'PUT' }));
    const updatedRows = screen.getAllByTestId('contact-entry-row');
    expect(within(updatedRows[1]!).getByTestId('primary-marker')).toBeTruthy();
  });

  it('removing an entry DELETEs it and re-renders from the returned entries list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ContactEntryList, {
      props: {
        heading: 'Emails',
        emptyStateText: 'No email addresses yet.',
        apiBase: '/api/people/1/emails',
        entries: [entry(1, 'sam.rivera@example.com', true)],
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/people/1/emails/1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryAllByTestId('contact-entry-row')).toHaveLength(0);
    expect(screen.getByText('No email addresses yet.')).toBeTruthy();
  });

  it('shows the server validation message from a failed action', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'A value is required' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ContactEntryList, {
      props: { heading: 'Emails', emptyStateText: 'No email addresses yet.', apiBase: '/api/people/1/emails', entries: [] },
    });

    await fireEvent.update(screen.getByLabelText(/add email/i), '   ');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(await screen.findByText(/a value is required/i)).toBeTruthy();
  });
});
