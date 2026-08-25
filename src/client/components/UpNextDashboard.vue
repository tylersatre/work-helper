<script setup lang="ts">
import { NModal } from 'naive-ui';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { DashboardResponse, DashboardSavedView } from '../../shared/types.js';
import { effectiveView, selectCards, tagOptions as computeTagOptions } from '../utils/up-next-view.js';
import TaskDetail from './TaskDetail.vue';
import UpNextCard from './UpNextCard.vue';
import UpNextDisplayPopup from './UpNextDisplayPopup.vue';
import UpNextFilterPopup from './UpNextFilterPopup.vue';

const POLL_INTERVAL_MS = 45_000;
const NOW_TICK_MS = 30_000;

const payload = ref<DashboardResponse | null>(null);
const now = ref(Date.now());
const errorMessage = ref<string | null>(null);
const activePopup = ref<'display' | 'filter' | null>(null);
const pendingView = ref<DashboardSavedView | null>(null);
const openTaskId = ref<number | null>(null);
const existingTagIds = ref<number[]>([]);

async function fetchDashboard(): Promise<void> {
  const response = await fetch('/api/dashboard');
  if (!response.ok) {
    throw new Error(`Failed to load dashboard: ${response.status}`);
  }
  payload.value = await response.json();
}

function fetchExistingTagIds(): void {
  void fetch('/api/tags')
    .then((response) => (response.ok ? (response.json() as Promise<{ id: number }[]>) : []))
    .then((tags) => {
      if (!Array.isArray(tags)) return;
      existingTagIds.value = tags.map((tag) => tag.id);
    })
    .catch(() => {
      // Existing-tag list unavailable: a saved tag filter falls back to being dropped, same as a
      // genuinely deleted tag, until the next successful fetch.
    });
}

const view = computed(() => {
  if (!payload.value) return null;
  return effectiveView(payload.value.savedView, { lanes: payload.value.lanes, defaultLanes: payload.value.defaultLanes }, existingTagIds.value);
});

const previewView = computed(() => pendingView.value ?? view.value);

const cards = computed(() => {
  if (!payload.value || !previewView.value) return [];
  return selectCards(payload.value.cards, previewView.value);
});

const tagOptions = computed(() => (payload.value ? computeTagOptions(payload.value.cards) : []));

const noMatches = computed(() => view.value !== null && cards.value.length === 0);

async function onQuickDone(taskId: number): Promise<void> {
  if (!payload.value) return;
  try {
    const response = await fetch(`/api/tasks/${taskId}/placement`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lane: payload.value.quickDoneLane, index: Number.MAX_SAFE_INTEGER }),
    });
    if (!response.ok) {
      const body = await response.json();
      errorMessage.value = body.error?.message ?? "Couldn't complete that action — please try again.";
    } else {
      errorMessage.value = null;
    }
  } catch {
    errorMessage.value = "Couldn't complete that action — please try again.";
  }
  await fetchDashboard().catch(() => {
    // Refetch failed: the list keeps showing its last-known-good state.
  });
}

async function onAddNote(taskId: number, text: string, onSettled: (ok: boolean) => void): Promise<void> {
  try {
    const response = await fetch(`/api/tasks/${taskId}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const body = await response.json();
      errorMessage.value = body.error?.message ?? "Couldn't add that note — please try again.";
      onSettled(false);
    } else {
      errorMessage.value = null;
      onSettled(true);
    }
  } catch {
    errorMessage.value = "Couldn't add that note — please try again.";
    onSettled(false);
  }
  await fetchDashboard().catch(() => {
    // Refetch failed: the list keeps showing its last-known-good state.
  });
}

function dismissError(): void {
  errorMessage.value = null;
}

function openDisplayPopup(): void {
  activePopup.value = 'display';
}

function openFilterPopup(): void {
  activePopup.value = 'filter';
}

function onPopupShowUpdate(show: boolean): void {
  if (!show) {
    activePopup.value = null;
    pendingView.value = null;
  }
}

function onPopupPendingUpdate(next: DashboardSavedView): void {
  pendingView.value = next;
}

async function onPopupOk(mergedView: DashboardSavedView): Promise<void> {
  try {
    const response = await fetch('/api/dashboard/view', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mergedView),
    });
    if (!response.ok) {
      const body = await response.json();
      errorMessage.value = body.error?.message ?? "Couldn't save the view — please try again.";
      return;
    }
  } catch {
    errorMessage.value = "Couldn't save the view — please try again.";
    return;
  }
  errorMessage.value = null;
  activePopup.value = null;
  pendingView.value = null;
  await fetchDashboard().catch(() => {
    // Refetch failed: the list keeps showing its last-known-good state.
  });
}

function openOverlay(taskId: number): void {
  openTaskId.value = taskId;
}

function closeOverlay(): void {
  openTaskId.value = null;
  void fetchDashboard().catch(() => {
    // Refetch failed: the list keeps showing its last-known-good state.
  });
}

function onOverlayShowUpdate(show: boolean): void {
  if (!show) {
    closeOverlay();
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined;
let nowTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void fetchDashboard().catch(() => {
    // Initial load failed: the page stays empty rather than crashing.
  });
  fetchExistingTagIds();
  pollTimer = setInterval(() => {
    void fetchDashboard().catch(() => {
      // Poll failed silently: keep showing the last-good payload and retry on the next tick (FR-022).
    });
  }, POLL_INTERVAL_MS);
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, NOW_TICK_MS);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (nowTimer) clearInterval(nowTimer);
});
</script>

<template>
  <div class="up-next-dashboard">
    <div v-if="errorMessage" class="up-next-error-banner" data-testid="up-next-error-banner">
      {{ errorMessage }}
      <button type="button" @click="dismissError">Dismiss</button>
    </div>
    <div v-if="payload" class="up-next-toolbar">
      <button type="button" data-testid="up-next-open-display" @click="openDisplayPopup">Display</button>
      <button type="button" data-testid="up-next-open-filter" @click="openFilterPopup">Filter</button>
    </div>
    <p v-if="noMatches" class="up-next-no-match" data-testid="up-next-no-match">No cards match</p>
    <ul v-if="view" class="wh-card-list up-next-list">
      <UpNextCard
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :show="previewView!.show"
        :now="now"
        @quick-done="onQuickDone"
        @add-note="onAddNote"
        @open="openOverlay"
      />
    </ul>

    <UpNextDisplayPopup
      v-if="activePopup === 'display' && view"
      :show="true"
      :view="view"
      @update:show="onPopupShowUpdate"
      @update:pending="onPopupPendingUpdate"
      @ok="onPopupOk"
    />
    <UpNextFilterPopup
      v-if="activePopup === 'filter' && view && payload"
      :show="true"
      :view="view"
      :config-lanes="payload.lanes"
      :tag-options="tagOptions"
      @update:show="onPopupShowUpdate"
      @update:pending="onPopupPendingUpdate"
      @ok="onPopupOk"
    />

    <NModal
      :show="openTaskId !== null"
      display-directive="if"
      preset="card"
      style="width: 680px"
      closable
      data-testid="up-next-overlay"
      @update:show="onOverlayShowUpdate"
      @close="closeOverlay"
    >
      <TaskDetail v-if="openTaskId !== null" :key="openTaskId" :task-id="openTaskId" @archived="closeOverlay" @deleted="closeOverlay" />
    </NModal>
  </div>
</template>

<style scoped>
.up-next-dashboard {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.up-next-list {
  margin: 0;
}

.up-next-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.up-next-no-match {
  color: var(--wh-text-secondary);
  font-size: 0.85rem;
}

.up-next-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  margin: 0 0 0.75rem;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--wh-error);
  border: 1px solid rgba(239, 68, 68, 0.4);
}
</style>
