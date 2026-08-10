<script setup lang="ts">
import { NButton, NColorPicker, NEmpty, NInput, NModal } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { TAG_PALETTE } from '../../shared/tag-palette.js';
import type { TagWithCounts } from '../../shared/types.js';
import TagChip from '../components/TagChip.vue';

const tags = ref<TagWithCounts[]>([]);
const newTagName = ref('');
const createError = ref('');
const editingId = ref<number | null>(null);
const editName = ref('');
const editError = ref('');
const recolorError = ref<{ tagId: number; message: string } | null>(null);
const deleteTarget = ref<TagWithCounts | null>(null);
const colorOnOpen = new Map<number, string>();

const swatches = [...TAG_PALETTE];

async function fetchTags(): Promise<void> {
  const response = await fetch('/api/tags');
  tags.value = await response.json();
}

onMounted(fetchTags);

async function onCreate(): Promise<void> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: newTagName.value }),
  });
  const body = await response.json();
  if (!response.ok) {
    createError.value = body.error.message;
    return;
  }
  createError.value = '';
  newTagName.value = '';
  await fetchTags();
}

function startRename(tag: TagWithCounts): void {
  editingId.value = tag.id;
  editName.value = tag.name;
  editError.value = '';
}

function cancelRename(): void {
  editingId.value = null;
  editName.value = '';
  editError.value = '';
}

async function saveRename(tag: TagWithCounts): Promise<void> {
  const response = await fetch(`/api/tags/${tag.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: editName.value }),
  });
  const body = await response.json();
  if (!response.ok) {
    editError.value = body.error.message;
    return;
  }
  cancelRename();
  await fetchTags();
}

function onColorPreview(tag: TagWithCounts, color: string): void {
  tag.color = color;
}

async function onRecolor(tag: TagWithCounts, color: string): Promise<void> {
  try {
    const response = await fetch(`/api/tags/${tag.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color }),
    });
    recolorError.value = response.ok ? null : { tagId: tag.id, message: (await response.json()).error.message };
  } catch {
    recolorError.value = { tagId: tag.id, message: 'Could not save the color change' };
  }
  await fetchTags();
}

// naive-ui's own preset-swatch click only calls `update:value`, never `complete` (only a completed
// hue/alpha drag or a HEX-field commit fires `complete`), so persisting on `complete` alone silently
// drops swatch-only picks. Persist on close instead, comparing against the color when it was opened.
function onColorPickerShowChange(tag: TagWithCounts, show: boolean): void {
  if (show) {
    colorOnOpen.set(tag.id, tag.color);
    return;
  }
  const openedWith = colorOnOpen.get(tag.id);
  colorOnOpen.delete(tag.id);
  if (openedWith !== undefined && openedWith !== tag.color) {
    void onRecolor(tag, tag.color);
  }
}

async function requestDelete(tag: TagWithCounts): Promise<void> {
  // Re-fetch rather than reuse the already-loaded list, so the dialog's stated
  // counts reflect the moment it opens (research.md R7), not whenever the page
  // last happened to load.
  await fetchTags();
  deleteTarget.value = tags.value.find((t) => t.id === tag.id) ?? tag;
}

function cancelDelete(): void {
  deleteTarget.value = null;
}

async function confirmDelete(): Promise<void> {
  const tag = deleteTarget.value;
  if (!tag) return;
  await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
  deleteTarget.value = null;
  await fetchTags();
}

function onDialogShowChange(show: boolean): void {
  if (!show) {
    cancelDelete();
  }
}

function peoplePhrase(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

function tasksPhrase(count: number): string {
  return count === 1 ? '1 task' : `${count} tasks`;
}

function deleteMessage(tag: TagWithCounts | null): string {
  if (!tag) return '';
  return `"${tag.name}" is attached to ${peoplePhrase(tag.peopleCount)} and ${tasksPhrase(tag.tasksCount)}.`;
}
</script>

<template>
  <section class="tags-page">
    <h2>Tags</h2>

    <form class="tags-page-create" @submit.prevent="onCreate">
      <label for="new-tag-name">New tag</label>
      <NInput v-model:value="newTagName" size="small" :input-props="{ id: 'new-tag-name', name: 'name' }" />
      <NButton attr-type="submit" size="small" type="primary">Create tag</NButton>
      <p v-if="createError" role="alert" class="tags-page-error">{{ createError }}</p>
    </form>

    <NEmpty v-if="tags.length === 0" data-testid="tags-empty" description="No tags yet" class="tags-empty" />

    <ul v-else class="tags-list">
      <li v-for="tag in tags" :key="tag.id" class="tag-row" data-testid="tag-row">
        <template v-if="editingId === tag.id">
          <NInput v-model:value="editName" size="small" :input-props="{ 'aria-label': 'Rename tag' }" />
          <NButton size="small" @click="saveRename(tag)">Save</NButton>
          <NButton size="small" @click="cancelRename">Cancel</NButton>
          <p v-if="editError" role="alert" class="tags-page-error">{{ editError }}</p>
        </template>
        <template v-else>
          <TagChip :tag="tag" />
          <NColorPicker
            :value="tag.color"
            :swatches="swatches"
            :modes="['hex']"
            :show-alpha="false"
            size="small"
            @update:value="onColorPreview(tag, $event)"
            @update:show="onColorPickerShowChange(tag, $event)"
          />
          <NButton size="small" @click="startRename(tag)">Rename</NButton>
          <NButton size="small" @click="requestDelete(tag)">Delete</NButton>
          <p v-if="recolorError?.tagId === tag.id" role="alert" class="tags-page-error">{{ recolorError.message }}</p>
        </template>
      </li>
    </ul>

    <NModal
      data-testid="delete-tag-dialog"
      :show="deleteTarget !== null"
      display-directive="if"
      preset="dialog"
      title="Delete this tag?"
      :content="deleteMessage(deleteTarget)"
      positive-text="Delete"
      negative-text="Cancel"
      @positive-click="confirmDelete"
      @negative-click="cancelDelete"
      @update:show="onDialogShowChange"
    />
  </section>
</template>

<style scoped>
.tags-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.tags-page-create {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.tags-page-error {
  width: 100%;
  margin: 0;
  color: #fca5a5;
  font-size: 0.8rem;
}

.tags-empty {
  margin-top: 1.5rem;
}

.tags-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: #1f1f24;
  flex-wrap: wrap;
}
</style>
