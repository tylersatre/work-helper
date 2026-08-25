<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import TaskDetail from '../components/TaskDetail.vue';

const route = useRoute();
const router = useRouter();

function goHome(): void {
  void router.push('/');
}
</script>

<template>
  <TaskDetail :task-id="Number(route.params.id)" @archived="goHome" @deleted="goHome" />
</template>
