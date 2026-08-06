<script setup lang="ts">
import { ref } from 'vue';
import Board from './components/Board.vue';
import CreateTaskForm from './components/CreateTaskForm.vue';

const board = ref<InstanceType<typeof Board>>();

function onCreated(): void {
  board.value?.fetchBoard();
}
</script>

<template>
  <main>
    <h1>work-helper</h1>
    <CreateTaskForm @created="onCreated" />
    <Board ref="board" />
  </main>
</template>
