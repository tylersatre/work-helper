// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateTaskForm from '../../src/client/components/CreateTaskForm.vue';

async function expandForm(): Promise<void> {
  await fireEvent.click(screen.getByTestId('add-task-toggle'));
  await flushPromises();
}

async function setDueDate(value: string): Promise<void> {
  const picker = screen.getByTestId('create-task-due-date');
  const input = picker.querySelector('input') as HTMLInputElement;
  await fireEvent.update(input, value);
  await flushPromises();
}

function selectOptionElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.n-base-select-option'));
}

async function selectOption(testId: string, label: string): Promise<void> {
  const container = screen.getByTestId(testId);
  const trigger = container.querySelector('.n-base-selection') as HTMLElement;
  await fireEvent.click(trigger);
  await flushPromises();
  const option = selectOptionElements().find((el) => el.textContent === label);
  if (!option) {
    throw new Error(`No option "${label}" found in ${testId}`);
  }
  await fireEvent.click(option);
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

  it('renders labeled due-date, priority, effort, and description inputs, all defaulting to unset', async () => {
    render(CreateTaskForm);

    await expandForm();

    expect(screen.getByTestId('create-task-due-date').querySelector('input')?.value).toBe('');
    expect(screen.getByTestId('create-task-priority')).toBeTruthy();
    expect(screen.getByTestId('create-task-effort')).toBeTruthy();

    const descriptionField = screen.getByTestId('create-task-description').querySelector('textarea') as HTMLTextAreaElement;
    expect(descriptionField.tagName).toBe('TEXTAREA');
    expect(descriptionField.value).toBe('');
  });

  it('the priority and effort selects offer the fixed option lists', async () => {
    render(CreateTaskForm);
    await expandForm();

    await selectOption('create-task-priority', 'Urgent');
    expect(screen.getByTestId('create-task-priority').textContent).toContain('Urgent');

    await selectOption('create-task-effort', 'XL');
    expect(screen.getByTestId('create-task-effort').textContent).toContain('XL');
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

  it('submitting with all four new fields filled sends them all in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Book venue', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), 'Book venue');
    await setDueDate('2026-09-05');
    await selectOption('create-task-priority', 'High');
    await selectOption('create-task-effort', 'L');
    await fireEvent.update(screen.getByTestId('create-task-description').querySelector('textarea')!, '**Urgent**');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Book venue', dueDate: '2026-09-05', priority: 'High', effort: 'L', description: '**Urgent**' }),
      }),
    );
  });

  it('submitting with all four new fields left blank omits them entirely from the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Book venue', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), 'Book venue');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Book venue' }),
      }),
    );
  });

  it('on a successful submit, reset() clears all six inputs including the four new ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, title: 'Book venue', lane: 'To Do', createdAt: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(CreateTaskForm);
    await expandForm();

    await fireEvent.update(screen.getByLabelText(/title/i), 'Book venue');
    await setDueDate('2026-09-05');
    await selectOption('create-task-priority', 'High');
    await fireEvent.update(screen.getByTestId('create-task-description').querySelector('textarea')!, 'Details');
    await fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await flushPromises();

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('create-task-due-date').querySelector('input')?.value).toBe('');
    expect(screen.getByTestId('create-task-description').querySelector('textarea')?.value).toBe('');
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
