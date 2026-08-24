// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import TaskCard from '../../src/client/components/TaskCard.vue';

const TASK = { id: 1, title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1, archived: false };

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/tasks/:id', component: { template: '<div />' } },
    ],
  });
}

describe('TaskCard', () => {
  it('renders its face markup unchanged', () => {
    const router = makeRouter();
    render(TaskCard, { props: { task: TASK }, global: { plugins: [router] } });

    const card = screen.getByTestId('task-card');
    expect(card.textContent).toBe('Follow up with Sam');
    expect(card.tagName).toBe('LI');
  });

  it('renders draggable="true"', () => {
    const router = makeRouter();
    render(TaskCard, { props: { task: TASK }, global: { plugins: [router] } });

    const card = screen.getByTestId('task-card');
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('dragstart writes the task id to the dataTransfer', async () => {
    const router = makeRouter();
    render(TaskCard, { props: { task: TASK }, global: { plugins: [router] } });

    const card = screen.getByTestId('task-card');
    const setData = vi.fn();
    await fireEvent.dragStart(card, { dataTransfer: { setData } });

    expect(setData).toHaveBeenCalledWith('text/plain', '1');
  });

  it('navigates to /tasks/:id when clicked', async () => {
    const router = makeRouter();
    await router.push('/');
    await router.isReady();
    render(TaskCard, { props: { task: TASK }, global: { plugins: [router] } });

    await fireEvent.click(screen.getByTestId('task-card'));
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/tasks/1');
  });

  describe('archived rendering (027-card-archive)', () => {
    it('renders a dimmed style and an archived-badge when task.archived is true (FR-006)', () => {
      const router = makeRouter();
      render(TaskCard, { props: { task: { ...TASK, archived: true } }, global: { plugins: [router] } });

      const card = screen.getByTestId('task-card');
      expect(screen.getByTestId('archived-badge')).toBeTruthy();
      expect(card.classList.contains('task-card-archived')).toBe(true);
      expect(getComputedStyle(card).opacity).toBe('0.6');
    });

    it('renders neither the dimmed style nor the badge when task.archived is false', () => {
      const router = makeRouter();
      render(TaskCard, { props: { task: { ...TASK, archived: false } }, global: { plugins: [router] } });

      const card = screen.getByTestId('task-card');
      expect(screen.queryByTestId('archived-badge')).toBeNull();
      expect(card.classList.contains('task-card-archived')).toBe(false);
      expect(getComputedStyle(card).opacity).not.toBe('0.6');
    });

    it('adds no archive/unarchive click affordance to the card face — clicking still only navigates (FR-017)', async () => {
      const router = makeRouter();
      await router.push('/');
      await router.isReady();
      render(TaskCard, { props: { task: { ...TASK, archived: true } }, global: { plugins: [router] } });

      await fireEvent.click(screen.getByTestId('task-card'));
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/tasks/1');
    });
  });
});
