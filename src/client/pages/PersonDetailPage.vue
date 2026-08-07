<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ContactEntry, Person } from '../../shared/types.js';
import ContactEntryList from '../components/ContactEntryList.vue';
import PersonForm from '../components/PersonForm.vue';

const route = useRoute();
const person = ref<Person | null>(null);
const errorMessage = ref('');

async function fetchPerson(): Promise<void> {
  const response = await fetch(`/api/people/${route.params.id}`);
  person.value = await response.json();
}

async function onSubmit(values: { firstName: string; lastName: string; extraFields?: Record<string, string> }): Promise<void> {
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

function onUpdateEmails(entries: ContactEntry[]): void {
  if (person.value) {
    person.value.emails = entries;
  }
}

function onUpdatePhones(entries: ContactEntry[]): void {
  if (person.value) {
    person.value.phones = entries;
  }
}

onMounted(fetchPerson);
</script>

<template>
  <section v-if="person">
    <h2 class="person-name">{{ person.firstName }} {{ person.lastName }}</h2>
    <ContactEntryList
      heading="Emails"
      empty-state-text="No email addresses yet."
      :api-base="`/api/people/${person.id}/emails`"
      :entries="person.emails"
      @update:entries="onUpdateEmails"
    />
    <ContactEntryList
      heading="Phones"
      empty-state-text="No phone numbers yet."
      :api-base="`/api/people/${person.id}/phones`"
      :entries="person.phones"
      @update:entries="onUpdatePhones"
    />
    <PersonForm
      mode="edit"
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
