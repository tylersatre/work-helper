<script setup lang="ts">
import UpNextDashboard from '../components/UpNextDashboard.vue';
</script>

<template>
  <div class="up-next-page">
    <UpNextDashboard />
  </div>
</template>

<style scoped>
.up-next-page {
  height: 100%;
  min-height: 0;
  overflow: auto;
}
</style>
