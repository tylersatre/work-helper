<script setup lang="ts">
import { NButton, NEmpty, NInput } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { CompanyDetail } from '../../shared/types.js';

const route = useRoute();
const company = ref<CompanyDetail | null>(null);
const isRenaming = ref(false);
const renameValue = ref('');
const renameError = ref('');

async function fetchCompany(): Promise<void> {
  const response = await fetch(`/api/companies/${route.params.id}`);
  company.value = await response.json();
}

onMounted(fetchCompany);

function startRename(): void {
  if (!company.value) return;
  isRenaming.value = true;
  renameValue.value = company.value.name;
  renameError.value = '';
}

function cancelRename(): void {
  isRenaming.value = false;
  renameError.value = '';
}

async function saveRename(): Promise<void> {
  if (!company.value) return;
  const response = await fetch(`/api/companies/${company.value.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: renameValue.value }),
  });
  const body = await response.json();
  if (!response.ok) {
    renameError.value = body.error.message;
    return;
  }
  company.value.name = body.name;
  isRenaming.value = false;
  renameError.value = '';
}
</script>

<template>
  <section v-if="company" class="company-detail">
    <template v-if="isRenaming">
      <NInput v-model:value="renameValue" size="small" :input-props="{ 'aria-label': 'Rename company' }" />
      <NButton size="small" @click="saveRename">Save</NButton>
      <NButton size="small" @click="cancelRename">Cancel</NButton>
      <p v-if="renameError" role="alert" class="company-detail-error">{{ renameError }}</p>
    </template>
    <template v-else>
      <h2 class="company-name">{{ company.name }}</h2>
      <NButton size="small" @click="startRename">Rename</NButton>
    </template>

    <div class="company-detail-section">
      <h3>People</h3>
      <NEmpty v-if="company.people.length === 0" data-testid="company-people-empty" description="No people yet" />
      <ul v-else class="company-detail-list">
        <li v-for="person in company.people" :key="person.id" class="company-detail-row" data-testid="company-person-row">
          <RouterLink :to="`/people/${person.id}`">{{ person.firstName }} {{ person.lastName }}</RouterLink>
        </li>
      </ul>
    </div>

    <div class="company-detail-section">
      <h3>Cards</h3>
      <NEmpty v-if="company.cards.length === 0" data-testid="company-cards-empty" description="No cards yet" />
      <ul v-else class="company-detail-list">
        <li v-for="card in company.cards" :key="card.id" class="company-detail-row" data-testid="company-card-row">
          <RouterLink :to="`/tasks/${card.id}`">{{ card.title }}</RouterLink>
        </li>
      </ul>
    </div>

    <div class="company-detail-section">
      <h3>Tags</h3>
      <NEmpty v-if="company.tags.length === 0" data-testid="company-tags-empty" description="No tags yet" />
    </div>
  </section>
</template>

<style scoped>
.company-detail {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.company-name {
  overflow-wrap: break-word;
  word-break: break-word;
}

.company-detail-error {
  margin: 0;
  color: #fca5a5;
  font-size: 0.8rem;
}

.company-detail-section {
  margin-top: 1.25rem;
}

.company-detail-section h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.5rem;
}

.company-detail-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.company-detail-row {
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: #1f1f24;
  font-size: 0.85rem;
}

.company-detail-row a {
  color: inherit;
  text-decoration: none;
}
</style>
