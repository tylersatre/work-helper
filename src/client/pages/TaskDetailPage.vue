<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Company, LinkedPerson, Note, Tag, TaskDetail } from '../../shared/types.js';
import LinkedCompanies from '../components/LinkedCompanies.vue';
import LinkedPeople from '../components/LinkedPeople.vue';
import TagChip from '../components/TagChip.vue';
import TagInput from '../components/TagInput.vue';
import TaskNotes from '../components/TaskNotes.vue';

const route = useRoute();
const task = ref<TaskDetail | null>(null);
const tagError = ref('');

async function fetchTask(): Promise<void> {
  const response = await fetch(`/api/tasks/${route.params.id}`);
  task.value = await response.json();
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

onMounted(fetchTask);
</script>

<template>
  <section v-if="task" class="task-detail">
    <h2 class="task-title">{{ task.title }}</h2>
    <p class="task-lane" data-testid="task-lane">Lane: {{ task.lane }}</p>
    <div class="task-detail-section">
      <h3>People</h3>
      <LinkedPeople :task-id="task.id" :people="task.people" @update:people="onUpdatePeople" />
    </div>
    <div class="task-detail-section">
      <h3>Companies</h3>
      <LinkedCompanies :task-id="task.id" :companies="task.companies" @update:companies="onUpdateCompanies" />
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

.task-title {
  overflow-wrap: break-word;
  word-break: break-word;
}

.task-lane {
  font-size: 0.8rem;
  color: var(--wh-text-secondary);
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
