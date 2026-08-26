<script setup lang="ts">
import { NButton, NDatePicker, NInput, NSelect } from 'naive-ui';
import { nextTick, ref } from 'vue';
import type { Task, TaskEffort, TaskPriority } from '../../shared/types.js';
import { taskEffortValues, taskPriorityValues, titleSchema } from '../../shared/validation.js';
import { formatLocalDate } from '../utils/time.js';

const emit = defineEmits<{ created: [task: Task] }>();

const expanded = ref(false);
const title = ref('');
const note = ref('');
const dueDate = ref<number | null>(null);
const priority = ref<TaskPriority | null>(null);
const effort = ref<TaskEffort | null>(null);
const description = ref('');
const validationMessage = ref('');
const titleInputRef = ref<InstanceType<typeof NInput> | null>(null);

const priorityOptions = taskPriorityValues.map((value) => ({ label: value, value }));
const effortOptions = taskEffortValues.map((value) => ({ label: value, value }));

function reset(): void {
  title.value = '';
  note.value = '';
  dueDate.value = null;
  priority.value = null;
  effort.value = null;
  description.value = '';
  validationMessage.value = '';
}

async function expand(): Promise<void> {
  expanded.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}

function collapse(): void {
  expanded.value = false;
  reset();
}

async function onSubmit(): Promise<void> {
  const result = titleSchema.safeParse(title.value);
  if (!result.success) {
    validationMessage.value = 'Title is required';
    return;
  }

  validationMessage.value = '';

  const trimmedNote = note.value.trim();
  const trimmedDescription = description.value.trim();
  const body: {
    title: string;
    note?: string;
    dueDate?: string;
    priority?: TaskPriority;
    effort?: TaskEffort;
    description?: string;
  } = { title: title.value };
  if (trimmedNote !== '') {
    body.note = note.value;
  }
  if (dueDate.value !== null) {
    body.dueDate = formatLocalDate(dueDate.value);
  }
  if (priority.value !== null) {
    body.priority = priority.value;
  }
  if (effort.value !== null) {
    body.effort = effort.value;
  }
  if (trimmedDescription !== '') {
    body.description = description.value;
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
  reset();
  emit('created', task);
}
</script>

<template>
  <div class="add-task">
    <button v-if="!expanded" type="button" class="add-task-toggle" data-testid="add-task-toggle" @click="expand">
      + Add task
    </button>
    <form v-else class="add-task-form" data-testid="add-task-form" @submit.prevent="onSubmit">
      <label class="add-task-label" for="task-title">Title</label>
      <NInput
        ref="titleInputRef"
        v-model:value="title"
        size="small"
        :input-props="{ id: 'task-title', name: 'title' }"
      />
      <p v-if="validationMessage" role="alert" class="add-task-error">{{ validationMessage }}</p>

      <label class="add-task-label" for="task-create-note">Note</label>
      <NInput
        v-model:value="note"
        type="textarea"
        size="small"
        :autosize="{ minRows: 2, maxRows: 4 }"
        :input-props="{ id: 'task-create-note', name: 'note' }"
      />

      <div role="group" aria-label="Due date" class="add-task-group">
        <label class="add-task-label">Due date</label>
        <NDatePicker
          v-model:value="dueDate"
          type="date"
          clearable
          size="small"
          data-testid="create-task-due-date"
        />
      </div>

      <div role="group" aria-label="Priority" class="add-task-group">
        <label class="add-task-label">Priority</label>
        <NSelect
          v-model:value="priority"
          clearable
          size="small"
          :virtual-scroll="false"
          :options="priorityOptions"
          data-testid="create-task-priority"
        />
      </div>

      <div role="group" aria-label="Effort" class="add-task-group">
        <label class="add-task-label">Effort</label>
        <NSelect
          v-model:value="effort"
          clearable
          size="small"
          :virtual-scroll="false"
          :options="effortOptions"
          data-testid="create-task-effort"
        />
      </div>

      <label class="add-task-label" for="task-create-description">Description</label>
      <NInput
        v-model:value="description"
        type="textarea"
        size="small"
        :autosize="{ minRows: 2, maxRows: 4 }"
        :input-props="{ id: 'task-create-description', name: 'description' }"
        data-testid="create-task-description"
      />

      <div class="add-task-actions">
        <NButton attr-type="submit" size="small" type="primary">Add</NButton>
        <NButton size="small" @click="collapse">Cancel</NButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.add-task-toggle {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: transparent;
  color: var(--wh-text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
}

.add-task-toggle:hover {
  border-color: var(--wh-text-muted);
  color: #fff;
}

.add-task-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.add-task-label {
  font-size: 0.72rem;
  color: var(--wh-text-secondary);
}

.add-task-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.add-task-error {
  margin: 0;
  color: var(--wh-error);
  font-size: 0.75rem;
}

.add-task-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.25rem;
}
</style>
