<script setup lang="ts">
import { NModal } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import type { DashboardSavedView } from '../../shared/types.js';

const props = defineProps<{ show: boolean; view: DashboardSavedView; configLanes: string[]; tagOptions: { id: number; name: string }[] }>();
const emit = defineEmits<{ 'update:show': [boolean]; 'update:pending': [DashboardSavedView]; ok: [DashboardSavedView] }>();

const pending = ref<DashboardSavedView>(clone(props.view));
const snapshot = ref<DashboardSavedView>(clone(props.view));
const confirmingDiscard = ref(false);
const limitText = ref(String(props.view.limit));

function clone(view: DashboardSavedView): DashboardSavedView {
  return { ...view, lanes: [...view.lanes], tagIds: [...view.tagIds], show: { ...view.show } };
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      pending.value = clone(props.view);
      snapshot.value = clone(props.view);
      limitText.value = String(props.view.limit);
      confirmingDiscard.value = false;
      emit('update:pending', clone(pending.value));
    }
  },
  { immediate: true },
);

const dirty = computed(() => JSON.stringify(pending.value) !== JSON.stringify(snapshot.value));

const isValid = computed(() => {
  const limit = pending.value.limit;
  return pending.value.lanes.length > 0 && Number.isInteger(limit) && limit >= 1 && limit <= 100;
});

function emitPending(): void {
  emit('update:pending', clone(pending.value));
}

function toggleLane(lane: string): void {
  pending.value.lanes = pending.value.lanes.includes(lane)
    ? pending.value.lanes.filter((l) => l !== lane)
    : [...pending.value.lanes, lane];
  emitPending();
}

function toggleTag(tagId: number): void {
  pending.value.tagIds = pending.value.tagIds.includes(tagId)
    ? pending.value.tagIds.filter((id) => id !== tagId)
    : [...pending.value.tagIds, tagId];
  emitPending();
}

function onTextInput(event: Event): void {
  pending.value.text = (event.target as HTMLInputElement).value;
  emitPending();
}

function onLimitInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  limitText.value = raw;
  pending.value.limit = raw.trim() === '' ? Number.NaN : Number(raw);
  emitPending();
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
  limitText.value = String(snapshot.value.limit);
  emitPending();
  confirmingDiscard.value = false;
  emit('update:show', false);
  return true;
}

function keepEditing(): void {
  confirmingDiscard.value = false;
}

function onOk(): void {
  if (!isValid.value) return;
  emit('ok', clone(pending.value));
  emit('update:show', false);
}
</script>

<template>
  <NModal :show="show" display-directive="if" @update:show="(value: boolean) => !value && requestClose()">
    <div class="up-next-popup" data-testid="up-next-filter-popup">
      <h3>Filter</h3>
      <fieldset class="up-next-filter-group">
        <legend>Lanes</legend>
        <label v-for="lane in configLanes" :key="lane" class="up-next-toggle-row">
          <input
            type="checkbox"
            :data-testid="`up-next-filter-lane-${lane}`"
            :checked="pending.lanes.includes(lane)"
            @change="toggleLane(lane)"
          />
          {{ lane }}
        </label>
      </fieldset>
      <fieldset v-if="tagOptions.length > 0" class="up-next-filter-group">
        <legend>Tags</legend>
        <label v-for="tag in tagOptions" :key="tag.id" class="up-next-toggle-row">
          <input
            type="checkbox"
            :data-testid="`up-next-filter-tag-${tag.id}`"
            :checked="pending.tagIds.includes(tag.id)"
            @change="toggleTag(tag.id)"
          />
          {{ tag.name }}
        </label>
      </fieldset>
      <label class="up-next-filter-field">
        Text
        <input type="text" data-testid="up-next-filter-text" :value="pending.text" @input="onTextInput" />
      </label>
      <label class="up-next-filter-field">
        Limit
        <input type="number" min="1" max="100" step="1" data-testid="up-next-filter-limit" :value="limitText" @input="onLimitInput" />
      </label>
      <div class="up-next-popup-actions">
        <button type="button" @click="requestClose">Cancel</button>
        <button type="button" :disabled="!isValid" @click="onOk">OK</button>
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
  min-width: 280px;
}

.up-next-filter-group {
  border: none;
  padding: 0;
  margin: 0 0 0.75rem;
}

.up-next-toggle-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0;
}

.up-next-filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}

.up-next-popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
