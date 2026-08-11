<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { sanitizeEmailHtml } from '../utils/sanitize-email.js';

const props = defineProps<{ bodyOriginal: string; bodyContentType: 'html' | 'text' }>();

const hostRef = ref<HTMLElement | null>(null);

function renderIntoShadow(): void {
  if (props.bodyContentType !== 'html' || !hostRef.value) return;
  const shadow = hostRef.value.shadowRoot ?? hostRef.value.attachShadow({ mode: 'open' });
  shadow.innerHTML = sanitizeEmailHtml(props.bodyOriginal);
}

onMounted(renderIntoShadow);
watch(() => [props.bodyOriginal, props.bodyContentType], renderIntoShadow);
</script>

<template>
  <div v-if="bodyContentType === 'html'" ref="hostRef" data-testid="email-body-html" class="email-body-html"></div>
  <pre v-else data-testid="email-body-text" class="email-body-text">{{ bodyOriginal }}</pre>
</template>

<style scoped>
.email-body-text {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.9rem;
  margin: 0;
}
</style>
