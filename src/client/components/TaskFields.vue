<script setup lang="ts">
import { NButton, NDatePicker, NInput, NSelect } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import type { TaskEffort, TaskPriority } from '../../shared/types.js';
import { taskEffortValues, taskPriorityValues } from '../../shared/validation.js';
import { renderNoteMarkdown } from '../utils/markdown.js';
import { formatLocalDate, parseLocalDate } from '../utils/time.js';

const props = defineProps<{
  taskId: number;
  dueDate: string | null;
  priority: TaskPriority | null;
  effort: TaskEffort | null;
  description: string | null;
}>();

const emit = defineEmits<{
  'update:fields': [fields: { dueDate: string | null; priority: TaskPriority | null; effort: TaskEffort | null; description: string | null }];
}>();

const priorityOptions = taskPriorityValues.map((value) => ({ label: value, value }));
const effortOptions = taskEffortValues.map((value) => ({ label: value, value }));

const fieldError = ref('');

const dueDateValue = ref<number | null>(props.dueDate ? parseLocalDate(props.dueDate) : null);
const priorityValue = ref<TaskPriority | null>(props.priority ?? null);
const effortValue = ref<TaskEffort | null>(props.effort ?? null);

watch(
  () => props.dueDate,
  (value) => {
    dueDateValue.value = value ? parseLocalDate(value) : null;
  },
);
watch(
  () => props.priority,
  (value) => {
    priorityValue.value = value ?? null;
  },
);
watch(
  () => props.effort,
  (value) => {
    effortValue.value = value ?? null;
  },
);

const isEditingDescription = ref(false);
const descriptionDraft = ref('');
const renderedDescription = computed(() => renderNoteMarkdown(props.description ?? ''));

function revertField(key: 'dueDate' | 'priority' | 'effort' | 'description'): void {
  if (key === 'dueDate') dueDateValue.value = props.dueDate ? parseLocalDate(props.dueDate) : null;
  if (key === 'priority') priorityValue.value = props.priority ?? null;
  if (key === 'effort') effortValue.value = props.effort ?? null;
}

async function patchField(key: 'dueDate' | 'priority' | 'effort' | 'description', value: string | null): Promise<void> {
  try {
    const response = await fetch(`/api/tasks/${props.taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    const body = await response.json();

    if (!response.ok) {
      fieldError.value = body.error.message;
      revertField(key);
      return;
    }

    fieldError.value = '';
    emit('update:fields', {
      dueDate: key === 'dueDate' ? value : props.dueDate,
      priority: key === 'priority' ? (value as TaskPriority | null) : props.priority,
      effort: key === 'effort' ? (value as TaskEffort | null) : props.effort,
      description: key === 'description' ? value : props.description,
    });
  } catch {
    fieldError.value = "Couldn't save that change — please try again.";
    revertField(key);
  }
}

function onDueDateUpdate(value: number | null): void {
  dueDateValue.value = value;
  void patchField('dueDate', value === null ? null : formatLocalDate(value));
}

function onPriorityUpdate(value: TaskPriority | null): void {
  priorityValue.value = value;
  void patchField('priority', value);
}

function onEffortUpdate(value: TaskEffort | null): void {
  effortValue.value = value;
  void patchField('effort', value);
}

function startEditDescription(): void {
  descriptionDraft.value = props.description ?? '';
  isEditingDescription.value = true;
}

function cancelEditDescription(): void {
  isEditingDescription.value = false;
}

async function saveDescription(): Promise<void> {
  const trimmed = descriptionDraft.value.trim();
  const value = trimmed === '' ? null : descriptionDraft.value;
  await patchField('description', value);
  isEditingDescription.value = false;
}
</script>

<template>
  <div class="task-fields">
    <div class="task-field" role="group" aria-label="Due date">
      <span class="task-field-name">Due date</span>
      <span v-if="!dueDate" data-testid="due-date-unset" class="task-field-unset">No due date</span>
      <NDatePicker
        v-model:value="dueDateValue"
        type="date"
        clearable
        size="small"
        data-testid="due-date-picker"
        @update:value="onDueDateUpdate"
      />
    </div>

    <div class="task-field" role="group" aria-label="Priority">
      <span class="task-field-name">Priority</span>
      <span v-if="!priority" data-testid="priority-unset" class="task-field-unset">No priority</span>
      <NSelect
        v-model:value="priorityValue"
        clearable
        size="small"
        :virtual-scroll="false"
        :options="priorityOptions"
        data-testid="priority-select"
        @update:value="onPriorityUpdate"
      />
    </div>

    <div class="task-field" role="group" aria-label="Effort">
      <span class="task-field-name">Effort</span>
      <span v-if="!effort" data-testid="effort-unset" class="task-field-unset">No effort</span>
      <NSelect
        v-model:value="effortValue"
        clearable
        size="small"
        :virtual-scroll="false"
        :options="effortOptions"
        data-testid="effort-select"
        @update:value="onEffortUpdate"
      />
    </div>

    <div class="task-field" role="group" aria-label="Description">
      <span class="task-field-name">Description</span>
      <template v-if="isEditingDescription">
        <NInput
          v-model:value="descriptionDraft"
          type="textarea"
          size="small"
          :autosize="{ minRows: 2, maxRows: 8 }"
          data-testid="description-textarea"
        />
        <div class="task-field-actions">
          <NButton size="small" data-testid="description-save-button" @click="saveDescription">Save</NButton>
          <NButton size="small" data-testid="description-cancel-button" @click="cancelEditDescription">Cancel</NButton>
        </div>
      </template>
      <template v-else-if="!description">
        <span data-testid="description-unset" class="task-field-unset">No description</span>
        <NButton size="small" data-testid="description-add-button" @click="startEditDescription">Add description</NButton>
      </template>
      <template v-else>
        <div class="task-description-rendered" data-testid="description-rendered" v-html="renderedDescription"></div>
        <NButton size="small" data-testid="description-edit-button" @click="startEditDescription">Edit</NButton>
      </template>
    </div>

    <p v-if="fieldError" role="alert" class="task-fields-error">{{ fieldError }}</p>
  </div>
</template>

<style scoped>
.task-fields {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.task-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.task-field-name {
  font-size: 0.72rem;
  color: var(--wh-text-secondary);
  min-width: 4.5rem;
}

.task-field-unset {
  font-size: 0.8rem;
  color: var(--wh-text-muted);
}

.task-field-actions {
  display: flex;
  gap: 0.4rem;
}

.task-description-rendered {
  font-size: 0.85rem;
  line-height: 1.4;
}

.task-fields-error {
  margin: 0;
  color: var(--wh-error);
  font-size: 0.8rem;
}
</style>
