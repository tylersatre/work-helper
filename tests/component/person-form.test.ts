// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonForm from '../../src/client/components/PersonForm.vue';

function stubFieldsConfig(fields: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fields }) }),
  );
}

describe('PersonForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('create mode', () => {
    it('renders the single email and phone inputs', async () => {
      stubFieldsConfig([]);
      render(PersonForm, { props: { mode: 'create', submitLabel: 'Add person' } });
      await flushPromises();

      expect(screen.getByLabelText(/^email/i)).toBeTruthy();
      expect(screen.getByLabelText(/phone/i)).toBeTruthy();
    });

    it('renders one optional free-text input per configured extra field', async () => {
      stubFieldsConfig(['Nickname']);
      render(PersonForm, { props: { mode: 'create', submitLabel: 'Add person' } });
      await flushPromises();

      expect(screen.getByLabelText(/nickname/i)).toBeTruthy();
    });

    it('includes a filled-in extra field value in the submitted payload', async () => {
      stubFieldsConfig(['Nickname']);
      const { emitted } = render(PersonForm, { props: { mode: 'create', submitLabel: 'Add person' } });
      await flushPromises();

      await fireEvent.update(screen.getByLabelText(/first name/i), 'Sam');
      await fireEvent.update(screen.getByLabelText(/last name/i), 'Rivera');
      await fireEvent.update(screen.getByLabelText(/nickname/i), 'Sammy');
      await fireEvent.click(screen.getByRole('button', { name: /add person/i }));

      expect(emitted().submit[0]).toEqual([
        { firstName: 'Sam', lastName: 'Rivera', email: '', phone: '', extraFields: { Nickname: 'Sammy' } },
      ]);
    });

    it('submits successfully when a configured extra field is left blank', async () => {
      stubFieldsConfig(['Nickname']);
      const { emitted } = render(PersonForm, { props: { mode: 'create', submitLabel: 'Add person' } });
      await flushPromises();

      await fireEvent.update(screen.getByLabelText(/first name/i), 'Sam');
      await fireEvent.update(screen.getByLabelText(/last name/i), 'Rivera');
      await fireEvent.click(screen.getByRole('button', { name: /add person/i }));

      expect(emitted().submit).toBeTruthy();
      expect(emitted().submit[0]).toEqual([
        { firstName: 'Sam', lastName: 'Rivera', email: '', phone: '', extraFields: { Nickname: '' } },
      ]);
    });

    it('shows a rejection message while retaining the displayed values', async () => {
      stubFieldsConfig([]);
      render(PersonForm, {
        props: {
          mode: 'create',
          errorMessage: 'That email is already in use',
          submitLabel: 'Add person',
        },
      });
      await flushPromises();

      await fireEvent.update(screen.getByLabelText(/first name/i), 'Ana');
      await fireEvent.update(screen.getByLabelText(/^email/i), 'ana.alvarez@example.com');

      expect(screen.getByText(/that email is already in use/i)).toBeTruthy();
      expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Ana');
      expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('ana.alvarez@example.com');
    });

    it('surfaces a phone-conflict rejection message from a 409 response, without submitting again', async () => {
      stubFieldsConfig([]);
      const { emitted } = render(PersonForm, {
        props: {
          mode: 'create',
          errorMessage: 'That phone number is already in use',
          submitLabel: 'Add person',
        },
      });
      await flushPromises();

      expect(screen.getByText(/that phone number is already in use/i)).toBeTruthy();
      expect(emitted().submit).toBeFalsy();
    });
  });

  describe('edit mode', () => {
    it('renders pre-filled existing name and extra fields but no email or phone inputs', async () => {
      stubFieldsConfig(['Nickname']);
      render(PersonForm, {
        props: {
          mode: 'edit',
          initialValues: { firstName: 'Sam', lastName: 'Rivera', extraFields: { Nickname: 'Sammy' } },
          submitLabel: 'Save changes',
        },
      });
      await flushPromises();

      expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Sam');
      expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Rivera');
      expect((screen.getByLabelText(/nickname/i) as HTMLInputElement).value).toBe('Sammy');
      expect(screen.queryByLabelText(/^email/i)).toBeNull();
      expect(screen.queryByLabelText(/phone/i)).toBeNull();
    });

    it('emits names and extraFields only on save, without email or phone keys', async () => {
      stubFieldsConfig([]);
      const { emitted } = render(PersonForm, {
        props: {
          mode: 'edit',
          initialValues: { firstName: 'Sam', lastName: 'Rivera' },
          submitLabel: 'Save changes',
        },
      });
      await flushPromises();

      await fireEvent.update(screen.getByLabelText(/first name/i), 'Samuel');
      await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      expect(emitted().submit).toBeTruthy();
      expect(emitted().submit[0]).toEqual([{ firstName: 'Samuel', lastName: 'Rivera' }]);
    });

    it('shows the rejection message while retaining the displayed values', async () => {
      stubFieldsConfig([]);
      render(PersonForm, {
        props: {
          mode: 'edit',
          initialValues: { firstName: 'Ana', lastName: 'Alvarez' },
          errorMessage: 'First and last name are required',
          submitLabel: 'Save changes',
        },
      });
      await flushPromises();

      expect(screen.getByText(/first and last name are required/i)).toBeTruthy();
      expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Ana');
    });

    describe('company field (018-companies US2)', () => {
      function stubWithCompanySearch(): ReturnType<typeof vi.fn> {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (url === '/api/person-fields') {
            return Promise.resolve({ ok: true, json: async () => ({ fields: [] }) });
          }
          if (url === '/api/companies?q=acm') {
            return Promise.resolve({ ok: true, json: async () => [{ id: 1, name: 'Acme Corp' }] });
          }
          if (url === '/api/companies?q=glo') {
            return Promise.resolve({ ok: true, json: async () => [{ id: 2, name: 'Globex' }] });
          }
          return Promise.resolve({ ok: true, json: async () => [] });
        });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
      }

      async function waitForDebounce(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 350));
        await flushPromises();
      }

      it('searches existing companies by substring with no create option, and lets the user select, switch, and clear', async () => {
        const fetchMock = stubWithCompanySearch();
        render(PersonForm, {
          props: { mode: 'edit', initialValues: { firstName: 'Sam', lastName: 'Rivera', company: null }, submitLabel: 'Save changes' },
        });
        await flushPromises();

        await fireEvent.update(screen.getByLabelText(/company/i), 'acm');
        await waitForDebounce();
        expect(fetchMock).toHaveBeenCalledWith('/api/companies?q=acm');

        expect(screen.queryByText(/create/i)).toBeNull();
        await fireEvent.click(await screen.findByRole('button', { name: 'Acme Corp' }));
        await flushPromises();
        expect(screen.getByText('Acme Corp')).toBeTruthy();

        await fireEvent.update(screen.getByLabelText(/company/i), 'glo');
        await waitForDebounce();
        await fireEvent.click(await screen.findByRole('button', { name: 'Globex' }));
        await flushPromises();
        expect(screen.getByText('Globex')).toBeTruthy();
        expect(screen.queryByText('Acme Corp')).toBeNull();

        await fireEvent.click(screen.getByRole('button', { name: /clear/i }));
        await flushPromises();
        expect(screen.queryByText('Globex')).toBeNull();
      });

      it('includes the selected companyId in the submitted payload, and null after clearing', async () => {
        stubWithCompanySearch();
        const { emitted } = render(PersonForm, {
          props: { mode: 'edit', initialValues: { firstName: 'Sam', lastName: 'Rivera', company: null }, submitLabel: 'Save changes' },
        });
        await flushPromises();

        await fireEvent.update(screen.getByLabelText(/company/i), 'acm');
        await waitForDebounce();
        await fireEvent.click(await screen.findByRole('button', { name: 'Acme Corp' }));
        await flushPromises();

        await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        expect(emitted().submit[0]).toEqual([{ firstName: 'Sam', lastName: 'Rivera', companyId: 1 }]);

        await fireEvent.click(screen.getByRole('button', { name: /clear/i }));
        await flushPromises();
        await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        expect(emitted().submit[1]).toEqual([{ firstName: 'Sam', lastName: 'Rivera', companyId: null }]);
      });

      it('omits companyId entirely when the field is never touched', async () => {
        stubWithCompanySearch();
        const { emitted } = render(PersonForm, {
          props: { mode: 'edit', initialValues: { firstName: 'Sam', lastName: 'Rivera', company: { id: 1, name: 'Acme Corp' } }, submitLabel: 'Save changes' },
        });
        await flushPromises();

        await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        expect(emitted().submit[0]).toEqual([{ firstName: 'Sam', lastName: 'Rivera' }]);
      });
    });
  });
});
