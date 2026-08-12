<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { EmailConversationDetail } from '../../shared/types.js';
import AddressLinkControls from '../components/AddressLinkControls.vue';
import EmailBody from '../components/EmailBody.vue';
import { formatBytes, subjectOrPlaceholder } from '../utils/email-format.js';
import { absoluteLocal } from '../utils/time.js';

const route = useRoute();
const conversation = ref<EmailConversationDetail | null>(null);
const errorMessage = ref('');
const notFound = ref(false);

function participantsByRole(message: EmailConversationDetail['messages'][number], role: 'from' | 'to' | 'cc' | 'bcc') {
  return message.participants.filter((p) => p.role === role);
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

      <article v-for="message in conversation.messages" :key="message.id" class="email-message" data-testid="email-message">
        <header class="email-message-header">
          <h3 class="email-message-subject" :class="{ 'subject-placeholder': !message.subject.trim() }">
            {{ subjectOrPlaceholder(message.subject) }}
          </h3>
          <div v-for="role in (['from', 'to', 'cc', 'bcc'] as const)" :key="role" v-show="participantsByRole(message, role).length">
            <span class="email-message-role">{{ role }}:</span>
            <template v-for="participant in participantsByRole(message, role)" :key="participant.address">
              <RouterLink v-if="participant.person" :to="`/people/${participant.person.id}`" class="email-message-participant-link">
                {{ participant.person.name }}
              </RouterLink>
              <span v-else-if="participant.displayName.trim()">{{ participant.displayName }}</span>
              <span class="email-message-address">&lt;{{ participant.address }}&gt;</span>
              <AddressLinkControls
                v-if="!participant.person"
                :address="participant.address"
                :display-name="participant.displayName"
                @linked="fetchConversation"
              />
            </template>
          </div>

          <div class="email-message-meta">
            <span v-if="!message.isRead" data-testid="message-unread" class="email-message-unread">Unread</span>
            <span>Sent {{ absoluteLocal(message.sentAt) }}</span>
            <span>Received {{ absoluteLocal(message.receivedAt) }}</span>
            <span>Importance: {{ message.importance }}</span>
            <span>Flag: {{ message.flagStatus }}</span>
            <span>Folder: {{ message.sourceFolder }}</span>
            <span v-for="category in message.categories" :key="category" class="email-message-category">{{ category }}</span>
            <a :href="message.webLink" target="_blank" rel="noopener noreferrer">Open in Outlook</a>
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
  margin-bottom: 0.5rem;
}

.email-message-role {
  text-transform: uppercase;
  font-size: 0.68rem;
  color: var(--wh-text-muted);
  margin-right: 0.3rem;
}

.email-message-address {
  color: var(--wh-text-muted);
  margin-right: 0.4rem;
}

.email-message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.3rem;
  font-size: 0.75rem;
}

.email-message-unread {
  font-weight: 700;
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
