<script setup lang="ts">
import { NButton, NEmpty } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import type { PersonEmailConversation } from '../../shared/types.js';
import { subjectOrPlaceholder } from '../utils/email-format.js';
import { absoluteLocal } from '../utils/time.js';

const props = defineProps<{ personId: number }>();

const conversations = ref<PersonEmailConversation[]>([]);
const showAll = ref(false);
const loaded = ref(false);
const errorMessage = ref('');

const visible = computed(() => (showAll.value ? conversations.value : conversations.value.slice(0, 5)));

async function fetchConversations(): Promise<void> {
  try {
    const response = await fetch(`/api/people/${props.personId}/email-conversations`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      errorMessage.value = body.error?.message ?? 'Failed to load email';
      return;
    }
    const body = await response.json();
    conversations.value = body.conversations ?? [];
    errorMessage.value = '';
  } catch {
    errorMessage.value = 'Failed to load email';
  } finally {
    loaded.value = true;
  }
}

onMounted(fetchConversations);
</script>

<template>
  <div class="person-email-section">
    <h3>Email</h3>

    <p v-if="errorMessage" role="alert" class="person-email-error">{{ errorMessage }}</p>
    <NEmpty
      v-else-if="loaded && conversations.length === 0"
      data-testid="person-emails-empty"
      description="No synced email"
      class="person-emails-empty"
    />

    <ul v-else class="person-email-list wh-card-list">
      <li v-for="conversation in visible" :key="conversation.conversationId" class="person-email-row" data-testid="person-email-row">
        <RouterLink :to="`/emails/${conversation.conversationId}`" class="person-email-link">
          <span :class="{ 'subject-placeholder': !conversation.subject.trim() }">{{ subjectOrPlaceholder(conversation.subject) }}</span>
          <span class="person-email-date">{{ absoluteLocal(conversation.latestMessageAt) }}</span>
          <span v-for="entry in conversation.addresses" :key="entry.address" class="person-email-address">
            {{ entry.address }} — {{ entry.roles.join(', ') }}
          </span>
        </RouterLink>
      </li>
    </ul>

    <NButton v-if="!showAll && conversations.length > 5" size="small" @click="showAll = true">Show all</NButton>
  </div>
</template>

<style scoped>
.person-email-list {
  margin: 0 0 0.5rem;
}

.person-email-link {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.4rem 0.6rem;
  color: inherit;
  text-decoration: none;
  font-size: 0.85rem;
}

.subject-placeholder {
  color: var(--wh-text-muted);
  font-style: italic;
}

.person-email-date {
  font-size: 0.72rem;
  color: var(--wh-text-muted);
}

.person-email-address {
  font-size: 0.75rem;
  color: var(--wh-text-secondary);
}

.person-email-error {
  color: var(--wh-error);
  font-size: 0.85rem;
}
</style>
