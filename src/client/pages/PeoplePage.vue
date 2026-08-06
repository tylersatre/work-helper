<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Person } from '../../shared/types.js';
import PersonForm from '../components/PersonForm.vue';

const people = ref<Person[]>([]);
const errorMessage = ref('');

async function fetchPeople(): Promise<void> {
  const response = await fetch('/api/people');
  people.value = await response.json();
}

async function onDelete(id: number): Promise<void> {
  await fetch(`/api/people/${id}`, { method: 'DELETE' });
  await fetchPeople();
}

async function onSubmit(values: { firstName: string; lastName: string; email: string; phone: string }): Promise<void> {
  const response = await fetch('/api/people', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    const body = await response.json();
    errorMessage.value = body.error.message;
    return;
  }

  errorMessage.value = '';
  await fetchPeople();
}

onMounted(fetchPeople);
</script>

<template>
  <section>
    <h2>People</h2>
    <PersonForm submit-label="Add person" :error-message="errorMessage" @submit="onSubmit" />
    <ul class="people-list">
      <li v-for="person in people" :key="person.id" class="person-row" data-testid="person-row">
        <RouterLink :to="`/people/${person.id}`">{{ person.firstName }} {{ person.lastName }}</RouterLink>
        — {{ person.email }} — {{ person.phone }}
        <button type="button" @click="onDelete(person.id)">Delete</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.people-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.person-row {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
