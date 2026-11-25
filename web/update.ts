/**
 * Says so when a newer version of the app has been put on the site while this page stayed open. The page that
 * starts the app names its script after the script's contents, so another name there is another version.
 */
import { i18n } from '../src/i18n'

const LOOK_EVERY_MS = 30 * 60 * 1000

function tell() {
  const notice = document.body.appendChild(document.createElement('div'))
  notice.className = 'w-update'
  notice.setAttribute('role', 'status')
  notice.style.cssText = 'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:1000;display:flex;gap:.75rem;align-items:center;'
    + 'width:max-content;max-width:calc(100vw - 2rem);padding:.6rem .7rem .6rem 1rem;border-radius:.75rem;background:#2b2a27;color:#fff;'
    + 'font:14px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.2)'
  notice.appendChild(document.createElement('span')).textContent = i18n.global.t('web.update.found')
  const reload = notice.appendChild(document.createElement('button'))
  reload.style.cssText = 'flex:none;padding:.3rem .8rem;font:inherit;color:inherit;background:none;border:1px solid currentColor;border-radius:.5rem;cursor:pointer'
  reload.textContent = i18n.global.t('web.update.reload')
  reload.onclick = () => location.reload()
}

export function watchForNewVersion() {
  const script = (page: ParentNode) => page.querySelector('script[type=module][src]')?.getAttribute('src')
  const mine = script(document)
  // The dev server sends each change to the open page itself.
  if (import.meta.env.DEV || !mine) return
  let looked = Date.now()
  let told = false
  const found = () => {
    if (told) return
    told = true
    tell()
  }
  const look = async () => {
    if (told || document.visibilityState !== 'visible' || Date.now() - looked < LOOK_EVERY_MS) return
    looked = Date.now()
    const page = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' }).then((response) => (response.ok ? response.text() : ''), () => '')
    const theirs = script(new DOMParser().parseFromString(page, 'text/html'))
    if (theirs && theirs !== mine) found()
  }
  document.addEventListener('visibilitychange', () => void look())
  setInterval(() => void look(), LOOK_EVERY_MS)
  // A part of the app that is fetched when first needed is no longer on the site once a newer version has replaced it.
  addEventListener('vite:preloadError', found)
}
