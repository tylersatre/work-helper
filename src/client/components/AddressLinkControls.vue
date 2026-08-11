<script setup lang="ts">
import { NButton, NInput } from 'naive-ui';
import { ref, watch } from 'vue';
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

async function onCreate(values: { firstName: string; lastName: string }): Promise<void> {
  const response = await fetch('/api/people', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: values.firstName, lastName: values.lastName, email: props.address }),
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
    <label class="address-link-label" :for="`address-link-search-${address}`">Search people to link</label>
    <NInput
      v-model:value="query"
      size="small"
      class="address-link-search"
      :input-props="{ id: `address-link-search-${address}`, name: 'search', 'aria-label': 'Search people to link' }"
    />

    <ul v-if="results.length" class="address-link-results">
      <li v-for="person in results" :key="person.id" data-testid="search-result" class="address-link-result">
        <span>{{ person.firstName }} {{ person.lastName }} — {{ primaryValue(person.emails) }}</span>
        <NButton size="small" @click="linkPerson(person.id)">Link</NButton>
      </li>
    </ul>
    <p v-if="linkError" role="alert" class="address-link-error">{{ linkError }}</p>

    <NButton v-if="!creating" size="small" @click="creating = true">Create person</NButton>
    <PersonForm
      v-else
      mode="create"
      :initial-values="{ firstName: split.firstName, lastName: split.lastName, email: address, phone: '' }"
      submit-label="Create person"
      :error-message="createError"
      @submit="onCreate"
    />
  </div>
</template>

<style scoped>
.address-link-controls {
  margin-top: 0.3rem;
  padding: 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.address-link-label {
  display: block;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.2rem;
}

.address-link-search {
  max-width: 280px;
  margin-bottom: 0.3rem;
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
  color: #fca5a5;
  font-size: 0.75rem;
  margin: 0 0 0.3rem;
}
</style>
