// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import TaskCard from '../../src/client/components/TaskCard.vue';

const TASK = { id: 1, title: 'Follow up with Sam', lane: 'To Do', createdAt: 1 };

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
