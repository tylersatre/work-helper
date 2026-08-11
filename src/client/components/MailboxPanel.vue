<script setup lang="ts">
import { NButton } from 'naive-ui';
import { onMounted, onUnmounted, ref } from 'vue';

type SignInAttempt =
  | { status: 'pending'; verificationUri: string; userCode: string; expiresAt: number }
  | { status: 'failed'; error: string };

type MailboxStatus =
  | { state: 'not-configured'; missing: string[] }
  | { state: 'not-connected'; reason: 'never-signed-in' | 'expired'; detail?: string; attempt?: SignInAttempt }
  | { state: 'connected'; account: string };

const POLL_INTERVAL_MS = 3000;

const status = ref<MailboxStatus | null>(null);
const actionError = ref<string | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function readActionResult(response: Response): Promise<MailboxStatus | null> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message = (body as { error?: { message?: string } })?.error?.message;
    actionError.value = message ?? 'Something went wrong — try again';
    return null;
  }
  actionError.value = null;
  return body as MailboxStatus;
}

function isPending(value: MailboxStatus | null): boolean {
  return value?.state === 'not-connected' && value.attempt?.status === 'pending';
}

// Also true while status is still null (initial fetch hasn't succeeded yet) so a rejected
// mount-time GET keeps retrying instead of leaving the panel permanently blank.
function shouldPoll(value: MailboxStatus | null): boolean {
  return value === null || isPending(value);
}

function syncPolling(): void {
  if (shouldPoll(status.value) && !pollTimer) {
    pollTimer = setInterval(fetchStatus, POLL_INTERVAL_MS);
  } else if (!shouldPoll(status.value) && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchStatus(): Promise<void> {
  try {
    const response = await fetch('/api/mailbox');
    status.value = (await response.json()) as MailboxStatus;
  } catch {
    // Leave status as-is — syncPolling() below keeps retrying while it's still null.
  } finally {
    syncPolling();
  }
}

onMounted(fetchStatus);
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

async function onConnect(): Promise<void> {
  const response = await fetch('/api/mailbox/connect', { method: 'POST' });
  const result = await readActionResult(response);
  if (result) status.value = result;
  syncPolling();
}

async function copyCode(): Promise<void> {
  if (status.value?.state === 'not-connected' && status.value.attempt?.status === 'pending') {
    await navigator.clipboard.writeText(status.value.attempt.userCode);
  }
}

async function onDisconnect(): Promise<void> {
  const response = await fetch('/api/mailbox/disconnect', { method: 'POST' });
  const result = await readActionResult(response);
  if (result) status.value = result;
  syncPolling();
}
</script>

<template>
  <section v-if="status" class="mailbox-panel">
    <p v-if="actionError" data-testid="mailbox-connect-error" role="alert">{{ actionError }}</p>

    <div v-if="status.state === 'not-configured'" data-testid="mailbox-not-configured">
      Mail is not configured — set {{ status.missing.join(' and ') }} (see .env.example).
    </div>

    <template v-else-if="status.state === 'not-connected'">
      <div v-if="status.attempt?.status === 'pending'" data-testid="mailbox-pending" class="mailbox-pending">
        <a :href="status.attempt.verificationUri" target="_blank" rel="noreferrer" data-testid="mailbox-verification-link">
          {{ status.attempt.verificationUri }}
        </a>
        <code data-testid="mailbox-code">{{ status.attempt.userCode }}</code>
        <NButton data-testid="mailbox-copy-code" size="small" @click="copyCode">Copy code</NButton>
        <span>Waiting for sign-in…</span>
      </div>
      <div v-else-if="status.attempt?.status === 'failed'">
        <p data-testid="mailbox-error">{{ status.attempt.error }}</p>
        <NButton data-testid="mailbox-connect" type="primary" size="small" @click="onConnect">Connect</NButton>
      </div>
      <div v-else>
        <p data-testid="mailbox-not-connected">Not connected</p>
        <NButton data-testid="mailbox-connect" type="primary" size="small" @click="onConnect">Connect</NButton>
      </div>
    </template>

    <div v-else-if="status.state === 'connected'">
      <span data-testid="mailbox-connected">Connected as {{ status.account }}</span>
      <NButton data-testid="mailbox-disconnect" size="small" @click="onDisconnect">Disconnect</NButton>
    </div>
  </section>
</template>

<style scoped>
.mailbox-panel {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  background: #1f1f24;
}

.mailbox-pending {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
