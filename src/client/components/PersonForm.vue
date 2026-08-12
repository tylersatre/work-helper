<script setup lang="ts">
import { NButton, NInput } from 'naive-ui';
import { onMounted, reactive, ref, watch } from 'vue';

interface CreatePersonFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  extraFields?: Record<string, string>;
}

interface EditPersonFormValues {
  firstName: string;
  lastName: string;
  extraFields?: Record<string, string>;
}

const props = withDefaults(
  defineProps<{
    mode?: 'create' | 'edit';
    initialValues?: {
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      extraFields?: Record<string, string>;
    };
    errorMessage?: string;
    submitLabel?: string;
  }>(),
  {
    mode: 'create',
    initialValues: undefined,
    errorMessage: '',
    submitLabel: 'Add person',
  },
);

const emit = defineEmits<{ submit: [values: CreatePersonFormValues | EditPersonFormValues] }>();

const fieldLabels = ref<string[]>([]);

const form = reactive({
  firstName: props.initialValues?.firstName ?? '',
  lastName: props.initialValues?.lastName ?? '',
  email: props.initialValues?.email ?? '',
  phone: props.initialValues?.phone ?? '',
  extraFields: { ...(props.initialValues?.extraFields ?? {}) } as Record<string, string>,
});

watch(
  () => props.initialValues,
  (values) => {
    if (!values) return;
    form.firstName = values.firstName;
    form.lastName = values.lastName;
    form.email = values.email ?? '';
    form.phone = values.phone ?? '';
    form.extraFields = { ...(values.extraFields ?? {}) };
  },
);

async function fetchFieldLabels(): Promise<void> {
  const response = await fetch('/api/person-fields');
  const body = await response.json();
  fieldLabels.value = body.fields ?? [];
}

onMounted(fetchFieldLabels);

function extraFieldId(label: string): string {
  return `person-extra-${label}`;
}

function extraFieldsPayload(): Record<string, string> | undefined {
  if (fieldLabels.value.length === 0) return undefined;
  const extraFields: Record<string, string> = {};
  for (const label of fieldLabels.value) {
    extraFields[label] = form.extraFields[label] ?? '';
  }
  return extraFields;
}

function onSubmit(): void {
  const extraFields = extraFieldsPayload();

  if (props.mode === 'edit') {
    const values: EditPersonFormValues = { firstName: form.firstName, lastName: form.lastName };
    if (extraFields) values.extraFields = extraFields;
    emit('submit', values);
    return;
  }

  const values: CreatePersonFormValues = { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone };
  if (extraFields) values.extraFields = extraFields;
  emit('submit', values);
}
</script>

<template>
  <form class="person-form" @submit.prevent="onSubmit">
    <div class="person-form-field">
      <label for="person-first-name">First name</label>
      <NInput v-model:value="form.firstName" size="small" :input-props="{ id: 'person-first-name', name: 'firstName' }" />
    </div>

    <div class="person-form-field">
      <label for="person-last-name">Last name</label>
      <NInput v-model:value="form.lastName" size="small" :input-props="{ id: 'person-last-name', name: 'lastName' }" />
    </div>

    <template v-if="mode === 'create'">
      <div class="person-form-field">
        <label for="person-email">Email</label>
        <NInput v-model:value="form.email" size="small" :input-props="{ id: 'person-email', name: 'email' }" />
      </div>

      <div class="person-form-field">
        <label for="person-phone">Phone</label>
        <NInput v-model:value="form.phone" size="small" :input-props="{ id: 'person-phone', name: 'phone' }" />
      </div>
    </template>

    <div v-for="label in fieldLabels" :key="label" class="person-form-field">
      <label :for="extraFieldId(label)">{{ label }}</label>
      <NInput v-model:value="form.extraFields[label]" size="small" :input-props="{ id: extraFieldId(label), name: label }" />
    </div>

    <div class="person-form-actions">
      <NButton attr-type="submit" size="small" type="primary">{{ submitLabel }}</NButton>
    </div>
    <p v-if="errorMessage" role="alert" class="person-form-error">{{ errorMessage }}</p>
  </form>
</template>

<style scoped>
.person-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 420px;
}

.person-form-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.person-form-field label {
  font-size: 0.72rem;
  color: var(--wh-text-secondary);
}

.person-form-actions {
  margin-top: 0.25rem;
}

.person-form-error {
  margin: 0;
  color: var(--wh-error);
  font-size: 0.8rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
