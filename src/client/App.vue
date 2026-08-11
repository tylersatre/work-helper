<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, darkTheme } from 'naive-ui';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { themeOverrides } from './theme.js';

const route = useRoute();

const activeSection = computed<'board' | 'people' | 'tags' | 'sync' | 'emails'>(() => {
  if (route.path === '/people' || route.path.startsWith('/people/')) return 'people';
  if (route.path === '/tags') return 'tags';
  if (route.path === '/sync') return 'sync';
  if (route.path === '/emails' || route.path.startsWith('/emails/')) return 'emails';
  return 'board';
});
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <NGlobalStyle />
    <div class="app-shell">
      <header class="app-nav" data-testid="app-nav">
        <span class="app-name">work-helper</span>
        <nav class="app-nav-links">
          <RouterLink v-slot="{ href, navigate }" to="/" custom>
            <a :href="href" :aria-current="activeSection === 'board' ? 'page' : undefined" @click="navigate">Board</a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" to="/people" custom>
            <a :href="href" :aria-current="activeSection === 'people' ? 'page' : undefined" @click="navigate">People</a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" to="/tags" custom>
            <a :href="href" :aria-current="activeSection === 'tags' ? 'page' : undefined" @click="navigate">Tags</a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" to="/sync" custom>
            <a :href="href" :aria-current="activeSection === 'sync' ? 'page' : undefined" @click="navigate">Email Sync</a>
          </RouterLink>
          <RouterLink v-slot="{ href, navigate }" to="/emails" custom>
            <a :href="href" :aria-current="activeSection === 'emails' ? 'page' : undefined" @click="navigate">Emails</a>
          </RouterLink>
        </nav>
      </header>
      <main class="app-content">
        <RouterView />
      </main>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.app-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #18181c;
}

.app-name {
  font-weight: 600;
  white-space: nowrap;
}

.app-nav-links {
  display: flex;
  gap: 1rem;
}

.app-nav-links a {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-size: 0.875rem;
}

.app-nav-links a[aria-current='page'] {
  color: #fff;
  font-weight: 600;
}

.app-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 480px) {
  .app-nav {
    gap: 0.75rem;
    padding: 0.5rem 0.5rem;
  }

  .app-nav-links {
    gap: 0.75rem;
  }
}
</style>
