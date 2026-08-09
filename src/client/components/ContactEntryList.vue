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
    <h3 class="contact-entry-heading">{{ heading }}</h3>

    <ul v-if="localEntries.length" class="contact-entry-rows">
      <li v-for="entry in localEntries" :key="entry.id" class="contact-entry-row" data-testid="contact-entry-row">
        <template v-if="editingId === entry.id">
          <input v-model="editValue.value" class="contact-entry-edit-input" type="text" :aria-label="`Edit ${heading}`" />
          <div class="contact-entry-actions">
            <button type="button" @click="onSaveEdit(entry.id)">Save</button>
            <button type="button" @click="cancelEdit">Cancel</button>
          </div>
        </template>
        <template v-else>
          <span class="contact-entry-value">
            {{ entry.value }}
            <span v-if="entry.isPrimary" class="contact-entry-primary" data-testid="primary-marker">Primary</span>
          </span>
          <div class="contact-entry-actions">
            <button type="button" @click="startEdit(entry)">Edit</button>
            <button v-if="!entry.isPrimary" type="button" @click="onMarkPrimary(entry.id)">Make primary</button>
            <button type="button" @click="onRemove(entry.id)">Remove</button>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="contact-entry-empty">{{ emptyStateText }}</p>

    <div class="contact-entry-add">
      <label :for="`add-${heading}`">{{ `Add ${heading.replace(/s$/, '')}` }}</label>
      <input :id="`add-${heading}`" v-model="newValue" type="text" />
      <button type="button" @click="onAdd">Add</button>
    </div>

    <p v-if="errorMessage" role="alert" class="contact-entry-error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.contact-entry-list {
  margin-bottom: 0.5rem;
}

.contact-entry-heading {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.4rem;
}

.contact-entry-rows {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
}

.contact-entry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 0.35rem;
  background: #1f1f24;
  font-size: 0.82rem;
}

.contact-entry-value {
  overflow-wrap: break-word;
  word-break: break-word;
}

.contact-entry-primary {
  margin-left: 0.4rem;
  font-size: 0.68rem;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.contact-entry-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.contact-entry-empty {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.5rem;
}

.contact-entry-add {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
}

.contact-entry-add input {
  max-width: 100%;
  box-sizing: border-box;
}

.contact-entry-error {
  color: #fca5a5;
  font-size: 0.8rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
