<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { Note } from '../../shared/types.js';
import { noteTextSchema } from '../../shared/validation.js';
import NoteItem from './NoteItem.vue';

const props = defineProps<{ taskId: number; notes: Note[] }>();

const emit = defineEmits<{ 'update:notes': [notes: Note[]] }>();

const localNotes = ref<Note[]>([...props.notes]);
const text = ref('');
const validationMessage = ref('');
const now = ref(Date.now());

let ticker: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});

onUnmounted(() => {
  if (ticker) clearInterval(ticker);
});

async function onSubmit(): Promise<void> {
  const result = noteTextSchema.safeParse(text.value);
  if (!result.success) {
    validationMessage.value = 'Note text is required';
    return;
  }

  validationMessage.value = '';

  const response = await fetch(`/api/tasks/${props.taskId}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.value }),
  });

  if (!response.ok) {
    return;
  }

  const note: Note = await response.json();
  localNotes.value = [note, ...localNotes.value];
  emit('update:notes', localNotes.value);
  text.value = '';
}
</script>

<template>
  <div>
    <ul class="notes-list">
      <NoteItem v-for="note in localNotes" :key="note.id" :note="note" :now="now" />
    </ul>

    <form @submit.prevent="onSubmit">
      <label for="task-note-text">Note</label>
      <textarea id="task-note-text" v-model="text" name="note"></textarea>
      <button type="submit">Add note</button>
      <p v-if="validationMessage" role="alert">{{ validationMessage }}</p>
    </form>
  </div>
</template>

<style scoped>
.notes-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
