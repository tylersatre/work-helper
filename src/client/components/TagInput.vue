<script setup lang="ts">
import { NInput } from 'naive-ui';
import { computed, onMounted, ref, watch } from 'vue';
import type { Tag } from '../../shared/types.js';

const props = defineProps<{ attachedTags: Tag[] }>();

const emit = defineEmits<{ attach: [tagId: number]; create: [name: string] }>();

const query = ref('');
const vocabulary = ref<Tag[]>([]);
const validationMessage = ref('');

async function fetchVocabulary(): Promise<void> {
  const response = await fetch('/api/tags');
  vocabulary.value = await response.json();
}

onMounted(fetchVocabulary);
watch(() => props.attachedTags, fetchVocabulary);

const attachedIds = computed(() => new Set(props.attachedTags.map((tag) => tag.id)));

const trimmedQuery = computed(() => query.value.trim());

const suggestions = computed(() => {
  const trimmed = trimmedQuery.value.toLowerCase();
  if (!trimmed) return [];
  return vocabulary.value.filter(
    (tag) => !attachedIds.value.has(tag.id) && tag.name.toLowerCase().includes(trimmed),
  );
});

const exactMatch = computed(() => vocabulary.value.find((tag) => tag.name.toLowerCase() === trimmedQuery.value.toLowerCase()));

const showCreateOption = computed(() => trimmedQuery.value !== '' && !exactMatch.value);

function selectSuggestion(tag: Tag): void {
  emit('attach', tag.id);
  query.value = '';
  validationMessage.value = '';
}

function selectCreate(): void {
  const trimmed = trimmedQuery.value;
  if (!trimmed) {
    validationMessage.value = 'A name is required';
    return;
  }
  emit('create', trimmed);
  query.value = '';
  validationMessage.value = '';
}

function onSubmit(): void {
  const trimmed = trimmedQuery.value;
  if (!trimmed) {
    validationMessage.value = 'A name is required';
    return;
  }
  const match = exactMatch.value;
  if (match && !attachedIds.value.has(match.id)) {
    selectSuggestion(match);
  } else if (!match) {
    selectCreate();
  }
}
</script>

<template>
  <form class="tag-input" @submit.prevent="onSubmit">
    <label class="tag-input-label" for="tag-input-field">Add tag</label>
    <NInput v-model:value="query" size="small" :input-props="{ id: 'tag-input-field', name: 'tag' }" />

    <ul v-if="trimmedQuery && (suggestions.length || showCreateOption)" class="tag-suggestions">
      <li v-for="tag in suggestions" :key="tag.id">
        <button type="button" data-testid="tag-suggestion" @click="selectSuggestion(tag)">{{ tag.name }}</button>
      </li>
      <li v-if="showCreateOption">
        <button type="button" data-testid="tag-create-option" @click="selectCreate">Create "{{ trimmedQuery }}"</button>
      </li>
    </ul>

    <p v-if="validationMessage" role="alert" class="tag-input-error">{{ validationMessage }}</p>
  </form>
</template>

<style scoped>
.tag-input {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tag-input-label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.6);
}

.tag-suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tag-suggestions button {
  width: 100%;
  text-align: left;
  padding: 0.3rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  background: #1f1f24;
  color: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.tag-input-error {
  margin: 0;
  color: #fca5a5;
  font-size: 0.78rem;
}
</style>
