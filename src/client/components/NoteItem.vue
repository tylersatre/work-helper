<script setup lang="ts">
import { computed } from 'vue';
import type { Note } from '../../shared/types.js';
import { renderNoteMarkdown } from '../utils/markdown.js';
import { absoluteLocal, relativeTime } from '../utils/time.js';

const props = defineProps<{ note: Note; now: number }>();

const emit = defineEmits<{ 'delete-request': [noteId: number] }>();

const sourceLabel = computed(() => (props.note.source === 'ui' ? 'You' : 'via MCP'));
const isoDatetime = computed(() => new Date(props.note.createdAt).toISOString());
const hoverTitle = computed(() => absoluteLocal(props.note.createdAt));
const relativeLabel = computed(() => relativeTime(props.note.createdAt, props.now));
const renderedText = computed(() => renderNoteMarkdown(props.note.text));

function onDelete(): void {
  emit('delete-request', props.note.id);
}
</script>

<template>
  <li class="note" data-testid="note">
    <div class="note-meta">
      <span class="note-source" data-testid="note-source">{{ sourceLabel }}</span>
      <time class="note-time" :datetime="isoDatetime" :title="hoverTitle">{{ relativeLabel }}</time>
    </div>
    <div class="note-text" v-html="renderedText"></div>
    <button type="button" class="note-delete" @click="onDelete">Delete</button>
  </li>
</template>

<style scoped>
.note {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  margin-bottom: 0.5rem;
  background: var(--wh-surface);
  overflow-wrap: break-word;
  word-break: break-word;
}

.note-meta {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.72rem;
  color: var(--wh-text-muted);
  margin-bottom: 0.25rem;
}

.note-text {
  font-size: 0.85rem;
  line-height: 1.4;
}

.note-delete {
  margin-top: 0.35rem;
  background: transparent;
  border: none;
  color: var(--wh-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}

.note-delete:hover {
  color: var(--wh-error);
}
</style>
