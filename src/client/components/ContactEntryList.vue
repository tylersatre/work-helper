<script setup lang="ts">
import { NButton, NInput } from 'naive-ui';
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
          <NInput
            v-model:value="editValue.value"
            size="small"
            class="contact-entry-edit-input"
            :input-props="{ 'aria-label': `Edit ${heading}` }"
          />
          <div class="contact-entry-actions">
            <NButton size="small" @click="onSaveEdit(entry.id)">Save</NButton>
            <NButton size="small" @click="cancelEdit">Cancel</NButton>
          </div>
        </template>
        <template v-else>
          <span class="contact-entry-value">
            {{ entry.value }}
            <span v-if="entry.isPrimary" class="contact-entry-primary" data-testid="primary-marker">Primary</span>
          </span>
          <div class="contact-entry-actions">
            <NButton size="small" @click="startEdit(entry)">Edit</NButton>
            <NButton v-if="!entry.isPrimary" size="small" @click="onMarkPrimary(entry.id)">Make primary</NButton>
            <NButton size="small" @click="onRemove(entry.id)">Remove</NButton>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="contact-entry-empty">{{ emptyStateText }}</p>

    <div class="contact-entry-add">
      <label :for="`add-${heading}`">{{ `Add ${heading.replace(/s$/, '')}` }}</label>
      <NInput v-model:value="newValue" size="small" :input-props="{ id: `add-${heading}` }" />
      <NButton size="small" @click="onAdd">Add</NButton>
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
  color: var(--wh-text-muted);
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
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  margin-bottom: 0.35rem;
  background: var(--wh-surface);
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
  color: var(--wh-text-muted);
  margin-bottom: 0.5rem;
}

.contact-entry-add {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
}

.contact-entry-add label {
  flex-shrink: 0;
  white-space: nowrap;
}

.contact-entry-error {
  color: var(--wh-error);
  font-size: 0.8rem;
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
