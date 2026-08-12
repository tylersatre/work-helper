<script setup lang="ts">
import { NButton, NInput } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import type { Company } from '../../shared/types.js';

const props = defineProps<{ taskId: number; companies: Company[] }>();

const emit = defineEmits<{ 'update:companies': [companies: Company[]] }>();

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

const linkedIds = computed(() => new Set(props.companies.map((company) => company.id)));
const suggestions = computed(() => results.value.filter((company) => !linkedIds.value.has(company.id)));

async function linkCompany(companyId: number): Promise<void> {
  const response = await fetch(`/api/tasks/${props.taskId}/companies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyId }),
  });
  const task = await response.json();
  emit('update:companies', task.companies);
  query.value = '';
  results.value = [];
}

async function unlinkCompany(companyId: number): Promise<void> {
  const response = await fetch(`/api/tasks/${props.taskId}/companies/${companyId}`, { method: 'DELETE' });
  const task = await response.json();
  emit('update:companies', task.companies);
}
</script>

<template>
  <div class="linked-companies">
    <label class="linked-companies-label" for="task-detail-company-search">Search companies</label>
    <NInput
      v-model:value="query"
      size="small"
      class="linked-companies-search"
      :input-props="{ id: 'task-detail-company-search', name: 'search' }"
    />

    <ul v-if="suggestions.length" class="companies-list">
      <li v-for="company in suggestions" :key="company.id" class="company-row" data-testid="company-search-result">
        <span>{{ company.name }}</span>
        <NButton size="small" @click="linkCompany(company.id)">Link</NButton>
      </li>
    </ul>

    <ul class="companies-list">
      <li v-for="company in companies" :key="company.id" class="company-row" data-testid="linked-company">
        <span>{{ company.name }}</span>
        <NButton size="small" @click="unlinkCompany(company.id)">Remove</NButton>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.linked-companies-label {
  display: block;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}

.linked-companies-search {
  width: 100%;
  max-width: 100%;
  margin-bottom: 0.5rem;
}

.companies-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.company-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: var(--wh-surface);
  font-size: 0.85rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
