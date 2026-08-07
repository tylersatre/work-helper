<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { ContactEntry } from '../../shared/types.js';

const props = defineProps<{
  heading: string;
  emptyStateText: string;
  apiBase: string;
  entries: ContactEntry[];
}>();

const emit = defineEmits<{ 'update:entries': [entries: ContactEntry[]] }>();

const localEntries = ref<ContactEntry[]>([...props.entries]);
watch(
  () => props.entries,
  (entries) => {
    localEntries.value = [...entries];
  },
);

const newValue = ref('');
const errorMessage = ref('');
const editingId = ref<number | null>(null);
const editValue = reactive({ value: '' });

async function applyResponse(response: Response): Promise<void> {
  const body = await response.json();
  if (!response.ok) {
    errorMessage.value = body.error.message;
    return;
  }
  errorMessage.value = '';
  localEntries.value = body.entries;
  emit('update:entries', body.entries);
}

async function onAdd(): Promise<void> {
  const response = await fetch(props.apiBase, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: newValue.value }),
  });
  await applyResponse(response);
  if (response.ok) {
    newValue.value = '';
  }
}

function startEdit(entry: ContactEntry): void {
  editingId.value = entry.id;
  editValue.value = entry.value;
}

function cancelEdit(): void {
  editingId.value = null;
  editValue.value = '';
}

async function onSaveEdit(entryId: number): Promise<void> {
  const response = await fetch(`${props.apiBase}/${entryId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: editValue.value }),
  });
  await applyResponse(response);
  if (response.ok) {
    cancelEdit();
  }
}

async function onMarkPrimary(entryId: number): Promise<void> {
  const response = await fetch(`${props.apiBase}/${entryId}/primary`, { method: 'PUT' });
  await applyResponse(response);
}

async function onRemove(entryId: number): Promise<void> {
  const response = await fetch(`${props.apiBase}/${entryId}`, { method: 'DELETE' });
  await applyResponse(response);
}
</script>

<template>
  <div class="contact-entry-list">
    <h3>{{ heading }}</h3>

    <ul v-if="localEntries.length">
      <li v-for="entry in localEntries" :key="entry.id" class="contact-entry-row" data-testid="contact-entry-row">
        <template v-if="editingId === entry.id">
          <input v-model="editValue.value" type="text" :aria-label="`Edit ${heading}`" />
          <button type="button" @click="onSaveEdit(entry.id)">Save</button>
          <button type="button" @click="cancelEdit">Cancel</button>
        </template>
        <template v-else>
          <span>{{ entry.value }}</span>
          <span v-if="entry.isPrimary" data-testid="primary-marker">Primary</span>
          <button type="button" @click="startEdit(entry)">Edit</button>
          <button v-if="!entry.isPrimary" type="button" @click="onMarkPrimary(entry.id)">Make primary</button>
          <button type="button" @click="onRemove(entry.id)">Remove</button>
        </template>
      </li>
    </ul>
    <p v-else>{{ emptyStateText }}</p>

    <label :for="`add-${heading}`">{{ `Add ${heading.replace(/s$/, '')}` }}</label>
    <input :id="`add-${heading}`" v-model="newValue" type="text" />
    <button type="button" @click="onAdd">Add</button>

    <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
  </div>
</template>
