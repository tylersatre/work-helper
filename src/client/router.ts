import { createRouter, createWebHistory } from 'vue-router';
import CompaniesPage from './pages/CompaniesPage.vue';
import CompanyDetailPage from './pages/CompanyDetailPage.vue';
import EmailConversationPage from './pages/EmailConversationPage.vue';
import EmailsPage from './pages/EmailsPage.vue';
import BoardPage from './pages/BoardPage.vue';
import PeoplePage from './pages/PeoplePage.vue';
import PersonDetailPage from './pages/PersonDetailPage.vue';
import SyncPage from './pages/SyncPage.vue';
import TagsPage from './pages/TagsPage.vue';
import TaskDetailPage from './pages/TaskDetailPage.vue';
import UpNextPage from './pages/UpNextPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BoardPage },
    { path: '/people', component: PeoplePage },
    { path: '/people/:id', component: PersonDetailPage },
    { path: '/tasks/:id', component: TaskDetailPage },
    { path: '/companies', component: CompaniesPage },
    { path: '/companies/:id', component: CompanyDetailPage },
    { path: '/tags', component: TagsPage },
    { path: '/sync', component: SyncPage },
    { path: '/emails', component: EmailsPage },
    { path: '/emails/:id', component: EmailConversationPage },
    { path: '/up-next', component: UpNextPage },
  ],
});
