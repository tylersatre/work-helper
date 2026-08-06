<script setup lang="ts">
import { ref } from 'vue';
import type { Task } from '../../shared/types.js';
import { titleSchema } from '../../shared/validation.js';

const emit = defineEmits<{ created: [task: Task] }>();

const title = ref('');
const note = ref('');
const validationMessage = ref('');

async function onSubmit(): Promise<void> {
  const result = titleSchema.safeParse(title.value);
  if (!result.success) {
    validationMessage.value = 'Title is required';
    return;
  }

  validationMessage.value = '';

  const trimmedNote = note.value.trim();
  const body: { title: string; note?: string } = { title: title.value };
  if (trimmedNote !== '') {
    body.note = note.value;
  }

  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return;
  }

  const task: Task = await response.json();
  title.value = '';
  note.value = '';
  emit('created', task);
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <label for="task-title">Title</label>
    <input id="task-title" v-model="title" type="text" name="title" />
    <label for="task-create-note">Note</label>
    <textarea id="task-create-note" v-model="note" name="note"></textarea>
    <button type="submit">Add task</button>
    <p v-if="validationMessage" role="alert">{{ validationMessage }}</p>
  </form>
</template>
