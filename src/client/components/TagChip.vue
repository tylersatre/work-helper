<script setup lang="ts">
import type { Tag } from '../../shared/types.js';

withDefaults(defineProps<{ tag: Tag; removable?: boolean }>(), { removable: false });
const emit = defineEmits<{ remove: [tagId: number] }>();
</script>

<template>
  <span class="tag-chip" :style="{ backgroundColor: tag.color }" data-testid="tag-chip">
    {{ tag.name }}
    <button
      v-if="removable"
      type="button"
      class="tag-chip-remove"
      :aria-label="`Remove ${tag.name}`"
      @click="emit('remove', tag.id)"
    >
      ×
    </button>
  </span>
</template>

<style scoped>
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #0b0b0d;
  overflow-wrap: break-word;
  word-break: break-word;
}

.tag-chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font-size: 0.85rem;
  line-height: 1;
  padding: 0;
}
</style>
