// @vitest-environment jsdom
import { render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import PersonDetailPage from '../../src/client/pages/PersonDetailPage.vue';

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/people/:id', component: PersonDetailPage }],
  });
  router.push(initialPath);
  return router;
}

describe('PersonDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the person's primary email and phone values and renders the edit form without contact inputs", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [{ id: 1, value: 'sam.rivera@example.com', isPrimary: true, createdAt: 1 }],
          phones: [{ id: 2, value: '555-0100', isPrimary: true, createdAt: 1 }],
          extraFields: {},
          createdAt: 1,
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Sam Rivera')).toBeTruthy();
    expect(screen.getByText(/sam\.rivera@example\.com/)).toBeTruthy();
    expect(screen.getByText(/555-0100/)).toBeTruthy();
    expect(screen.queryByLabelText('Email', { exact: true })).toBeNull();
    expect(screen.queryByLabelText('Phone', { exact: true })).toBeNull();
  });

  it("mounts a ContactEntryList for the person's emails", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [
            { id: 1, value: 'sam.rivera@example.com', isPrimary: true, createdAt: 1 },
            { id: 2, value: 'sam.personal@example.com', isPrimary: false, createdAt: 2 },
          ],
          phones: [],
          extraFields: {},
          createdAt: 1,
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const rows = await screen.findAllByTestId('contact-entry-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('sam.rivera@example.com');
    expect(rows[1]?.textContent).toContain('sam.personal@example.com');
  });

  it("mounts a second ContactEntryList for the person's phones", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Sam',
          lastName: 'Rivera',
          emails: [],
          phones: [
            { id: 1, value: '555-0100', isPrimary: true, createdAt: 1 },
            { id: 2, value: '555-0199', isPrimary: false, createdAt: 2 },
          ],
          extraFields: {},
          createdAt: 1,
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    const rows = await screen.findAllByTestId('contact-entry-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('555-0100');
    expect(rows[1]?.textContent).toContain('555-0199');
  });

  it('renders without error when the person has no email or phone entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          firstName: 'Cy',
          lastName: 'Cole',
          emails: [],
          phones: [],
          extraFields: {},
          createdAt: 1,
        }),
      }),
    );

    const router = makeRouter('/people/1');
    await router.isReady();
    render(PersonDetailPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(await screen.findByText('Cy Cole')).toBeTruthy();
  });
});
