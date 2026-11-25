import type { Plugin, ResolvedConfig } from 'vite'
import { createHash } from 'node:crypto'
import { DEFAULT_WEB_LOCALE, explicitUiLocale, LOCALE_META, localeSlug, UI_LOCALES, type UiLocale } from '../shared/locales'
import { openEditionUrl } from '../shared/edition-links'
import { privacyCopy } from '../src/data-privacy/copy'
import { publicWords } from './public-copy'

const SOURCE = 'https://github.com/yuanqishen666/local-language-coach'
const UPDATED = '2026-11-24'
const escape = (value: string) => value.replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)
const link = (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`

const modelScript = `
const line = document.querySelector('[data-privacy-model]')
fetch(line.dataset.privacyModel, { credentials: 'omit' })
  .then((response) => response.ok ? response.json() : undefined)
  .then((model) => {
    if (typeof model?.name !== 'string' || !model.name) return
    line.textContent = line.dataset.modelText.replace('{model}', () => model.name)
    line.hidden = false
  }).catch(() => {})
`.trim()
const modelFile = `assets/privacy-model-${createHash('sha256').update(modelScript).digest('hex').slice(0, 12)}.js`

function betaBase(config: ResolvedConfig) {
  const defined = config.define?.['import.meta.env.VITE_BETA_URL']
  const value = config.env.VITE_BETA_URL || (typeof defined === 'string' ? JSON.parse(defined) : '')
  return typeof value === 'string' && /^(?:\/(?!\/)|https:\/\/)/u.test(value) ? `${value.replace(/\/+$/u, '')}/` : undefined
}

const styles = `<style>
  html:has([data-public]) { color: #161616; background: #f1efea; font: 100%/1.6 system-ui, sans-serif }
  [data-public] { box-sizing: border-box; max-width: 46rem; margin: 6vh auto; padding: 0 1.25rem 2rem }
  [data-public] h1 { line-height: 1.15; margin: 0 0 1rem }
  [data-public] h2 { line-height: 1.3; margin: 0 0 .5rem }
  [data-public] p { max-width: 68ch; margin: 0 0 .8rem }
  [data-public] a, [data-public] button { color: inherit }
  [data-public] button { font: inherit; padding: .4rem .85rem; cursor: pointer }
  [data-public] nav, [data-public] footer, [data-public] .public-actions { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin: 1rem 0 }
  [data-public] section { padding: clamp(1rem, 4vw, 2rem); border-radius: 1.25rem; background: #fff; margin-top: 1rem }
  [data-public] pre { white-space: pre-wrap; overflow-wrap: anywhere }
</style>`

const startupStyles = `<style>
  [data-entry-startup] {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    gap: .6rem;
    padding: 1rem;
    color: #161616;
    background: #f1efea;
    font: 100%/1.6 system-ui, sans-serif;
    text-align: center;
  }
  [data-entry-indicator] {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .55rem;
    margin: 0;
    opacity: 0;
    animation: entry-show-indicator 0s 400ms forwards;
  }
  [data-entry-progress] {
    appearance: none;
    box-sizing: border-box;
    flex: none;
    width: 1rem;
    height: 1rem;
    border: 2px solid #a8a39a;
    border-top-color: currentColor;
    border-radius: 50%;
    background: none;
    animation: entry-spin .9s linear 400ms infinite;
  }
  [data-entry-progress]::-webkit-progress-bar { display: none }
  [data-entry-progress]::-moz-progress-bar { display: none }
  [data-entry-recovery] {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .35rem 1rem;
    visibility: hidden;
    animation: entry-show-recovery 0s 8s forwards;
  }
  [data-entry-recovery] a { color: inherit }
  @keyframes entry-show-indicator { to { opacity: 1 } }
  @keyframes entry-show-recovery { to { visibility: visible } }
  @keyframes entry-spin { to { transform: rotate(1turn) } }
  @media (prefers-reduced-motion: reduce) { [data-entry-progress] { animation-duration: 6s } }
</style>
<noscript><style>[data-entry-startup] { display: none }</style></noscript>`

function languages(base: string, locale: UiLocale, page?: 'privacy') {
  return `<nav aria-label="${escape(publicWords(locale).language)}">${UI_LOCALES.map((choice) =>
    `<a lang="${choice}" href="${escape(openEditionUrl(base, choice, page))}"${choice === locale ? ' aria-current="page"' : ''}>${escape(LOCALE_META[choice].nativeName)}</a>`,
  ).join('')}</nav>`
}

function metadata(config: ResolvedConfig, locale?: UiLocale, page?: 'privacy') {
  const origin = config.env.VITE_PUBLIC_ORIGIN
  if (!origin) return ''
  const url = (value?: UiLocale) => new URL(openEditionUrl(config.base, value, page), origin).href
  return [
    `<link rel="canonical" href="${escape(url(locale))}">`,
    ...UI_LOCALES.map((choice) => `<link rel="alternate" hreflang="${choice === 'es-419' ? 'es' : choice}" href="${escape(url(choice))}">`),
    `<link rel="alternate" hreflang="x-default" href="${escape(url())}">`,
  ].join('\n')
}

function appEntry(config: ResolvedConfig, locale: UiLocale) {
  const words = publicWords(locale)
  const beta = betaBase(config)
  const privacy = openEditionUrl(config.base, locale, 'privacy')
  return `<main data-entry-startup>
    <p data-entry-indicator><progress data-entry-progress aria-labelledby="entry-loading-text"></progress>
      <span id="entry-loading-text" data-entry-status>${escape(words.loading)}</span></p>
    <div data-entry-recovery><a data-entry-privacy href="${escape(privacy)}">${escape(words.privacy)}</a>
      <a data-entry-reload href="${escape(openEditionUrl(config.base, locale))}">${escape(words.reload)}</a></div>
    </main><noscript><main data-public><h1>${escape(words.brand)}</h1>
    <p>${escape(words.description)}</p><p>${escape(words.enableScripts)}</p>
    <div class="public-actions">${link(privacy, words.privacy)}
    ${beta ? link(`${beta}?lang=${locale}`, words.beta) : ''}</div>
    ${languages(config.base, locale)}</main></noscript>`
}

function appPage(template: string, config: ResolvedConfig, locale?: UiLocale) {
  const lang = locale ?? DEFAULT_WEB_LOCALE
  const words = publicWords(lang)
  return template
    .replace(/<html lang="[^"]+"/u, `<html lang="${lang}"${locale ? ` data-entry-locale="${locale}"` : ''}`)
    .replace(/<title>[^<]*<\/title>/u, `<title>${escape(words.brand)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/u, `<meta name="description" content="${escape(words.description)}">`)
    .replace('</head>', `${styles}\n${startupStyles}\n${metadata(config, locale)}\n</head>`)
    .replace(/<div id="app">[\s\S]*?<\/div>\s*<!-- app-end -->/u, () => `<div id="app">${appEntry(config, lang)}</div>`)
}

function privacyPage(config: ResolvedConfig, locale?: UiLocale) {
  const lang = locale ?? DEFAULT_WEB_LOCALE
  const words = publicWords(lang)
  const copy = privacyCopy[lang]
  const beta = betaBase(config)
  const contact = config.env.VITE_PRIVACY_CONTACT
  const title = `${words.privacy} · ${words.brand}`
  const paragraphs = (sequence: readonly string[]) => sequence.map((line) => `<p>${escape(line)}</p>`).join('')
  const updated = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(UPDATED))
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="${escape(copy.open[0])}">
    <title>${escape(title)}</title>${styles}${metadata(config, locale, 'privacy')}</head>
    <body><main data-public data-qs-id="qs-data-privacy"><header><h1>${escape(words.privacy)}</h1>
    <p>${escape(words.updated)} <time datetime="${UPDATED}">${escape(updated)}</time></p>
    <div class="public-actions">${link(openEditionUrl(config.base, lang), words.open)}</div>
    ${languages(config.base, lang, 'privacy')}</header>
    <section><h2>${escape(copy.openTitle)}</h2>${paragraphs([...copy.open, words.backup])}</section>
    ${beta ? `<section><h2>${escape(words.beta)}</h2><p hidden data-privacy-model="${escape(`${beta}api/pro/model`)}" data-model-text="${escape(copy.model)}"></p>${paragraphs([...copy.beta, words.session])}</section>` : ''}
    <footer>${link(SOURCE, words.repository)}${link(`${SOURCE}/blob/main/LICENSE`, words.license)}
    ${link(`${SOURCE}/issues`, words.issues)}${contact && /^(?:mailto:|https:\/\/)/iu.test(contact) ? link(contact, words.contact) : ''}</footer>
    </main>${beta ? `<script type="module" src="${escape(`${config.base}${modelFile}`)}"></script>` : ''}</body></html>`
}

function requestLocale(url: string, base: string) {
  const pathname = new URL(url, 'http://localhost').pathname
  const subpath = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//u, '')
  return explicitUiLocale(subpath.split('/')[0])
}

export function publicPages(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'public-language-pages',
    configResolved(resolved) { config = resolved },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '/'
        const pathname = new URL(url, 'http://localhost').pathname
        if (pathname === `/${modelFile}`) {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          response.end(modelScript)
          return
        }
        if (!/^\/(?:[a-z]{2}\/)?privacy\/?$/u.test(pathname)) return next()
        const locale = requestLocale(url, '/')
        if (!locale && !/^\/privacy\/?$/u.test(pathname)) return next()
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(privacyPage(config, locale))
      })
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        return context.server ? appPage(html, config, requestLocale(context.originalUrl ?? '/', config.base)) : html
      },
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const index = bundle['index.html']
        if (index?.type !== 'asset') this.error('Missing web entry HTML')
        const template = index.source.toString()
        index.source = appPage(template, config)
        const emit = (fileName: string, source: string) => this.emitFile({ type: 'asset', fileName, source })
        if (betaBase(config)) emit(modelFile, modelScript)
        emit('privacy/index.html', privacyPage(config))
        emit('404.html', `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Yujian</title>${styles}</head><body><main data-public><h1>Page not found</h1><p>${link(openEditionUrl(config.base), 'Yujian')}</p>${languages(config.base, DEFAULT_WEB_LOCALE)}</main></body></html>`)
        for (const locale of UI_LOCALES) {
          const slug = localeSlug(locale)
          emit(`${slug}/index.html`, appPage(template, config, locale))
          emit(`${slug}/privacy/index.html`, privacyPage(config, locale))
        }
      },
    },
  }
}
