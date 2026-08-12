<script setup lang="ts">
import { NEmpty } from 'naive-ui';
import type { LinkedConversationSummary } from '../../shared/types.js';
import { subjectOrPlaceholder } from '../utils/email-format.js';
import { absoluteLocal } from '../utils/time.js';

defineProps<{ conversations: LinkedConversationSummary[] }>();

function participantLabel(participant: LinkedConversationSummary['participants'][number]): string {
  if (participant.person) return participant.person.name;
  if (participant.displayName.trim()) return participant.displayName;
  return participant.address;
}
</script>

<template>
  <NEmpty v-if="conversations.length === 0" data-testid="linked-conversations-empty" description="No linked emails" />
  <ul v-else class="linked-conversations wh-card-list">
    <li v-for="conversation in conversations" :key="conversation.id" class="linked-conversation-row" data-testid="linked-conversation">
      <RouterLink :to="`/emails/${conversation.id}`" class="linked-conversation-link">
        <span class="linked-conversation-subject" :class="{ 'subject-placeholder': !conversation.subject.trim() }">
          {{ subjectOrPlaceholder(conversation.subject) }}
        </span>
        <span class="linked-conversation-participants">
          {{ conversation.participants.map(participantLabel).join(', ') }}
        </span>
        <span class="linked-conversation-date">{{ absoluteLocal(conversation.latestMessageAt) }}</span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.linked-conversation-row {
  padding: 0;
}

.linked-conversation-link {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.75rem;
  color: inherit;
  text-decoration: none;
}

.linked-conversation-subject {
  font-size: 0.9rem;
  color: var(--wh-text-primary);
}

.subject-placeholder {
  color: var(--wh-text-muted);
  font-style: italic;
}

.linked-conversation-participants {
  font-size: 0.8rem;
  color: var(--wh-text-secondary);
}

.linked-conversation-date {
  font-size: 0.75rem;
  color: var(--wh-text-muted);
}
</style>
