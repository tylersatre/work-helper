<script setup lang="ts">
import { NButton, NEmpty } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { primaryValue } from '../../shared/contacts.js';
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

async function onSubmit(values: { firstName: string; lastName: string; email?: string; phone?: string }): Promise<void> {
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
  <section class="people-page">
    <h2>People</h2>
    <div class="people-page-create">
      <PersonForm submit-label="Add person" :error-message="errorMessage" @submit="onSubmit" />
    </div>

    <NEmpty v-if="people.length === 0" data-testid="people-empty" description="No people yet" class="people-empty" />
    <div v-else class="people-table-wrapper">
      <table class="people-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th class="people-table-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in people" :key="person.id" class="person-row" data-testid="person-row">
            <td><RouterLink :to="`/people/${person.id}`">{{ person.firstName }} {{ person.lastName }}</RouterLink></td>
            <td>{{ primaryValue(person.emails) }}</td>
            <td>{{ primaryValue(person.phones) }}</td>
            <td class="people-table-actions">
              <NButton size="small" @click="onDelete(person.id)">Delete</NButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.people-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.people-page-create {
  margin-bottom: 1.25rem;
}

.people-empty {
  margin-top: 1.5rem;
}

.people-table-wrapper {
  overflow-x: auto;
}

.people-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.people-table th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.people-table td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-wrap: break-word;
  word-break: break-word;
}

.people-table-actions {
  text-align: right;
  white-space: nowrap;
}
</style>
