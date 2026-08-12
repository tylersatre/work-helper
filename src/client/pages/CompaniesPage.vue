<script setup lang="ts">
import { NButton, NEmpty, NInput } from 'naive-ui';
import { onMounted, ref } from 'vue';
import type { Company } from '../../shared/types.js';

const companies = ref<Company[]>([]);
const newCompanyName = ref('');
const createError = ref('');

async function fetchCompanies(): Promise<void> {
  const response = await fetch('/api/companies');
  companies.value = await response.json();
}

onMounted(fetchCompanies);

async function onCreate(): Promise<void> {
  const response = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: newCompanyName.value }),
  });
  const body = await response.json();
  if (!response.ok) {
    createError.value = body.error.message;
    return;
  }
  createError.value = '';
  newCompanyName.value = '';
  await fetchCompanies();
}
</script>

<template>
  <section class="companies-page">
    <h2>Companies</h2>

    <form class="companies-page-create" @submit.prevent="onCreate">
      <label for="new-company-name">Name</label>
      <NInput v-model:value="newCompanyName" size="small" :input-props="{ id: 'new-company-name', name: 'name' }" />
      <NButton attr-type="submit" size="small" type="primary">Create company</NButton>
      <p v-if="createError" role="alert" class="companies-page-error">{{ createError }}</p>
    </form>

    <NEmpty v-if="companies.length === 0" data-testid="companies-empty" description="No companies yet" class="companies-empty" />

    <ul v-else class="companies-list">
      <li v-for="company in companies" :key="company.id" class="company-row" data-testid="company-row">
        <RouterLink :to="`/companies/${company.id}`">{{ company.name }}</RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.companies-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.companies-page-create {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.companies-page-error {
  width: 100%;
  margin: 0;
  color: #fca5a5;
  font-size: 0.8rem;
}

.companies-empty {
  margin-top: 1.5rem;
}

.companies-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.company-row {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: var(--wh-surface);
}

.company-row a {
  color: inherit;
  text-decoration: none;
  width: 100%;
}
</style>
