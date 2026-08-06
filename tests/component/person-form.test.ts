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

  it('renders pre-filled existing values in edit mode', async () => {
    stubFieldsConfig([]);
    render(PersonForm, {
      props: {
        initialValues: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
        submitLabel: 'Save changes',
      },
    });
    await flushPromises();

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Sam');
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Rivera');
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('sam.rivera@example.com');
    expect((screen.getByLabelText(/phone/i) as HTMLInputElement).value).toBe('555-0100');
  });

  it('emits changed values on save', async () => {
    stubFieldsConfig([]);
    const { emitted } = render(PersonForm, {
      props: {
        initialValues: { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0100' },
        submitLabel: 'Save changes',
      },
    });
    await flushPromises();

    await fireEvent.update(screen.getByLabelText(/phone/i), '555-0199');
    await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(emitted().submit).toBeTruthy();
    expect(emitted().submit[0]).toEqual([
      { firstName: 'Sam', lastName: 'Rivera', email: 'sam.rivera@example.com', phone: '555-0199' },
    ]);
  });

  it('shows the rejection message while retaining the displayed values', async () => {
    stubFieldsConfig([]);
    render(PersonForm, {
      props: {
        initialValues: { firstName: 'Ana', lastName: 'Alvarez', email: 'ana.alvarez@example.com', phone: null },
        errorMessage: 'That email is already in use',
        submitLabel: 'Save changes',
      },
    });
    await flushPromises();

    expect(screen.getByText(/that email is already in use/i)).toBeTruthy();
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Ana');
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('ana.alvarez@example.com');
  });

  it('renders one optional free-text input per configured extra field on create', async () => {
    stubFieldsConfig(['Nickname']);
    render(PersonForm, { props: { submitLabel: 'Add person' } });
    await flushPromises();

    expect(screen.getByLabelText(/nickname/i)).toBeTruthy();
  });

  it('includes a filled-in extra field value in the submitted payload', async () => {
    stubFieldsConfig(['Nickname']);
    const { emitted } = render(PersonForm, { props: { submitLabel: 'Add person' } });
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
    const { emitted } = render(PersonForm, { props: { submitLabel: 'Add person' } });
    await flushPromises();

    await fireEvent.update(screen.getByLabelText(/first name/i), 'Sam');
    await fireEvent.update(screen.getByLabelText(/last name/i), 'Rivera');
    await fireEvent.click(screen.getByRole('button', { name: /add person/i }));

    expect(emitted().submit).toBeTruthy();
    expect(emitted().submit[0]).toEqual([
      { firstName: 'Sam', lastName: 'Rivera', email: '', phone: '', extraFields: { Nickname: '' } },
    ]);
  });

  it('displays the saved extra field value in edit mode', async () => {
    stubFieldsConfig(['Nickname']);
    render(PersonForm, {
      props: {
        initialValues: {
          firstName: 'Sam',
          lastName: 'Rivera',
          email: 'sam.rivera@example.com',
          phone: null,
          extraFields: { Nickname: 'Sammy' },
        },
        submitLabel: 'Save changes',
      },
    });
    await flushPromises();

    expect((screen.getByLabelText(/nickname/i) as HTMLInputElement).value).toBe('Sammy');
  });
});
