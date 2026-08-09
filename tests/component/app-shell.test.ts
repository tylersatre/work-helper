// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '../../src/client/App.vue';

async function renderAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>board</div>' } },
      { path: '/people', component: { template: '<div>people</div>' } },
      { path: '/people/:id', component: { template: '<div>person</div>' } },
      { path: '/tasks/:id', component: { template: '<div>task</div>' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  render(App, { global: { plugins: [router] } });
  await flushPromises();
  return router;
}

describe('App shell', () => {
  it('renders app-nav with the app name and Board/People links', async () => {
    await renderAt('/');

    const nav = screen.getByTestId('app-nav');
    expect(nav.textContent).toContain('work-helper');
    expect(within(nav).getByRole('link', { name: 'Board' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'People' })).toBeTruthy();
  });

  it('marks Board active on /', async () => {
    await renderAt('/');

    const nav = screen.getByTestId('app-nav');
    expect(within(nav).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks People active on /people', async () => {
    await renderAt('/people');

    const nav = screen.getByTestId('app-nav');
    expect(within(nav).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps Board active on a task detail route (/tasks/1)', async () => {
    await renderAt('/tasks/1');

    const nav = screen.getByTestId('app-nav');
    expect(within(nav).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps People active on a person detail route (/people/2)', async () => {
    await renderAt('/people/2');

    const nav = screen.getByTestId('app-nav');
    expect(within(nav).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBeNull();
  });

  it('clicking the inactive link navigates and moves the active marking', async () => {
    const router = await renderAt('/');

    const nav = screen.getByTestId('app-nav');
    await fireEvent.click(within(nav).getByRole('link', { name: 'People' }));
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/people');
    expect(within(nav).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBeNull();
  });
});
