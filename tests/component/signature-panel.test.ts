// @vitest-environment jsdom
import { screen } from '@testing-library/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SignaturePanel from '../../src/client/components/SignaturePanel.vue';

describe('SignaturePanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders the saved signature given a successful load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signature: '<p>Tyler Satre</p>' }) }),
    );

    mount(SignaturePanel, { attachTo: document.body });
    await flushPromises();

    expect(screen.queryByText('No signature saved yet.')).toBeNull();
  });

  it("shows an error and never claims 'No signature saved yet' when the initial load fails (regression)", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    mount(SignaturePanel, { attachTo: document.body });
    await flushPromises();

    expect(screen.getByRole('alert').textContent).toContain('Could not load the saved signature');
    expect(screen.queryByText('No signature saved yet.')).toBeNull();
  });

  it('shows an error and does not report success when saving fails (regression)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (!options || options.method === undefined) {
          return Promise.resolve({ ok: true, json: async () => ({ signature: null }) });
        }
        return Promise.reject(new Error('network error'));
      }),
    );

    const wrapper = mount(SignaturePanel, { attachTo: document.body });
    await flushPromises();

    await wrapper.get('.signature-textarea').setValue('<p>New signature</p>');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(screen.getByRole('alert').textContent).toContain('Could not save the signature');
  });
});
