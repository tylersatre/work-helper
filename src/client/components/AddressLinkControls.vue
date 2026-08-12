<script setup lang="ts">
import { NButton, NInput } from 'naive-ui';
import { ref, useId, watch } from 'vue';
import { primaryValue } from '../../shared/contacts.js';
import type { Person } from '../../shared/types.js';
import { splitDisplayName } from '../utils/email-format.js';
import PersonForm from './PersonForm.vue';

const props = defineProps<{ address: string; displayName: string }>();

const emit = defineEmits<{ linked: [] }>();

const query = ref('');
const results = ref<Person[]>([]);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
const linkError = ref('');
const creating = ref(false);
const createError = ref('');

const split = splitDisplayName(props.displayName);
const searchInputId = `address-link-search-${useId()}`;

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer);

  const trimmed = value.trim();
  if (!trimmed) {
    results.value = [];
    return;
  }

  debounceTimer = setTimeout(async () => {
    const response = await fetch(`/api/people?q=${encodeURIComponent(trimmed)}`);
    results.value = await response.json();
  }, 300);
});

async function linkPerson(personId: number): Promise<void> {
  const response = await fetch(`/api/people/${personId}/emails`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: props.address }),
  });
  const body = await response.json();
  if (!response.ok) {
    linkError.value = body.error.message;
    return;
  }
  linkError.value = '';
  emit('linked');
}

async function onCreate(values: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  extraFields?: Record<string, string>;
}): Promise<void> {
  const response = await fetch('/api/people', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email?.trim() ? values.email : props.address,
      phone: values.phone ?? '',
      extraFields: values.extraFields,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    createError.value = body.error.message;
    return;
  }
  createError.value = '';
  emit('linked');
}
</script>

<template>
  <div class="address-link-controls" data-testid="address-link-controls">
    <div class="address-link-actions">
      <NInput
        v-model:value="query"
        size="small"
        class="address-link-search"
        placeholder="Search people to link"
        :input-props="{ id: searchInputId, name: 'search', 'aria-label': 'Search people to link' }"
      />
      <NButton v-if="!creating" size="small" @click="creating = true">Create person</NButton>
    </div>

    <ul v-if="results.length" class="address-link-results">
      <li v-for="person in results" :key="person.id" data-testid="search-result" class="address-link-result">
        <span>{{ person.firstName }} {{ person.lastName }} — {{ primaryValue(person.emails) }}</span>
        <NButton size="small" @click="linkPerson(person.id)">Link</NButton>
      </li>
    </ul>
    <p v-if="linkError" role="alert" class="address-link-error">{{ linkError }}</p>

    <PersonForm
      v-if="creating"
      mode="create"
      :initial-values="{ firstName: split.firstName, lastName: split.lastName, email: address, phone: '' }"
      submit-label="Create person"
      :error-message="createError"
      @submit="onCreate"
    />
  </div>
</template>

<style scoped>
/* Compact inline controls: sits at the right end of a participant row; the
 * results list and create form expand below the row's action strip. */
.address-link-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.address-link-search {
  width: 180px;
}

.address-link-results {
  list-style: none;
  padding: 0;
  margin: 0 0 0.3rem;
}

.address-link-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.78rem;
  padding: 0.2rem 0;
}

.address-link-error {
  color: var(--wh-error);
  font-size: 0.75rem;
  margin: 0 0 0.3rem;
}
</style>
