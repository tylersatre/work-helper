<script setup lang="ts">
import { NButton, NEmpty, NInput, NModal } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CompanyDetail, Tag } from '../../shared/types.js';
import TagChip from '../components/TagChip.vue';
import TagInput from '../components/TagInput.vue';

const route = useRoute();
const router = useRouter();
const company = ref<CompanyDetail | null>(null);
const isRenaming = ref(false);
const renameValue = ref('');
const renameError = ref('');
const showAllPeople = ref(false);
const showAllCards = ref(false);
const tagError = ref('');
const isConfirmingDelete = ref(false);

async function fetchCompany(): Promise<void> {
  const response = await fetch(`/api/companies/${route.params.id}`);
  company.value = await response.json();
}

onMounted(fetchCompany);

const visiblePeople = computed(() => {
  if (!company.value) return [];
  return showAllPeople.value ? company.value.people : company.value.people.slice(0, 25);
});

const visibleCards = computed(() => {
  if (!company.value) return [];
  return showAllCards.value ? company.value.cards : company.value.cards.slice(0, 25);
});

async function attachTag(tagId: number): Promise<void> {
  if (!company.value) return;
  const response = await fetch(`/api/companies/${company.value.id}/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tagId }),
  });
  const body = await response.json();
  if (!response.ok) {
    tagError.value = body.error.message;
    return;
  }
  tagError.value = '';
  company.value.tags = body.tags;
}

async function createAndAttachTag(name: string): Promise<void> {
  if (!company.value) return;
  const response = await fetch(`/api/companies/${company.value.id}/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = await response.json();
  if (!response.ok) {
    tagError.value = body.error.message;
    return;
  }
  tagError.value = '';
  company.value.tags = body.tags;
}

async function detachTag(tag: Tag): Promise<void> {
  if (!company.value) return;
  const response = await fetch(`/api/companies/${company.value.id}/tags/${tag.id}`, { method: 'DELETE' });
  const body = await response.json();
  if (!response.ok) {
    tagError.value = body.error.message;
    return;
  }
  tagError.value = '';
  company.value.tags = body.tags;
}

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

function requestDelete(): void {
  isConfirmingDelete.value = true;
}

function cancelDelete(): void {
  isConfirmingDelete.value = false;
}

async function confirmDelete(): Promise<void> {
  if (!company.value) return;
  await fetch(`/api/companies/${company.value.id}`, { method: 'DELETE' });
  isConfirmingDelete.value = false;
  await router.push('/companies');
}

function onDialogShowChange(show: boolean): void {
  if (!show) {
    cancelDelete();
  }
}

function peoplePhrase(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

function cardsPhrase(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}

const deleteMessage = computed(() => {
  if (!company.value) return '';
  return `"${company.value.name}" is linked to ${peoplePhrase(company.value.people.length)} and ${cardsPhrase(company.value.cards.length)}.`;
});
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
      <NButton size="small" @click="requestDelete">Delete</NButton>
    </template>

    <div class="company-detail-section">
      <h3>People</h3>
      <NEmpty v-if="company.people.length === 0" data-testid="company-people-empty" description="No people yet" />
      <template v-else>
        <ul class="company-detail-list">
          <li v-for="person in visiblePeople" :key="person.id" class="company-detail-row" data-testid="company-person-row">
            <RouterLink :to="`/people/${person.id}`">{{ person.firstName }} {{ person.lastName }}</RouterLink>
          </li>
        </ul>
        <NButton v-if="!showAllPeople && company.people.length > 25" size="small" @click="showAllPeople = true">Show all</NButton>
      </template>
    </div>

    <div class="company-detail-section">
      <h3>Cards</h3>
      <NEmpty v-if="company.cards.length === 0" data-testid="company-cards-empty" description="No cards yet" />
      <template v-else>
        <ul class="company-detail-list">
          <li v-for="card in visibleCards" :key="card.id" class="company-detail-row" data-testid="company-card-row">
            <RouterLink :to="`/tasks/${card.id}`">{{ card.title }}</RouterLink>
          </li>
        </ul>
        <NButton v-if="!showAllCards && company.cards.length > 25" size="small" @click="showAllCards = true">Show all</NButton>
      </template>
    </div>

    <div class="company-detail-section">
      <h3>Tags</h3>
      <NEmpty v-if="company.tags.length === 0" data-testid="company-tags-empty" description="No tags yet" />
      <div v-else class="company-detail-tags">
        <TagChip v-for="tag in company.tags" :key="tag.id" :tag="tag" removable @remove="detachTag(tag)" />
      </div>
      <p v-if="tagError" role="alert" class="company-detail-error">{{ tagError }}</p>
      <TagInput :attached-tags="company.tags" @attach="attachTag" @create="createAndAttachTag" />
    </div>

    <NModal
      data-testid="delete-company-dialog"
      :show="isConfirmingDelete"
      display-directive="if"
      preset="dialog"
      title="Delete this company?"
      :content="deleteMessage"
      positive-text="Delete"
      negative-text="Cancel"
      @positive-click="confirmDelete"
      @negative-click="cancelDelete"
      @update:show="onDialogShowChange"
    />
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

.company-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}
</style>
