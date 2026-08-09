// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateTaskForm from '../../src/client/components/CreateTaskForm.vue';

async function expandForm(): Promise<void> {
  await fireEvent.click(screen.getByTestId('add-task-toggle'));
  await flushPromises();
}

describe('CreateTaskForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders collapsed behind a "+ Add task" toggle, with no form visible', () => {
    render(CreateTaskForm);

    expect(screen.getByTestId('add-task-toggle')).toBeTruthy();
    expect(screen.queryByTestId('add-task-form')).toBeNull();
  });

  it('expanding the toggle reveals the form with a labeled title input and note textarea', async () => {
    render(CreateTaskForm);

    await expandForm();

    expect(screen.getByTestId('add-task-form')).toBeTruthy();
    expect(screen.getByLabelText(/title/i)).toBeTruthy();
    const noteField = screen.getByLabelText(/note/i) as HTMLTextAreaElement;
    expect(noteField.tagName).toBe('TEXTAREA');
    expect(noteField.hasAttribute('required')).toBe(false);
  });

  it('posts the title and collapses back with cleared fields when a valid title is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emitted } = render(CreateTaskForm);
    await expandForm();

    const input = screen.getByLabelText(/title/i) as HTMLInputElement;
    await fireEvent.update(input, 'Follow up with Sam');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Follow up with Sam' }),
      }),
    );
    expect(emitted().created).toBeTruthy();
  });

  it('includes the note in the request body when filled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Prep board deck', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), 'Prep board deck');
    await fireEvent.update(screen.getByLabelText(/note/i), 'Kickoff call went well');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
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
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), 'Book flights');
    await fireEvent.update(screen.getByLabelText(/note/i), note);
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Book flights' }),
      }),
    );
  });

  it('shows the validation message adjacent to the title input and does not POST when the title is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    const message = await screen.findByRole('alert');
    expect(message.textContent).toMatch(/title is required/i);
    const titleInput = screen.getByLabelText(/title/i);
    expect(titleInput.closest('form')?.contains(message)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the validation message and does not POST when the title is whitespace-only', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), '   ');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(await screen.findByText(/title is required/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancel collapses the form without posting, and reopening starts blank', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), 'Draft that should not be sent');
    await fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('add-task-form')).toBeNull();
    expect(screen.getByTestId('add-task-toggle')).toBeTruthy();

    await expandForm();
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('');
  });
});
