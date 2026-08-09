<script setup lang="ts">
import { ref, watch } from 'vue';
import { primaryValue } from '../../shared/contacts.js';
import type { LinkedPerson, Person } from '../../shared/types.js';

const props = defineProps<{ taskId: number; people: LinkedPerson[] }>();

const emit = defineEmits<{ 'update:people': [people: LinkedPerson[]] }>();

const query = ref('');
const results = ref<Person[]>([]);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

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
  const response = await fetch(`/api/tasks/${props.taskId}/people`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personId }),
  });
  const task = await response.json();
  emit('update:people', task.people);
  query.value = '';
  results.value = [];
}

async function unlinkPerson(personId: number): Promise<void> {
  const response = await fetch(`/api/tasks/${props.taskId}/people/${personId}`, { method: 'DELETE' });
  const task = await response.json();
  emit('update:people', task.people);
}
</script>

<template>
  <div class="linked-people">
    <label class="linked-people-label" for="task-detail-search">Search people</label>
    <input id="task-detail-search" v-model="query" class="linked-people-search" type="text" name="search" />

    <ul v-if="results.length" class="people-list">
      <li v-for="person in results" :key="person.id" class="person-row" data-testid="search-result">
        <span>{{ person.firstName }} {{ person.lastName }} — {{ primaryValue(person.emails) }}</span>
        <button type="button" @click="linkPerson(person.id)">Link</button>
      </li>
    </ul>

    <ul class="people-list">
      <li v-for="person in people" :key="person.id" class="person-row" data-testid="linked-person">
        <span>{{ person.firstName }} {{ person.lastName }}</span>
        <button type="button" @click="unlinkPerson(person.id)">Remove</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.linked-people-label {
  display: block;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}

.linked-people-search {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.5rem;
}

.people-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.person-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: #1f1f24;
  font-size: 0.85rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
