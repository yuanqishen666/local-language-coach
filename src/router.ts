import { createRouter, createWebHistory, type Router } from 'vue-router'
import { appRoutes, installLabGuard, labRoutes } from './lab/routes'

// The templates in ./pages are no longer routed, but their <script setup> blocks are still the source
// of the page logic: src/lab/logic/generate.mjs wraps them for the new pages. Change behaviour there.
export function createAppRouter(publicEntry?: Parameters<typeof appRoutes>[0]) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [...appRoutes(publicEntry), ...labRoutes()],
  })
  installLabGuard(router)
  return router
}

export function onboardingDestination(router: Router, requested: unknown) {
  if (typeof requested !== 'string' || !requested.startsWith('/') || /^\/[\/\\]/u.test(requested)) return '/'
  const destination = router.resolve(requested)
  return destination.matched.length && !destination.meta.onboarding && destination.path !== '/placement'
    ? destination.fullPath
    : '/'
}
