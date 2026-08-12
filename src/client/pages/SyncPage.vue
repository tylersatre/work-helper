<script setup lang="ts">
import { NButton, NDatePicker, NEmpty } from 'naive-ui';
import { onMounted, ref } from 'vue';
import MailboxPanel from '../components/MailboxPanel.vue';

interface SyncRunView {
  id: number;
  ranAt: number;
  startDate: string;
  endDate: string;
  source: 'web' | 'mcp';
  status: 'success' | 'failure';
  newCount: number;
  updatedCount: number;
  error: string | null;
}

function localMidnight(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function formatLocalDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function parseLocalDate(value: string): number {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

const runs = ref<SyncRunView[]>([]);
const startValue = ref<number | null>(localMidnight(daysAgo(30)));
const endValue = ref<number | null>(localMidnight(new Date()));
const validationError = ref('');
const result = ref<SyncRunView | null>(null);
const syncing = ref(false);

function applyPrefill(): void {
  const newestSuccess = runs.value.find((r) => r.status === 'success');
  startValue.value = newestSuccess ? parseLocalDate(newestSuccess.endDate) : localMidnight(daysAgo(30));
  endValue.value = localMidnight(new Date());
}

async function fetchRuns(): Promise<void> {
  const response = await fetch('/api/email-sync/runs');
  const body = (await response.json()) as { runs: SyncRunView[] };
  runs.value = body.runs;
}

onMounted(async () => {
  await fetchRuns();
  applyPrefill();
});

async function onSync(): Promise<void> {
  validationError.value = '';
  result.value = null;

  if (startValue.value == null || endValue.value == null) {
    validationError.value = 'A start date and end date are required';
    return;
  }
  if (startValue.value > endValue.value) {
    validationError.value = 'Start date must not be after end date';
    return;
  }

  const startDate = formatLocalDate(startValue.value);
  const endDate = formatLocalDate(endValue.value);

  syncing.value = true;
  try {
    let response: Response;
    try {
      response = await fetch('/api/email-sync/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
    } catch {
      validationError.value = 'Could not reach the server — try again';
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorField = body && typeof body === 'object' && 'error' in body ? (body as { error: unknown }).error : undefined;
      const message = typeof errorField === 'string' ? errorField : (errorField as { message?: string } | undefined)?.message;
      validationError.value = message ?? 'Sync failed — try again';
      return;
    }

    result.value = body as SyncRunView;
    await fetchRuns();
  } finally {
    syncing.value = false;
  }
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString();
}
</script>

<template>
  <section class="sync-page">
    <h2>Email Sync</h2>

    <MailboxPanel />

    <form class="sync-form" @submit.prevent="onSync">
      <NDatePicker v-model:value="startValue" type="date" clearable size="small" />
      <span>to</span>
      <NDatePicker v-model:value="endValue" type="date" clearable size="small" />
      <NButton attr-type="submit" size="small" type="primary" :loading="syncing" :disabled="syncing">Sync</NButton>
      <span v-if="syncing" data-testid="sync-in-progress">Syncing…</span>
    </form>

    <p v-if="validationError" data-testid="sync-validation-error" role="alert" class="sync-page-error">{{ validationError }}</p>

    <div v-if="result" data-testid="sync-result" class="sync-result">
      <template v-if="result.status === 'success'">{{ result.newCount }} new, {{ result.updatedCount }} updated</template>
      <template v-else>Sync failed: {{ result.error }}</template>
    </div>

    <NEmpty v-if="runs.length === 0" data-testid="sync-history-empty" description="No syncs yet" class="sync-history-empty" />

    <ul v-else class="sync-history-list">
      <li v-for="historyRun in runs" :key="historyRun.id" data-testid="sync-history-row" class="sync-history-row">
        <span>{{ formatWhen(historyRun.ranAt) }}</span>
        <span>{{ historyRun.startDate }} – {{ historyRun.endDate }}</span>
        <span>{{ historyRun.source }}</span>
        <span>{{ historyRun.status }}</span>
        <span>{{ historyRun.newCount }} new / {{ historyRun.updatedCount }} updated</span>
        <span v-if="historyRun.error">{{ historyRun.error }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.sync-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.sync-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.sync-page-error {
  margin: 0 0 1rem;
  color: var(--wh-error);
  font-size: 0.8rem;
}

.sync-result {
  margin-bottom: 1rem;
}

.sync-history-empty {
  margin-top: 1.5rem;
}

.sync-history-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sync-history-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: var(--wh-surface);
  font-size: 0.85rem;
}
</style>
