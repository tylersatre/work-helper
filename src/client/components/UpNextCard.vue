<script setup lang="ts">
import { ref } from 'vue';
import type { DashboardCard, DashboardShowToggles } from '../../shared/types.js';
import { noteTextSchema } from '../../shared/validation.js';
import { relativeTime } from '../utils/time.js';
import TagChip from './TagChip.vue';

const props = defineProps<{ card: DashboardCard; show: DashboardShowToggles; now: number }>();

const emit = defineEmits<{ 'quick-done': [taskId: number]; 'add-note': [taskId: number, text: string]; open: [taskId: number] }>();

const noteText = ref('');
const noteValidationMessage = ref('');

const linkNames = () => [...props.card.people.map((p) => p.name), ...props.card.companies.map((c) => c.name)];

function onQuickDone(event: MouseEvent): void {
  event.stopPropagation();
  emit('quick-done', props.card.id);
}

function onSubmitNote(event: Event): void {
  event.stopPropagation();
  const result = noteTextSchema.safeParse(noteText.value);
  if (!result.success) {
    noteValidationMessage.value = 'Note text is required';
    return;
  }
  noteValidationMessage.value = '';
  emit('add-note', props.card.id, noteText.value);
  noteText.value = '';
}
</script>

<template>
  <li class="up-next-card" data-testid="up-next-card" @click="emit('open', card.id)">
    <div class="up-next-card-title" data-testid="up-next-card-title">{{ card.title }}</div>
    <div v-if="show.lane" class="up-next-card-lane" data-testid="up-next-card-lane">{{ card.lane }}</div>
    <div v-if="show.tags && card.tags.length > 0" class="up-next-card-tags">
      <TagChip v-for="tag in card.tags" :key="tag.id" :tag="tag" />
    </div>
    <div v-if="show.latestNote && card.latestNote" class="up-next-card-note" data-testid="up-next-note-snippet">
      <span class="up-next-note-text">{{ card.latestNote.text }}</span>
      <span class="up-next-note-time">{{ relativeTime(card.latestNote.createdAt, now) }}</span>
    </div>
    <div v-if="show.links && linkNames().length > 0" class="up-next-card-links" data-testid="up-next-card-links">
      {{ linkNames().join(', ') }}
    </div>
    <div class="up-next-card-actions" @click.stop>
      <button type="button" class="up-next-quick-done" data-testid="up-next-quick-done" @click="onQuickDone">Done</button>
      <form class="up-next-note-form" @submit.prevent="onSubmitNote">
        <input
          v-model="noteText"
          type="text"
          class="up-next-note-input"
          data-testid="up-next-note-input"
          placeholder="Add a note"
          @click.stop
        />
        <button type="submit" class="up-next-note-submit" data-testid="up-next-note-submit">Add note</button>
      </form>
      <p v-if="noteValidationMessage" role="alert" class="up-next-note-error">{{ noteValidationMessage }}</p>
    </div>
  </li>
</template>

<style scoped>
.up-next-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.75rem;
  cursor: pointer;
}

.up-next-card-title {
  font-weight: 600;
  overflow-wrap: break-word;
  word-break: break-word;
}

.up-next-card-lane,
.up-next-card-links {
  font-size: 0.78rem;
  color: var(--wh-text-secondary);
}

.up-next-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.up-next-card-note {
  display: flex;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--wh-text-secondary);
}

.up-next-note-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 32rem;
}

.up-next-note-time {
  flex-shrink: 0;
  color: var(--wh-text-muted);
}

.up-next-card-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.2rem;
}

.up-next-quick-done {
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  border: 1px solid var(--wh-border-subtle);
  background: var(--wh-surface);
  color: var(--wh-text-primary);
  cursor: pointer;
}

.up-next-note-form {
  display: flex;
  gap: 0.35rem;
  flex: 1;
  min-width: 12rem;
}

.up-next-note-input {
  flex: 1;
  font-size: 0.8rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  border: 1px solid var(--wh-border-subtle);
  background: var(--wh-surface);
  color: var(--wh-text-primary);
}

.up-next-note-submit {
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  border: 1px solid var(--wh-border-subtle);
  background: var(--wh-surface);
  color: var(--wh-text-primary);
  cursor: pointer;
}

.up-next-note-error {
  margin: 0;
  width: 100%;
  color: var(--wh-error);
  font-size: 0.75rem;
}
</style>
