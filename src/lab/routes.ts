import type { RouteRecordRaw, Router } from 'vue-router'
import './kit/lab.css'

export const LAB_THEMES = ['paper', 'night', 'blocks', 'mono', 'gallery', 'desk', 'daily', 'brick'] as const
export type LabTheme = (typeof LAB_THEMES)[number]

/** The design the app itself is drawn in. Every design, this one included, also stays open for comparison under /lab/<theme>. */
export const APP_THEME: LabTheme = 'brick'

// Themes from `mono` on share the page structure in ./core and only bring their own shell, home and tokens.
const views = import.meta.glob('./{paper,night,blocks,mono,gallery,desk,daily,brick,core}/*.vue')

// A theme that is another one re-skinned takes that theme's pages wherever it has none of its own.
const pagesFrom: Partial<Record<LabTheme, LabTheme>> = { brick: 'daily' }

const pages = [
  { path: '', view: 'Home' },
  { path: 'start', view: 'Scenes' },
  { path: 'start/import/:id?', view: 'Import' },
  { path: 'conversation/:id', view: 'Conversation', focus: true },
  { path: 'conversation/:id/recap', view: 'Recap' },
  { path: 'practice/:id', view: 'Practice', plain: true },
  { path: 'history', view: 'History' },
  { path: 'words', view: 'Words' },
  { path: 'words/story/:id?', view: 'Story' },
  { path: 'review', view: 'Review' },
  { path: 'memories', view: 'Memories' },
  { path: 'progress', view: 'Progress' },
  { path: 'settings', view: 'Settings' },
  { path: 'onboarding', view: 'Onboarding', plain: true },
  { path: 'placement', view: 'Placement', plain: true },
]

/** A page that is not in the list above: it brings its own component, which every design then draws inside its shell. */
export interface AddedPage {
  path: string
  component: NonNullable<RouteRecordRaw['component']>
  /** Drawn the way a conversation is, with the navigation out of the way. */
  focus?: boolean
  /** Drawn with no navigation around it, the way onboarding is. */
  plain?: boolean
}

const addedPages: AddedPage[] = []
const addedRoutes: RouteRecordRaw[] = []

/** Adds a page to the app. The route tables are built when the router is created, so add it before that. */
export function addPage(page: AddedPage) {
  addedPages.push(page)
}

/** Adds a route that stands outside the app's pages and their shell, such as a page shown before the app can be used. */
export function addRoute(route: RouteRecordRaw) {
  addedRoutes.push(route)
}

/** Every app page under `base`, drawn by `theme`. */
function themeRoutes(theme: LabTheme, base: string, publicEntry?: { paths: string[], onboarding: boolean }): RouteRecordRaw {
  return {
    path: base,
    component: views[`./${theme}/Shell.vue`],
    meta: { bare: true, lab: theme },
    children: [
      ...pages.map((page) => ({
        path: page.path,
        ...(publicEntry && page.path === (publicEntry.onboarding ? 'onboarding' : '') ? { alias: publicEntry.paths } : {}),
        component: views[`./${theme}/${page.view}.vue`] ?? views[`./${pagesFrom[theme] ?? 'core'}/${page.view}.vue`] ?? views[`./core/${page.view}.vue`] ?? views[`./daily/${page.view}.vue`],
        meta: { labFocus: Boolean(page.focus), labPlain: Boolean(page.plain), onboarding: page.path === 'onboarding' },
      })),
      ...addedPages.map((page) => ({
        path: page.path,
        component: page.component,
        meta: { labFocus: Boolean(page.focus), labPlain: Boolean(page.plain) },
      })),
    ],
  }
}

/** The app's own pages, at the paths the page logic navigates to. */
export function appRoutes(publicEntry?: { paths: string[], onboarding: boolean }): RouteRecordRaw[] {
  return [
    themeRoutes(APP_THEME, '/', publicEntry),
    { path: '/scene', redirect: '/start' },
    ...addedRoutes,
  ]
}

/** The same pages again under /lab/<theme>/…, one set per design. */
export function labRoutes(): RouteRecordRaw[] {
  return [
    { path: '/lab', redirect: '/lab/paper' },
    ...LAB_THEMES.map((theme) => themeRoutes(theme, `/lab/${theme}`)),
  ]
}

function previewTheme(path: string) {
  return /^\/lab\/([^/]+)/u.exec(path)?.[1]
}

export function isPreview(path: string) {
  return Boolean(previewTheme(path))
}

export function installLabGuard(router: Router) {
  // Theme backdrops hang off this attribute; set it before the first paint so the loading screen already matches.
  document.documentElement.dataset.lab = previewTheme(window.location.pathname) ?? APP_THEME

  // Page logic navigates with app paths such as `/conversation/42`. Inside a preview, keep those in the same design.
  router.beforeEach((to, from) => {
    const theme = previewTheme(from.path)
    if (!theme || isPreview(to.path)) return true
    return { path: `/lab/${theme}${to.path === '/' ? '' : to.path}`, query: to.query, hash: to.hash }
  })
  router.afterEach((to) => {
    if (typeof to.meta.lab === 'string') document.documentElement.dataset.lab = to.meta.lab
    else delete document.documentElement.dataset.lab
  })
}
