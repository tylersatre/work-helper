<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Person } from '../../shared/types.js';
import PersonForm from '../components/PersonForm.vue';

const route = useRoute();
const person = ref<Person | null>(null);
const errorMessage = ref('');

async function fetchPerson(): Promise<void> {
  const response = await fetch(`/api/people/${route.params.id}`);
  person.value = await response.json();
}

async function onSubmit(values: { firstName: string; lastName: string; email: string; phone: string }): Promise<void> {
  const response = await fetch(`/api/people/${route.params.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    const body = await response.json();
    errorMessage.value = body.error.message;
    return;
  }

  errorMessage.value = '';
  person.value = await response.json();
}

onMounted(fetchPerson);
</script>

<template>
  <section v-if="person">
    <h2 class="person-name">{{ person.firstName }} {{ person.lastName }}</h2>
    <PersonForm
      :initial-values="person"
      submit-label="Save changes"
      :error-message="errorMessage"
      @submit="onSubmit"
    />
  </section>
</template>

<style scoped>
.person-name {
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
