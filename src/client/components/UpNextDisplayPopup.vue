<script setup lang="ts">
import { NModal } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import type { DashboardSavedView } from '../../shared/types.js';

const props = defineProps<{ show: boolean; view: DashboardSavedView }>();
const emit = defineEmits<{ 'update:show': [boolean]; 'update:pending': [DashboardSavedView]; ok: [DashboardSavedView] }>();

const pending = ref<DashboardSavedView>(clone(props.view));
const snapshot = ref<DashboardSavedView>(clone(props.view));
const confirmingDiscard = ref(false);

function clone(view: DashboardSavedView): DashboardSavedView {
  return { ...view, lanes: [...view.lanes], tagIds: [...view.tagIds], show: { ...view.show } };
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      pending.value = clone(props.view);
      snapshot.value = clone(props.view);
      confirmingDiscard.value = false;
      emit('update:pending', clone(pending.value));
    }
  },
  { immediate: true },
);

const dirty = computed(() => JSON.stringify(pending.value) !== JSON.stringify(snapshot.value));

function toggle(field: keyof DashboardSavedView['show']): void {
  pending.value.show[field] = !pending.value.show[field];
  emit('update:pending', clone(pending.value));
}

function requestClose(): void {
  if (dirty.value) {
    confirmingDiscard.value = true;
    return;
  }
  emit('update:show', false);
}

function discard(): boolean {
  pending.value = clone(snapshot.value);
  emit('update:pending', clone(pending.value));
  confirmingDiscard.value = false;
  emit('update:show', false);
  return true;
}

function keepEditing(): void {
  confirmingDiscard.value = false;
}

function onOk(): void {
  emit('ok', clone(pending.value));
  emit('update:show', false);
}
</script>

<template>
  <NModal :show="show" display-directive="if" @update:show="(value: boolean) => !value && requestClose()">
    <div class="up-next-popup" data-testid="up-next-display-popup">
      <h3>Display</h3>
      <label class="up-next-toggle-row">
        <input type="checkbox" data-testid="up-next-toggle-tags" :checked="pending.show.tags" @change="toggle('tags')" />
        Tags
      </label>
      <label class="up-next-toggle-row">
        <input type="checkbox" data-testid="up-next-toggle-latestNote" :checked="pending.show.latestNote" @change="toggle('latestNote')" />
        Latest note
      </label>
      <label class="up-next-toggle-row">
        <input type="checkbox" data-testid="up-next-toggle-links" :checked="pending.show.links" @change="toggle('links')" />
        Linked people/companies
      </label>
      <label class="up-next-toggle-row">
        <input type="checkbox" data-testid="up-next-toggle-lane" :checked="pending.show.lane" @change="toggle('lane')" />
        Lane
      </label>
      <div class="up-next-popup-actions">
        <button type="button" @click="requestClose">Cancel</button>
        <button type="button" @click="onOk">OK</button>
      </div>
    </div>
  </NModal>
  <NModal
      data-testid="up-next-discard-confirm"
      :show="confirmingDiscard"
      display-directive="if"
      preset="dialog"
      title="Discard changes?"
      content="Your changes have not been saved."
      positive-text="Discard"
      negative-text="Keep editing"
      @positive-click="discard"
      @negative-click="keepEditing"
    />
</template>

<style scoped>
.up-next-popup {
  background: var(--wh-surface);
  border: 1px solid var(--wh-border);
  border-radius: 8px;
  padding: 1rem;
  min-width: 260px;
}

.up-next-toggle-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
}

.up-next-popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
