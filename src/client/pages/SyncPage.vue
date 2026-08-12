<script setup lang="ts">
import { NButton, NDatePicker, NEmpty } from 'naive-ui';
import { computed, onMounted, onUnmounted, ref } from 'vue';
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

type CalendarSyncRunView = SyncRunView;

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

function daysAhead(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function parseLocalDate(value: string): number {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

// --- Shared: single-flight status polling, disables both sections' Sync buttons (research R8) --

const statusRunning = ref(false);
let statusTimer: ReturnType<typeof setInterval> | null = null;

async function fetchSyncStatus(): Promise<void> {
  try {
    const response = await fetch('/api/sync/status');
    const body = (await response.json()) as { running?: boolean };
    statusRunning.value = body.running === true;
  } catch {
    // Leave statusRunning as-is; the next poll tries again.
  }
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

// --- Calendar sync section (T018, US1) — mirrors the email section above with a rolling ±30-day
// prefill (no history-derived watermark, unlike email) and its own testids/refs. ----------------

const calendarRuns = ref<CalendarSyncRunView[]>([]);
const calendarStartValue = ref<number | null>(localMidnight(daysAgo(30)));
const calendarEndValue = ref<number | null>(localMidnight(daysAhead(30)));
const calendarValidationError = ref('');
const calendarResult = ref<CalendarSyncRunView | null>(null);
const calendarSyncing = ref(false);

// Either section's own in-flight POST, or a sync happening elsewhere per the status poll, disables
// both Sync buttons together (FR-006, research R8) — the in-progress indicator stays per-section.
const anySyncing = computed(() => syncing.value || calendarSyncing.value || statusRunning.value);

async function fetchCalendarRuns(): Promise<void> {
  const response = await fetch('/api/calendar-sync/runs');
  const body = (await response.json()) as { runs?: CalendarSyncRunView[] };
  calendarRuns.value = Array.isArray(body.runs) ? body.runs : [];
}

async function onCalendarSync(): Promise<void> {
  calendarValidationError.value = '';
  calendarResult.value = null;

  if (calendarStartValue.value == null || calendarEndValue.value == null) {
    calendarValidationError.value = 'A start date and end date are required';
    return;
  }
  if (calendarStartValue.value > calendarEndValue.value) {
    calendarValidationError.value = 'Start date must not be after end date';
    return;
  }

  const startDate = formatLocalDate(calendarStartValue.value);
  const endDate = formatLocalDate(calendarEndValue.value);

  calendarSyncing.value = true;
  try {
    let response: Response;
    try {
      response = await fetch('/api/calendar-sync/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
    } catch {
      calendarValidationError.value = 'Could not reach the server — try again';
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
      calendarValidationError.value = message ?? 'Sync failed — try again';
      return;
    }

    calendarResult.value = body as CalendarSyncRunView;
    await fetchCalendarRuns();
  } finally {
    calendarSyncing.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchRuns(), fetchCalendarRuns()]);
  applyPrefill();
  await fetchSyncStatus();
  statusTimer = setInterval(fetchSyncStatus, 3000);
});

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer);
});

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString();
}
</script>

<template>
  <section class="sync-page">
    <h2>Sync</h2>

    <MailboxPanel />

    <h3>Email</h3>

    <form class="sync-form" @submit.prevent="onSync">
      <NDatePicker v-model:value="startValue" type="date" clearable size="small" />
      <span>to</span>
      <NDatePicker v-model:value="endValue" type="date" clearable size="small" />
      <NButton attr-type="submit" size="small" type="primary" :loading="syncing" :disabled="anySyncing">Sync</NButton>
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

    <section class="calendar-sync-section" data-testid="calendar-sync-section">
      <h3>Calendar</h3>

      <form class="calendar-sync-form" @submit.prevent="onCalendarSync">
        <NDatePicker v-model:value="calendarStartValue" type="date" clearable size="small" />
        <span>to</span>
        <NDatePicker v-model:value="calendarEndValue" type="date" clearable size="small" />
        <NButton
          data-testid="calendar-sync-button"
          attr-type="submit"
          size="small"
          type="primary"
          :loading="calendarSyncing"
          :disabled="anySyncing"
        >
          Refresh
        </NButton>
        <span v-if="calendarSyncing" data-testid="calendar-sync-in-progress">Syncing…</span>
      </form>

      <p v-if="calendarValidationError" data-testid="calendar-sync-validation-error" role="alert" class="sync-page-error">
        {{ calendarValidationError }}
      </p>

      <div v-if="calendarResult" data-testid="calendar-sync-result" class="sync-result">
        <template v-if="calendarResult.status === 'success'">{{ calendarResult.newCount }} new, {{ calendarResult.updatedCount }} updated</template>
        <template v-else>Sync failed: {{ calendarResult.error }}</template>
      </div>

      <NEmpty v-if="calendarRuns.length === 0" data-testid="calendar-sync-history-empty" description="No calendar syncs yet" class="sync-history-empty" />

      <ul v-else class="sync-history-list">
        <li v-for="historyRun in calendarRuns" :key="historyRun.id" data-testid="calendar-sync-history-row" class="sync-history-row">
          <span>{{ formatWhen(historyRun.ranAt) }}</span>
          <span>{{ historyRun.startDate }} – {{ historyRun.endDate }}</span>
          <span>{{ historyRun.source }}</span>
          <span>{{ historyRun.status }}</span>
          <span>{{ historyRun.newCount }} new / {{ historyRun.updatedCount }} updated</span>
          <span v-if="historyRun.error">{{ historyRun.error }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.sync-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.sync-form,
.calendar-sync-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.calendar-sync-section {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.sync-page-error {
  margin: 0 0 1rem;
  color: #fca5a5;
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 0.4rem;
  background: #1f1f24;
  font-size: 0.85rem;
}
</style>
