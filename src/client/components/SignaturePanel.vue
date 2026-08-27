<script setup lang="ts">
import { NButton } from 'naive-ui';
import { onMounted, ref } from 'vue';

const signature = ref('');
const savedSignature = ref<string | null>(null);
const errorMessage = ref('');
const loaded = ref(false);
const saving = ref(false);

async function fetchSignature(): Promise<void> {
  try {
    const response = await fetch('/api/email-signature');
    const body = (await response.json()) as { signature: string | null };
    savedSignature.value = body.signature;
    signature.value = body.signature ?? '';
  } catch {
    errorMessage.value = 'Could not load the saved signature — reload the page';
  } finally {
    loaded.value = true;
  }
}

async function onSave(): Promise<void> {
  errorMessage.value = '';
  saving.value = true;
  try {
    const response = await fetch('/api/email-signature', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signature: signature.value }),
    });
    const body = (await response.json()) as { signature?: string | null; error?: { message?: string } };
    if (!response.ok) {
      errorMessage.value = body.error?.message ?? 'Could not save the signature — try again';
      return;
    }
    savedSignature.value = body.signature ?? null;
  } catch {
    errorMessage.value = 'Could not save the signature — try again';
  } finally {
    saving.value = false;
  }
}

onMounted(fetchSignature);
</script>

<template>
  <section data-testid="signature-section" class="signature-panel">
    <h3>Signature</h3>

    <p v-if="loaded && !errorMessage && savedSignature === null" class="signature-empty">No signature saved yet.</p>

    <textarea
      v-model="signature"
      class="signature-textarea"
      placeholder="Paste or write your HTML signature block here"
      rows="4"
    ></textarea>

    <p v-if="errorMessage" role="alert" class="signature-error">{{ errorMessage }}</p>

    <NButton size="small" type="primary" :loading="saving" @click="onSave">Save</NButton>
  </section>
</template>

<style scoped>
.signature-panel {
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--wh-border-subtle);
  border-radius: 4px;
  background: var(--wh-surface);
}

.signature-panel h3 {
  margin-top: 0;
}

.signature-empty {
  color: var(--wh-text-muted);
  font-size: 0.85rem;
}

.signature-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: var(--wh-surface-raised);
  color: var(--wh-text-primary);
  border: 1px solid var(--wh-border);
  border-radius: 4px;
}

.signature-error {
  color: var(--wh-error);
  font-size: 0.8rem;
}
</style>
