<script setup lang="ts">
import { NModal } from 'naive-ui';
import { palette } from '../palette.js';

const props = defineProps<{ title: string; error?: string; onConfirm: () => Promise<boolean> }>();

const emit = defineEmits<{ cancel: [] }>();

function onDialogShowChange(show: boolean): void {
  if (!show) {
    emit('cancel');
  }
}
</script>

<template>
  <NModal
    data-testid="delete-card-dialog"
    :show="true"
    display-directive="if"
    preset="dialog"
    title="Delete this card?"
    positive-text="Delete"
    negative-text="Cancel"
    @positive-click="props.onConfirm"
    @negative-click="emit('cancel')"
    @update:show="onDialogShowChange"
  >
    <p>&#8220;{{ props.title }}&#8221; will be permanently deleted. This can't be undone.</p>
    <p v-if="props.error" role="alert" class="delete-card-confirm-error" :style="{ color: palette.error }">{{ props.error }}</p>
  </NModal>
</template>

<style scoped>
.delete-card-confirm-error {
  margin: 0.5rem 0 0;
}
</style>
