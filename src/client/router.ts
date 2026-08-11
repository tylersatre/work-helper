import { createRouter, createWebHistory } from 'vue-router';
import EmailsPage from './pages/EmailsPage.vue';
import BoardPage from './pages/BoardPage.vue';
import PeoplePage from './pages/PeoplePage.vue';
import PersonDetailPage from './pages/PersonDetailPage.vue';
import SyncPage from './pages/SyncPage.vue';
import TagsPage from './pages/TagsPage.vue';
import TaskDetailPage from './pages/TaskDetailPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BoardPage },
    { path: '/people', component: PeoplePage },
    { path: '/people/:id', component: PersonDetailPage },
    { path: '/tasks/:id', component: TaskDetailPage },
    { path: '/tags', component: TagsPage },
    { path: '/sync', component: SyncPage },
    { path: '/emails', component: EmailsPage },
  ],
});
