// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateTaskForm from '../../src/client/components/CreateTaskForm.vue';

describe('CreateTaskForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the title and clears the input when a valid title is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);

    const input = screen.getByLabelText(/title/i) as HTMLInputElement;
    await fireEvent.update(input, 'Follow up with Sam');
    await fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Follow up with Sam' }),
      }),
    );
    expect(input.value).toBe('');
  });

  it('shows a validation message and does not POST when the title is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);

    await fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    await flushPromises();

    expect(await screen.findByText(/title is required/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a validation message and does not POST when the title is whitespace-only', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);

    const input = screen.getByLabelText(/title/i) as HTMLInputElement;
    await fireEvent.update(input, '   ');
    await fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    await flushPromises();

    expect(await screen.findByText(/title is required/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an optional multiline note field', () => {
    render(CreateTaskForm);

    const noteField = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    expect(noteField.tagName).toBe('TEXTAREA');
    expect(noteField.hasAttribute('required')).toBe(false);
  });

  it('includes the note in the request body when filled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Prep board deck', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);

    await fireEvent.update(screen.getByLabelText(/title/i), 'Prep board deck');
    await fireEvent.update(screen.getByLabelText(/note/i), 'Kickoff call went well');
    await fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Prep board deck', note: 'Kickoff call went well' }),
      }),
    );
  });

  it.each(['', '   '])('omits the note from the request body when it is blank or whitespace-only (%j)', async (note) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Book flights', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);

    await fireEvent.update(screen.getByLabelText(/title/i), 'Book flights');
    await fireEvent.update(screen.getByLabelText(/note/i), note);
    await fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Book flights' }),
      }),
    );
  });
});
