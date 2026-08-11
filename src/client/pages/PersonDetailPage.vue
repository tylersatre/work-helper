<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ContactEntry, Person, Tag } from '../../shared/types.js';
import ContactEntryList from '../components/ContactEntryList.vue';
import PersonEmailSection from '../components/PersonEmailSection.vue';
import PersonForm from '../components/PersonForm.vue';
import TagChip from '../components/TagChip.vue';
import TagInput from '../components/TagInput.vue';

const route = useRoute();
const person = ref<Person | null>(null);
const errorMessage = ref('');
const tagError = ref('');

async function fetchPerson(): Promise<void> {
  const response = await fetch(`/api/people/${route.params.id}`);
  person.value = await response.json();
}

async function attachTag(tagId: number): Promise<void> {
  if (!person.value) return;
  const response = await fetch(`/api/people/${person.value.id}/tags`, {
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
  person.value.tags = body.tags;
}

async function createAndAttachTag(name: string): Promise<void> {
  if (!person.value) return;
  const response = await fetch(`/api/people/${person.value.id}/tags`, {
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
  person.value.tags = body.tags;
}

async function detachTag(tag: Tag): Promise<void> {
  if (!person.value) return;
  const response = await fetch(`/api/people/${person.value.id}/tags/${tag.id}`, { method: 'DELETE' });
  const body = await response.json();
  if (!response.ok) {
    tagError.value = body.error.message;
    return;
  }
  tagError.value = '';
  person.value.tags = body.tags;
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
  <section v-if="person" class="person-detail">
    <h2 class="person-name">{{ person.firstName }} {{ person.lastName }}</h2>

    <div class="person-detail-section">
      <ContactEntryList
        heading="Emails"
        empty-state-text="No email addresses yet."
        :api-base="`/api/people/${person.id}/emails`"
        :entries="person.emails"
        @update:entries="onUpdateEmails"
      />
    </div>

    <div class="person-detail-section">
      <ContactEntryList
        heading="Phones"
        empty-state-text="No phone numbers yet."
        :api-base="`/api/people/${person.id}/phones`"
        :entries="person.phones"
        @update:entries="onUpdatePhones"
      />
    </div>

    <div class="person-detail-section">
      <PersonEmailSection :person-id="person.id" />
    </div>

    <div class="person-detail-section">
      <h3>Tags</h3>
      <div class="person-detail-tags">
        <TagChip v-for="tag in person.tags" :key="tag.id" :tag="tag" removable @remove="detachTag(tag)" />
      </div>
      <p v-if="tagError" role="alert" class="person-detail-tag-error">{{ tagError }}</p>
      <TagInput :attached-tags="person.tags" @attach="attachTag" @create="createAndAttachTag" />
    </div>

    <div class="person-detail-section">
      <h3>Edit</h3>
      <PersonForm
        mode="edit"
        :initial-values="person"
        submit-label="Save changes"
        :error-message="errorMessage"
        @submit="onSubmit"
      />
    </div>
  </section>
</template>

<style scoped>
.person-detail {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.person-name {
  overflow-wrap: break-word;
  word-break: break-word;
}

.person-detail-section {
  margin-top: 1.25rem;
}

.person-detail-section h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.5rem;
}

.person-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.person-detail-tag-error {
  margin: 0 0 0.6rem;
  color: #fca5a5;
  font-size: 0.8rem;
}
</style>
