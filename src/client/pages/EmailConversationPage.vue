<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { EmailConversationDetail } from '../../shared/types.js';
import AddressLinkControls from '../components/AddressLinkControls.vue';
import EmailBody from '../components/EmailBody.vue';
import LinkedCards from '../components/LinkedCards.vue';
import { formatBytes, subjectOrPlaceholder } from '../utils/email-format.js';
import { absoluteLocal } from '../utils/time.js';

const route = useRoute();
const conversation = ref<EmailConversationDetail | null>(null);
const errorMessage = ref('');
const notFound = ref(false);

const ROLE_ORDER = ['from', 'to', 'cc', 'bcc'] as const;

function orderedParticipants(message: EmailConversationDetail['messages'][number]) {
  return ROLE_ORDER.flatMap((role) => message.participants.filter((p) => p.role === role));
}

function importanceLabel(importance: string): string | null {
  if (importance === 'high') return 'High importance';
  if (importance === 'low') return 'Low importance';
  return null;
}

function flagLabel(flagStatus: string): string | null {
  if (flagStatus === 'flagged') return 'Flagged';
  if (flagStatus === 'complete') return 'Flag completed';
  return null;
}

async function fetchConversation(): Promise<void> {
  const response = await fetch(`/api/emails/conversations/${route.params.id}`);
  if (response.status === 404) {
    notFound.value = true;
    return;
  }
  if (!response.ok) {
    const body = await response.json();
    errorMessage.value = body.error?.message ?? 'Failed to load conversation';
    return;
  }
  conversation.value = await response.json();
}

onMounted(fetchConversation);
</script>

<template>
  <section class="email-conversation-page">
    <p v-if="errorMessage" role="alert" class="email-conversation-error">{{ errorMessage }}</p>
    <p v-else-if="notFound">Conversation not found.</p>

    <template v-else-if="conversation">
      <h2 :class="{ 'subject-placeholder': !conversation.subject.trim() }">{{ subjectOrPlaceholder(conversation.subject) }}</h2>

      <section class="email-conversation-cards">
        <h3>Cards</h3>
        <LinkedCards :cards="conversation.cards" />
      </section>

      <article v-for="message in conversation.messages" :key="message.id" class="email-message" data-testid="email-message">
        <header class="email-message-header">
          <h3 class="email-message-subject" :class="{ 'subject-placeholder': !message.subject.trim() }">
            {{ subjectOrPlaceholder(message.subject) }}
          </h3>
          <ul class="email-participants wh-card-list">
            <li
              v-for="participant in orderedParticipants(message)"
              :key="`${participant.role}-${participant.address}`"
              class="email-participant-row"
              data-testid="participant-row"
            >
              <span class="email-participant-role">{{ participant.role }}</span>
              <span class="email-participant-who">
                <RouterLink v-if="participant.person" :to="`/people/${participant.person.id}`" class="email-message-participant-link">
                  {{ participant.person.name }}
                </RouterLink>
                <span v-else-if="participant.displayName.trim()">{{ participant.displayName }}</span>
                <span class="email-message-address">&lt;{{ participant.address }}&gt;</span>
              </span>
              <AddressLinkControls
                v-if="!participant.person"
                class="email-participant-controls"
                :address="participant.address"
                :display-name="participant.displayName"
                @linked="fetchConversation"
              />
            </li>
          </ul>

          <div class="email-message-meta" data-testid="message-meta">
            <dl class="email-meta-grid">
              <div class="email-meta-pair"><dt>Sent</dt><dd>{{ absoluteLocal(message.sentAt) }}</dd></div>
              <div class="email-meta-pair"><dt>Received</dt><dd>{{ absoluteLocal(message.receivedAt) }}</dd></div>
              <div class="email-meta-pair"><dt>Folder</dt><dd>{{ message.sourceFolder }}</dd></div>
            </dl>
            <div class="email-meta-badges">
              <span v-if="!message.isRead" data-testid="message-unread" class="email-meta-badge email-meta-badge-unread">Unread</span>
              <span v-if="importanceLabel(message.importance)" class="email-meta-badge email-meta-badge-importance">
                {{ importanceLabel(message.importance) }}
              </span>
              <span v-if="flagLabel(message.flagStatus)" class="email-meta-badge email-meta-badge-flag">⚑ {{ flagLabel(message.flagStatus) }}</span>
              <span v-for="category in message.categories" :key="category" class="email-message-category">{{ category }}</span>
              <a :href="message.webLink" target="_blank" rel="noopener noreferrer" class="email-meta-outlook">Open in Outlook</a>
            </div>
          </div>
        </header>

        <EmailBody :body-original="message.bodyOriginal" :body-content-type="message.bodyContentType" />

        <ul v-if="message.attachments.length" class="email-message-attachments">
          <li v-for="(attachment, index) in message.attachments" :key="`${attachment.name}-${index}`" data-testid="message-attachment">
            {{ attachment.name }} ({{ attachment.contentType ?? 'unknown type' }}, {{ formatBytes(attachment.sizeBytes) }})
          </li>
        </ul>
      </article>
    </template>
  </section>
</template>

<style scoped>
.email-conversation-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

.email-conversation-error {
  color: var(--wh-error);
  font-size: 0.85rem;
}

.subject-placeholder {
  color: var(--wh-text-muted);
  font-style: italic;
}

.email-conversation-cards {
  margin-bottom: 1rem;
}

.email-conversation-cards h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--wh-text-muted);
  margin-bottom: 0.5rem;
}

.email-message {
  background: var(--wh-surface);
  border: 1px solid var(--wh-border);
  border-radius: 8px;
  padding: 0.85rem 1rem;
}

.email-message + .email-message {
  margin-top: 0.9rem;
}

.email-message-header {
  font-size: 0.82rem;
  color: var(--wh-text-secondary);
  border-bottom: 1px solid var(--wh-border-subtle);
  padding-bottom: 0.7rem;
  margin-bottom: 0.7rem;
}

.email-participants {
  margin: 0.5rem 0;
}

.email-participant-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  min-height: 2.1rem;
}

.email-participant-role {
  text-transform: uppercase;
  font-size: 0.68rem;
  color: var(--wh-text-muted);
  flex: 0 0 2.2rem;
}

.email-participant-who {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.email-participant-controls {
  margin-left: auto;
}

.email-message-address {
  color: var(--wh-text-muted);
}

.email-message-meta {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.5rem;
  font-size: 0.78rem;
}

.email-meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1.5rem;
  margin: 0;
}

.email-meta-pair {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
}

.email-meta-pair dt {
  text-transform: uppercase;
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: var(--wh-text-muted);
}

.email-meta-pair dd {
  margin: 0;
  color: var(--wh-text-secondary);
}

.email-meta-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.75rem;
}

.email-meta-badge {
  border-radius: 3px;
  padding: 0.05rem 0.4rem;
  font-weight: 600;
}

.email-meta-badge-unread {
  background: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
}

.email-meta-badge-importance {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}

.email-meta-badge-flag {
  background: rgba(234, 179, 8, 0.18);
  color: #fde68a;
}

.email-meta-outlook {
  margin-left: auto;
}

.email-message-category {
  background: rgba(255, 165, 0, 0.2);
  border-radius: 3px;
  padding: 0 0.3rem;
}

.email-message-attachments {
  margin-top: 0.5rem;
  font-size: 0.8rem;
}
</style>
