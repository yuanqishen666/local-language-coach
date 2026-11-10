import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import OnboardingPage from './pages/OnboardingPage.vue'
import SceneBuilderPage from './pages/SceneBuilderPage.vue'
import ConversationPage from './pages/ConversationPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import WordbookPage from './pages/WordbookPage.vue'
import ReviewPage from './pages/ReviewPage.vue'
import MemoriesPage from './pages/MemoriesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/onboarding', component: OnboardingPage, meta: { bare: true } },
    { path: '/start', component: SceneBuilderPage },
    { path: '/scene', redirect: '/start' },
    { path: '/conversation/:id', component: ConversationPage, meta: { focus: true } },
    { path: '/history', component: HistoryPage },
    { path: '/words', component: WordbookPage },
    { path: '/review', component: ReviewPage },
    { path: '/memories', component: MemoriesPage },
    { path: '/settings', component: SettingsPage },
  ],
})
