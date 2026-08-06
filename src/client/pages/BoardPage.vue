<script setup lang="ts">
import { ref } from 'vue';
import Board from '../components/Board.vue';
import CreateTaskForm from '../components/CreateTaskForm.vue';

const board = ref<InstanceType<typeof Board>>();

function onCreated(): void {
  board.value?.fetchBoard();
}
</script>

<template>
  <CreateTaskForm @created="onCreated" />
  <Board ref="board" />
</template>
