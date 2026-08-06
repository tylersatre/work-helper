<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BoardView } from '../../shared/types.js';
import Lane from './Lane.vue';

const board = ref<BoardView>({ lanes: [] });

async function fetchBoard(): Promise<void> {
  const response = await fetch('/api/board');
  board.value = await response.json();
}

defineExpose({ fetchBoard });

onMounted(fetchBoard);
</script>

<template>
  <div class="board">
    <Lane v-for="lane in board.lanes" :key="lane.name" :name="lane.name" :tasks="lane.tasks" />
  </div>
</template>

<style scoped>
.board {
  display: flex;
  gap: 1rem;
}
</style>
