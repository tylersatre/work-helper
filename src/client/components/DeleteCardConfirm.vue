<script setup lang="ts">
import { NModal } from 'naive-ui';

const props = defineProps<{ title: string; onConfirm: () => Promise<boolean> }>();

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
    :content="`“${props.title}” will be permanently deleted. This can't be undone.`"
    positive-text="Delete"
    negative-text="Cancel"
    @positive-click="props.onConfirm"
    @negative-click="emit('cancel')"
    @update:show="onDialogShowChange"
  />
</template>
