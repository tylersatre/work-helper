<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { palette } from '../palette.js';
import { sanitizeEmailHtml } from '../utils/sanitize-email.js';

const props = defineProps<{ bodyOriginal: string; bodyContentType: 'html' | 'text' }>();

const hostRef = ref<HTMLElement | null>(null);

// HTML emails are authored against a white background, so rendering them on a
// light card (with a light color-scheme for form controls and default text)
// keeps the author's colors readable instead of fighting the dark theme.
const lightCardStyle = `
.email-light-card {
  background: ${palette.emailCardBg};
  color: ${palette.emailCardText};
  color-scheme: light;
  border-radius: 6px;
  padding: 12px 16px;
  overflow-x: auto;
}
.email-light-card a {
  color: ${palette.emailCardLink};
}
.email-light-card img {
  max-width: 100%;
  height: auto;
}
`;

function renderIntoShadow(): void {
  if (props.bodyContentType !== 'html' || !hostRef.value) return;
  const shadow = hostRef.value.shadowRoot ?? hostRef.value.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${lightCardStyle}</style><div class="email-light-card">${sanitizeEmailHtml(props.bodyOriginal)}</div>`;
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
