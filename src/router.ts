import { createRouter, createWebHistory } from 'vue-router'
import { appRoutes, installLabGuard, labRoutes } from './lab/routes'

// The templates in ./pages are no longer routed, but their <script setup> blocks are still the source
// of the page logic: src/lab/logic/generate.mjs wraps them for the new pages. Change behaviour there.
export const router = createRouter({
  history: createWebHistory(),
  routes: [...appRoutes, ...labRoutes],
})

installLabGuard(router)
