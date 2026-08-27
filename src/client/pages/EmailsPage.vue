<script setup lang="ts">
import { NButton, NEmpty } from 'naive-ui';
import { onMounted, ref } from 'vue';
import type { EmailConversationSummary } from '../../shared/types.js';
import { subjectOrPlaceholder } from '../utils/email-format.js';
import { absoluteLocal } from '../utils/time.js';

const conversations = ref<EmailConversationSummary[]>([]);
const nextCursor = ref<string | null>(null);
const errorMessage = ref('');
const loaded = ref(false);

function participantLabel(participant: EmailConversationSummary['participants'][number]): string {
  return participant.displayName.trim() !== '' ? participant.displayName : participant.address;
}

async function fetchPage(cursor?: string): Promise<void> {
  try {
    const url = cursor ? `/api/emails/conversations?cursor=${encodeURIComponent(cursor)}` : '/api/emails/conversations';
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.json();
      errorMessage.value = body.error?.message ?? 'Failed to load conversations';
      return;
    }
    const page = await response.json();
    conversations.value = cursor ? [...conversations.value, ...page.conversations] : page.conversations;
    nextCursor.value = page.nextCursor;
    errorMessage.value = '';
  } finally {
    loaded.value = true;
  }
}

async function loadMore(): Promise<void> {
  if (nextCursor.value) {
    await fetchPage(nextCursor.value);
  }
}

onMounted(() => fetchPage());
</script>

<template>
  <section class="emails-page">
    <h2>Emails</h2>

    <p v-if="errorMessage" role="alert" class="emails-page-error">{{ errorMessage }}</p>

    <NEmpty
      v-if="loaded && !errorMessage && conversations.length === 0"
      data-testid="emails-empty"
      description="No conversations yet"
      class="emails-empty"
    />

    <ul v-else class="email-conversation-list wh-card-list">
      <li v-for="conversation in conversations" :key="conversation.id" class="email-conversation-row" data-testid="email-conversation-row">
        <RouterLink :to="`/emails/${conversation.id}`" class="email-conversation-link" :class="{ 'email-conversation-unread': conversation.hasUnread }">
          <span class="email-conversation-subject" :class="{ 'subject-placeholder': !conversation.subject.trim() }">
            {{ subjectOrPlaceholder(conversation.subject) }}
          </span>
          <span class="email-conversation-participants">
            {{ conversation.participants.map(participantLabel).join(', ') }}
          </span>
          <span class="email-conversation-meta">
            <span class="email-conversation-count">{{ conversation.messageCount }}</span>
            <span class="email-conversation-date">{{ absoluteLocal(conversation.latestMessageAt) }}</span>
            <span v-if="conversation.hasUnread" data-testid="unread-indicator" class="email-conversation-unread-dot" aria-label="Unread"></span>
            <span v-if="conversation.hasAttachments" data-testid="attachment-indicator" class="email-conversation-attachment" aria-label="Has attachments">📎</span>
            <span v-if="conversation.hasDraft" data-testid="draft-indicator" class="email-conversation-draft-badge">Draft</span>
          </span>
        </RouterLink>
      </li>
    </ul>

    <div v-if="nextCursor" class="emails-page-load-more">
      <NButton size="small" @click="loadMore">Load more</NButton>
    </div>
  </section>
</template>

<style scoped>
.emails-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.emails-page-error {
  color: var(--wh-error);
  font-size: 0.85rem;
}

.emails-empty {
  margin-top: 1.5rem;
}

.email-conversation-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.75rem;
  color: inherit;
  text-decoration: none;
}

.email-conversation-unread {
  font-weight: 700;
}

.email-conversation-unread-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #3b82f6;
}

.email-conversation-draft-badge {
  background: rgba(234, 179, 8, 0.18);
  color: #fde68a;
  border-radius: 3px;
  padding: 0.05rem 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.email-conversation-subject.subject-placeholder {
  color: var(--wh-text-muted);
  font-style: italic;
}

.email-conversation-participants {
  font-size: 0.82rem;
  color: var(--wh-text-secondary);
  font-weight: 400;
}

.email-conversation-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--wh-text-muted);
  font-weight: 400;
}

.emails-page-load-more {
  margin-top: 1rem;
  text-align: center;
}
</style>
