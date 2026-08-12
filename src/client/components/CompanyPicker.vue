<script setup lang="ts">
import { NButton, NInput } from 'naive-ui';
import { ref, watch } from 'vue';
import type { Company } from '../../shared/types.js';

defineProps<{ company: Company | null }>();

const emit = defineEmits<{ 'update:company': [company: Company | null] }>();

const query = ref('');
const results = ref<Company[]>([]);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer);

  const trimmed = value.trim();
  if (!trimmed) {
    results.value = [];
    return;
  }

  debounceTimer = setTimeout(async () => {
    const response = await fetch(`/api/companies?q=${encodeURIComponent(trimmed)}`);
    results.value = await response.json();
  }, 300);
});

function select(company: Company): void {
  emit('update:company', company);
  query.value = '';
  results.value = [];
}

function clear(): void {
  emit('update:company', null);
}
</script>

<template>
  <div class="company-picker">
    <label class="company-picker-label" for="person-company-search">Company</label>
    <NInput v-model:value="query" size="small" class="company-picker-search" :input-props="{ id: 'person-company-search', name: 'company' }" />

    <p v-if="company" class="company-picker-current">
      {{ company.name }}
      <NButton size="small" @click="clear">Clear</NButton>
    </p>

    <ul v-if="results.length" class="company-picker-results">
      <li v-for="result in results" :key="result.id">
        <button type="button" data-testid="company-suggestion" @click="select(result)">{{ result.name }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.company-picker-label {
  display: block;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.2rem;
}

.company-picker-search {
  width: 100%;
  max-width: 100%;
}

.company-picker-current {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
}

.company-picker-results {
  list-style: none;
  padding: 0;
  margin: 0.3rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.company-picker-results button {
  width: 100%;
  text-align: left;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  background: var(--wh-surface);
  color: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
</style>
