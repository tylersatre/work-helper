<script setup lang="ts">
import { NModal } from 'naive-ui';
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
const noteIdPendingDeletion = ref<number | null>(null);

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

function onDeleteRequest(noteId: number): void {
  noteIdPendingDeletion.value = noteId;
}

function cancelDeletion(): void {
  noteIdPendingDeletion.value = null;
}

async function confirmDeletion(): Promise<void> {
  const noteId = noteIdPendingDeletion.value;
  if (noteId === null) {
    return;
  }

  const response = await fetch(`/api/tasks/${props.taskId}/notes/${noteId}`, { method: 'DELETE' });
  noteIdPendingDeletion.value = null;
  if (!response.ok) {
    return;
  }

  localNotes.value = localNotes.value.filter((note) => note.id !== noteId);
  emit('update:notes', localNotes.value);
}

function onDialogShowChange(show: boolean): void {
  if (!show) {
    cancelDeletion();
  }
}
</script>

<template>
  <div class="task-notes">
    <ul class="notes-list">
      <NoteItem v-for="note in localNotes" :key="note.id" :note="note" :now="now" @delete-request="onDeleteRequest" />
    </ul>

    <form class="note-form" @submit.prevent="onSubmit">
      <label for="task-note-text">Note</label>
      <textarea id="task-note-text" v-model="text" name="note"></textarea>
      <button type="submit">Add note</button>
      <p v-if="validationMessage" role="alert">{{ validationMessage }}</p>
    </form>

    <NModal
      data-testid="confirm-dialog"
      :show="noteIdPendingDeletion !== null"
      display-directive="if"
      preset="dialog"
      title="Delete this note?"
      content="This can't be undone."
      positive-text="Delete"
      negative-text="Cancel"
      @positive-click="confirmDeletion"
      @negative-click="cancelDeletion"
      @update:show="onDialogShowChange"
    />
  </div>
</template>

<style scoped>
.notes-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.note-form {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
</style>
