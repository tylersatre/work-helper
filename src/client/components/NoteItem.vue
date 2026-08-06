<script setup lang="ts">
import { computed } from 'vue';
import type { Note } from '../../shared/types.js';
import { renderNoteMarkdown } from '../utils/markdown.js';
import { absoluteLocal, relativeTime } from '../utils/time.js';

const props = defineProps<{ note: Note; now: number }>();

const emit = defineEmits<{ delete: [noteId: number] }>();

const sourceLabel = computed(() => (props.note.source === 'ui' ? 'You' : 'via MCP'));
const isoDatetime = computed(() => new Date(props.note.createdAt).toISOString());
const hoverTitle = computed(() => absoluteLocal(props.note.createdAt));
const relativeLabel = computed(() => relativeTime(props.note.createdAt, props.now));
const renderedText = computed(() => renderNoteMarkdown(props.note.text));

function onDelete(): void {
  if (window.confirm('Delete this note?')) {
    emit('delete', props.note.id);
  }
}
</script>

<template>
  <li data-testid="note">
    <span data-testid="note-source">{{ sourceLabel }}</span>
    <time :datetime="isoDatetime" :title="hoverTitle">{{ relativeLabel }}</time>
    <div class="note-text" v-html="renderedText"></div>
    <button type="button" @click="onDelete">Delete</button>
  </li>
</template>

<style scoped>
li {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  overflow-wrap: break-word;
  word-break: break-word;
}

.note-text {
  white-space: pre-wrap;
}
</style>
