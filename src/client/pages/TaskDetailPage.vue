<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Company, LinkedPerson, Note, Tag, TaskDetail } from '../../shared/types.js';
import DeleteCardConfirm from '../components/DeleteCardConfirm.vue';
import LinkedCompanies from '../components/LinkedCompanies.vue';
import LinkedConversations from '../components/LinkedConversations.vue';
import LinkedPeople from '../components/LinkedPeople.vue';
import TagChip from '../components/TagChip.vue';
import TagInput from '../components/TagInput.vue';
import TaskNotes from '../components/TaskNotes.vue';

const route = useRoute();
const router = useRouter();
const task = ref<TaskDetail | null>(null);
const tagError = ref('');
const laneError = ref('');
const deleteError = ref('');
const archiveError = ref('');
const isConfirmingDelete = ref(false);
let laneMoveChain: Promise<void> = Promise.resolve();
let queuedLane: string | null = null;

async function fetchTask(): Promise<void> {
  const response = await fetch(`/api/tasks/${route.params.id}`);
  task.value = await response.json();
}

async function moveToLane(targetLane: string): Promise<void> {
  if (!task.value || targetLane === (queuedLane ?? task.value.lane)) return;
  queuedLane = targetLane;
  laneMoveChain = laneMoveChain.then(async () => {
    try {
      const response = await fetch(`/api/tasks/${task.value!.id}/placement`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lane: targetLane, index: Number.MAX_SAFE_INTEGER }),
      });
      const body = await response.json();
      if (!response.ok) {
        laneError.value = body.error.message;
        return;
      }
      laneError.value = '';
      if (task.value) {
        task.value.lane = body.lane;
        task.value.position = body.position;
      }
    } catch {
      laneError.value = "Couldn't move that card — please try again.";
    } finally {
      if (queuedLane === targetLane) queuedLane = null;
    }
  });
  await laneMoveChain;
}

function onUpdatePeople(people: LinkedPerson[]): void {
  if (task.value) {
    task.value.people = people;
  }
}

function onUpdateCompanies(companies: Company[]): void {
  if (task.value) {
    task.value.companies = companies;
  }
}

function onUpdateNotes(notes: Note[]): void {
  if (task.value) {
    task.value.notes = notes;
  }
}

async function attachTag(tagId: number): Promise<void> {
  if (!task.value) return;
  const response = await fetch(`/api/tasks/${task.value.id}/tags`, {
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
  task.value.tags = body.tags;
}

async function createAndAttachTag(name: string): Promise<void> {
  if (!task.value) return;
  const response = await fetch(`/api/tasks/${task.value.id}/tags`, {
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
  task.value.tags = body.tags;
}

async function detachTag(tag: Tag): Promise<void> {
  if (!task.value) return;
  const response = await fetch(`/api/tasks/${task.value.id}/tags/${tag.id}`, { method: 'DELETE' });
  const body = await response.json();
  if (!response.ok) {
    tagError.value = body.error.message;
    return;
  }
  tagError.value = '';
  task.value.tags = body.tags;
}

async function archiveCard(): Promise<void> {
  if (!task.value) return;
  try {
    const response = await fetch(`/api/tasks/${task.value.id}/archive`, { method: 'POST' });
    if (!response.ok) {
      const body = await response.json();
      archiveError.value = body.error.message;
      return;
    }
    archiveError.value = '';
    await router.push('/');
  } catch {
    archiveError.value = "Couldn't archive that card — please try again.";
  }
}

async function unarchiveCard(): Promise<void> {
  if (!task.value) return;
  try {
    const response = await fetch(`/api/tasks/${task.value.id}/unarchive`, { method: 'POST' });
    if (!response.ok) {
      const body = await response.json();
      archiveError.value = body.error.message;
      return;
    }
    archiveError.value = '';
    if (task.value) {
      task.value.archived = false;
    }
  } catch {
    archiveError.value = "Couldn't unarchive that card — please try again.";
  }
}

function requestDelete(): void {
  deleteError.value = '';
  isConfirmingDelete.value = true;
}

function cancelDelete(): void {
  deleteError.value = '';
  isConfirmingDelete.value = false;
}

/**
 * Returns whether the modal should close (naive-ui's NModal only auto-closes on
 * positive-click when the handler resolves to a non-`false` value — returning `false`
 * on failure keeps it open so the inline error is visible, per contracts/http-api.md).
 */
async function confirmDelete(): Promise<boolean> {
  if (!task.value) return false;
  try {
    const response = await fetch(`/api/tasks/${task.value.id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      const body = await response.json();
      deleteError.value = body.error.message;
      return false;
    }
    deleteError.value = '';
    isConfirmingDelete.value = false;
    await router.push('/');
    return true;
  } catch {
    deleteError.value = "Couldn't delete that card — please try again.";
    return false;
  }
}

onMounted(fetchTask);
</script>

<template>
  <section v-if="task" class="task-detail">
    <div class="task-detail-header">
      <h2 class="task-title">{{ task.title }}</h2>
      <div class="task-detail-header-actions">
        <button v-if="!task.archived" type="button" class="archive-card-button" data-testid="archive-card-button" @click="archiveCard">Archive</button>
        <button v-else type="button" class="archive-card-button" data-testid="unarchive-card-button" @click="unarchiveCard">Unarchive</button>
        <button type="button" class="delete-card-button" data-testid="delete-card-button" @click="requestDelete">Delete</button>
      </div>
    </div>
    <p v-if="archiveError" role="alert" class="archive-error">{{ archiveError }}</p>
    <div class="lane-pills" role="group" aria-label="Lane">
      <button
        v-for="lane in task.lanes"
        :key="lane"
        type="button"
        class="lane-pill"
        :class="{ 'lane-pill-current': lane === task.lane }"
        data-testid="lane-pill"
        :aria-current="lane === task.lane ? 'true' : undefined"
        :disabled="lane === task.lane"
        @click="moveToLane(lane)"
      >
        {{ lane }}
      </button>
    </div>
    <p v-if="laneError" role="alert" class="lane-error">{{ laneError }}</p>
    <DeleteCardConfirm v-if="isConfirmingDelete" :title="task.title" :error="deleteError" :on-confirm="confirmDelete" @cancel="cancelDelete" />
    <div class="task-detail-section">
      <h3>People</h3>
      <LinkedPeople :task-id="task.id" :people="task.people" @update:people="onUpdatePeople" />
    </div>
    <div class="task-detail-section">
      <h3>Companies</h3>
      <LinkedCompanies :task-id="task.id" :companies="task.companies" @update:companies="onUpdateCompanies" />
    </div>
    <div class="task-detail-section">
      <h3>Emails</h3>
      <LinkedConversations :conversations="task.conversations" />
    </div>
    <div class="task-detail-section">
      <h3>Notes</h3>
      <TaskNotes :task-id="task.id" :notes="task.notes" @update:notes="onUpdateNotes" />
    </div>
    <div class="task-detail-section">
      <h3>Tags</h3>
      <div class="task-detail-tags">
        <TagChip v-for="tag in task.tags" :key="tag.id" :tag="tag" removable @remove="detachTag(tag)" />
      </div>
      <p v-if="tagError" role="alert" class="task-detail-tag-error">{{ tagError }}</p>
      <TagInput :attached-tags="task.tags" @attach="attachTag" @create="createAndAttachTag" />
    </div>
  </section>
</template>

<style scoped>
.task-detail {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
}

.task-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.task-title {
  overflow-wrap: break-word;
  word-break: break-word;
}

.task-detail-header-actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.5rem;
}

.archive-card-button {
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--wh-border-subtle);
  background: var(--wh-surface);
  color: var(--wh-text-primary);
  cursor: pointer;
}

.delete-card-button {
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--wh-border-subtle);
  background: var(--wh-surface);
  color: var(--wh-error);
  cursor: pointer;
}

.archive-error {
  margin: 0.4rem 0 0;
  color: var(--wh-error);
  font-size: 0.8rem;
}

.lane-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.lane-pill {
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--wh-border-subtle);
  background: var(--wh-surface);
  color: var(--wh-text-secondary);
  cursor: pointer;
}

.lane-pill:disabled {
  cursor: default;
  border-color: transparent;
  background: rgba(59, 130, 246, 0.2);
  color: var(--wh-link-hover);
}

.lane-error {
  margin: 0.4rem 0 0;
  color: var(--wh-error);
  font-size: 0.8rem;
}

.task-detail-section {
  margin-top: 1.25rem;
}

.task-detail-section h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--wh-text-muted);
  margin-bottom: 0.5rem;
}

.task-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.task-detail-tag-error {
  margin: 0 0 0.6rem;
  color: var(--wh-error);
  font-size: 0.8rem;
}
</style>
