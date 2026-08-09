// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import TaskCard from '../../src/client/components/TaskCard.vue';

const TASK = { id: 1, title: 'Follow up with Sam', lane: 'To Do', position: 0, createdAt: 1 };

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
});
