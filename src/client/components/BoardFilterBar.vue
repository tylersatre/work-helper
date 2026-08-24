<script setup lang="ts">
import { NButton, NInput, NSelect } from 'naive-ui';
import { computed } from 'vue';
import type { InputHTMLAttributes } from 'vue';

const props = defineProps<{
  text: string;
  tagIds: number[];
  tagOptions: { id: number; name: string }[];
  filterActive: boolean;
  visibleCount: number;
  totalCount: number;
  showArchived: boolean;
}>();

const emit = defineEmits<{
  'update:text': [string];
  'update:tagIds': [number[]];
  'update:showArchived': [boolean];
  clear: [];
}>();

const selectOptions = computed(() => props.tagOptions.map((tag) => ({ label: tag.name, value: tag.id })));

function onTagsUpdate(value: (string | number)[] | null): void {
  emit(
    'update:tagIds',
    (value ?? []).map((v) => Number(v)),
  );
}
</script>

<template>
  <div class="board-filter-bar" data-testid="board-filter-bar">
    <NInput
      :value="text"
      placeholder="Search cards"
      size="small"
      class="board-filter-search"
      :input-props="{ 'data-testid': 'board-search-input' } as InputHTMLAttributes"
      @update:value="(value: string) => emit('update:text', value)"
    />
    <NSelect
      multiple
      :value="tagIds"
      :options="selectOptions"
      :virtual-scroll="false"
      size="small"
      class="board-filter-tags"
      data-testid="board-tag-filter"
      @update:value="onTagsUpdate"
    />
    <span v-if="filterActive" class="board-filter-indicator" data-testid="board-filter-indicator">
      {{ visibleCount }} of {{ totalCount }} cards
    </span>
    <NButton v-if="filterActive" size="small" data-testid="board-clear-filters" @click="emit('clear')">Clear filters</NButton>
    <label class="board-show-archived">
      <input
        type="checkbox"
        data-testid="show-archived-toggle"
        :checked="showArchived"
        @change="emit('update:showArchived', ($event.target as HTMLInputElement).checked)"
      />
      Show archived
    </label>
  </div>
</template>

<style scoped>
.board-filter-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  margin: 0.75rem 0.75rem 0;
  background: var(--wh-surface);
  border: 1px solid var(--wh-border-subtle);
  border-radius: 6px;
}

.board-filter-search {
  max-width: 220px;
}

.board-filter-tags {
  min-width: 200px;
}

.board-filter-indicator {
  font-size: 0.8rem;
  color: var(--wh-text-primary);
  white-space: nowrap;
}

.board-show-archived {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--wh-text-secondary);
  white-space: nowrap;
  cursor: pointer;
  margin-left: auto;
}
</style>
