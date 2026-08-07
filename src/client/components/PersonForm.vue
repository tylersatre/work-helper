<script setup lang="ts">
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
  <form @submit.prevent="onSubmit">
    <label for="person-first-name">First name</label>
    <input id="person-first-name" v-model="form.firstName" type="text" name="firstName" />

    <label for="person-last-name">Last name</label>
    <input id="person-last-name" v-model="form.lastName" type="text" name="lastName" />

    <template v-if="mode === 'create'">
      <label for="person-email">Email</label>
      <input id="person-email" v-model="form.email" type="text" name="email" />

      <label for="person-phone">Phone</label>
      <input id="person-phone" v-model="form.phone" type="text" name="phone" />
    </template>

    <template v-for="label in fieldLabels" :key="label">
      <label :for="`person-extra-${label}`">{{ label }}</label>
      <input :id="`person-extra-${label}`" v-model="form.extraFields[label]" type="text" :name="label" />
    </template>

    <button type="submit">{{ submitLabel }}</button>
    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
  </form>
</template>

<style scoped>
input {
  max-width: 100%;
  box-sizing: border-box;
}

p[role='alert'] {
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
