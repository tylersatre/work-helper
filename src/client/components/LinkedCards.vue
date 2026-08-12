<script setup lang="ts">
import { NEmpty } from 'naive-ui';
import type { LinkedCardSummary } from '../../shared/types.js';

defineProps<{ cards: LinkedCardSummary[] }>();
</script>

<template>
  <NEmpty v-if="cards.length === 0" data-testid="linked-cards-empty" description="No linked cards" />
  <ul v-else class="linked-cards wh-card-list">
    <li v-for="card in cards" :key="card.id" class="linked-card-row" data-testid="linked-card">
      <RouterLink :to="`/tasks/${card.id}`" class="linked-card-link">
        <span class="linked-card-title">{{ card.title }}</span>
        <span class="linked-card-lane">{{ card.lane }}</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.linked-card-row {
  padding: 0;
}

.linked-card-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: inherit;
  text-decoration: none;
}

.linked-card-title {
  font-size: 0.9rem;
  color: var(--wh-text-primary);
}

.linked-card-lane {
  font-size: 0.75rem;
  color: var(--wh-text-muted);
}
</style>
