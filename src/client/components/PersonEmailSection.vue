<script setup lang="ts">
import { NButton, NEmpty } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import type { PersonEmailConversation } from '../../shared/types.js';
import { subjectOrPlaceholder } from '../utils/email-format.js';
import { absoluteLocal } from '../utils/time.js';

const props = defineProps<{ personId: number }>();

const conversations = ref<PersonEmailConversation[]>([]);
const showAll = ref(false);

const visible = computed(() => (showAll.value ? conversations.value : conversations.value.slice(0, 5)));

async function fetchConversations(): Promise<void> {
  const response = await fetch(`/api/people/${props.personId}/email-conversations`);
  const body = await response.json();
  conversations.value = body.conversations ?? [];
}

onMounted(fetchConversations);
</script>

<template>
  <div class="person-email-section">
    <h3>Email</h3>

    <NEmpty v-if="conversations.length === 0" data-testid="person-emails-empty" description="No synced email" class="person-emails-empty" />

    <ul v-else class="person-email-list">
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
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
}

.person-email-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.person-email-link {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.4rem 0;
  color: inherit;
  text-decoration: none;
  font-size: 0.85rem;
}

.subject-placeholder {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.person-email-date {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
}

.person-email-address {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}
</style>
