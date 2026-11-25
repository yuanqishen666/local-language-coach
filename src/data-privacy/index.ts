import { normalizeUiLocale, type UiLocale } from '../../shared/locales'
import { addPage } from '../lab/routes'
import { addNavItem } from '../lab/useShell'
import { openEditionUrl } from '../../shared/edition-links'

export const betaPath: string | undefined = import.meta.env.VITE_BETA_URL

const betaLabels = {
  'zh-CN': ['内测版', '固定聊天搭子', '情景对话要点', '跨设备接着学'],
  'en-US': ['Closed beta', 'Regular chat partner', 'Role-play takeaways', 'Pick up on any device'],
  'es-419': ['Beta cerrada', 'Compañero de chat habitual', 'Puntos clave de la práctica', 'Continúa en cualquier dispositivo'],
  'fr-FR': ['Bêta fermée', 'Partenaire de discussion régulier', 'Points clés des mises en situation', 'Reprise sur un autre appareil'],
  'ja-JP': ['クローズドベータ版', 'いつもの会話相手', '場面別会話の振り返り', '別の端末でも続きから'],
  'de-DE': ['Geschlossene Beta', 'Fester Chatpartner', 'Das Wichtigste aus Rollenspielen', 'Auf jedem Gerät weiterlernen'],
  'ko-KR': ['비공개 베타', '단골 대화 상대', '상황별 대화 핵심', '다른 기기에서 이어서 학습'],
  'it-IT': ['Beta chiusa', 'Partner di chat abituale', 'Punti chiave dei giochi di ruolo', 'Riprendi su qualsiasi dispositivo'],
  'pt-BR': ['Beta fechado', 'Parceiro de conversa fixo', 'Pontos principais das simulações', 'Continue em qualquer dispositivo'],
  'hi-IN': ['बंद बीटा', 'बातचीत का अपना साथी', 'भूमिका निभाने वाले संवाद की मुख्य बातें', 'किसी भी डिवाइस पर आगे सीखें'],
} satisfies Record<UiLocale, readonly [string, string, string, string]>

export function betaLabelsFor(locale: string) {
  return betaLabels[normalizeUiLocale(locale)]
}

export function betaLink(locale: string) {
  return betaPath && `${betaPath}?lang=${normalizeUiLocale(locale)}`
}

export function registerDataPrivacy(publicBase?: string) {
  addPage({ path: 'privacy', component: () => import('./DataPrivacy.vue') })
  const privacy = {
    to: '/privacy', icon: 'lock' as const, label: 'settings.dataTitle',
    href: publicBase === undefined ? undefined : (locale: string) => openEditionUrl(publicBase, normalizeUiLocale(locale), 'privacy'),
  }
  addNavItem(privacy, 'before-settings')
  addNavItem(privacy, 'welcome')
}
