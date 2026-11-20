<script setup lang="ts">
import type { Message, MessageMeta } from '../../types'
import { textLookupDirective as vTextLookup } from '../../text-lookup'
import Icon from '../kit/Icon.vue'
import WordText from '../kit/WordText.vue'
import Speak from './Speak.vue'
import { useMessageBubble } from '../logic/MessageBubble'

const props = defineProps<{ message: Message; feedback?: MessageMeta; partnerInitial: string; targetLanguageCode: string }>()
const emit = defineEmits<{
  lookup: [term: string, sentence: string]
  remember: [item: NonNullable<MessageMeta['memoryCandidates']>[number]]
}>()
const { t, locale, showTranslation, translating, translationError, groundingLinks, coachingVisible, memoryCandidates, toggleTranslation, lookupText } = useMessageBubble(props, emit)
</script>

<template>
  <article class="msg" :class="message.role">
    <template v-if="message.role === 'assistant'">
      <i class="who" aria-hidden="true">{{ partnerInitial }}</i>
      <div class="said">
        <p v-text-lookup="lookupText(message.content)" class="line" :lang="targetLanguageCode"><WordText :text="message.content" :language-code="targetLanguageCode" @pick="(term) => emit('lookup', term, message.content)" /></p>
        <p v-if="showTranslation" class="gloss">{{ message.meta.roleReplyTranslations?.[String(locale)] }}</p>
        <p v-if="translationError" class="nf-error">{{ translationError }}</p>
        <div class="tools">
          <button type="button" class="nf-link" :class="{ on: showTranslation }" :disabled="translating" @click="toggleTranslation">{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
          <Speak :speech-id="`message-${message.id}`" :text="message.content" :language-code="targetLanguageCode" />
        </div>
        <aside v-if="groundingLinks.length || message.meta.grounding?.searchSuggestionsHtml" class="refs" :aria-label="t('message.webLinks')">
          <a v-for="link in groundingLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.title">
            <Icon name="link" :size="12" /><span>{{ link.label }}</span><small class="nf-mono">{{ link.host }}</small>
          </a>
          <iframe
            v-if="message.meta.grounding?.provider === 'gemini' && message.meta.grounding.searchSuggestionsHtml"
            :srcdoc="message.meta.grounding.searchSuggestionsHtml"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            :title="t('message.googleSearchSuggestions')"
          />
        </aside>
      </div>
    </template>

    <template v-else>
      <div class="said">
        <p class="line">{{ message.content }}</p>
      </div>
      <p v-if="message.status === 'failed'" class="nf-error" role="status">{{ t('message.failed') }}</p>
      <div v-if="(coachingVisible && (feedback?.reconstruction || feedback?.corrections?.length)) || memoryCandidates.length" class="revs">
        <section v-if="coachingVisible && feedback?.reconstruction" class="rev">
          <small>{{ feedback.reconstruction.type === 'optional' ? t('message.moreNatural') : t('message.howToSay') }}</small>
          <s v-text-lookup="lookupText(feedback.reconstruction.original)">{{ feedback.reconstruction.original }}</s>
          <div class="fix"><strong v-text-lookup="lookupText(feedback.reconstruction.improved)" :lang="targetLanguageCode">{{ feedback.reconstruction.improved }}</strong><Speak :speech-id="`coaching-${message.id}-reconstruction`" :text="feedback.reconstruction.improved" :language-code="targetLanguageCode" compact /></div>
          <p v-text-lookup="lookupText(feedback.reconstruction.explanation)">{{ feedback.reconstruction.explanation }}</p>
        </section>
        <section v-for="(correction, correctionIndex) in coachingVisible ? feedback?.corrections || [] : []" :key="correction.original + correction.improved" class="rev">
          <small>{{ correction.severity === 'meaning' ? t('message.meaningFix') : t('message.naturalPhrasing') }}</small>
          <s v-text-lookup="lookupText(correction.original)">{{ correction.original }}</s>
          <div class="fix"><strong v-text-lookup="lookupText(correction.improved)" :lang="targetLanguageCode">{{ correction.improved }}</strong><Speak :speech-id="`coaching-${message.id}-${correctionIndex}`" :text="correction.improved" :language-code="targetLanguageCode" compact /></div>
          <p v-text-lookup="lookupText(correction.explanation)">{{ correction.explanation }}</p>
        </section>
        <section v-for="memory in memoryCandidates" :key="memory.key + memory.value" class="tag">
          <i class="eye" aria-hidden="true"></i>
          <div>
            <small>{{ memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle') }}</small>
            <s v-if="memory.action === 'update' && memory.previousValue">{{ memory.previousValue }}</s>
            <b>{{ memory.value }}</b>
          </div>
          <button type="button" class="nf-btn small" @click="emit('remember', memory)">{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.confirmRemember') }}</button>
        </section>
      </div>
    </template>
  </article>
</template>

<style scoped>
.msg{display:grid;gap:12px;animation:rise .7s var(--out) both}
@keyframes rise{from{opacity:0;transform:translateY(14px);filter:blur(6px)}}

/* the partner: large, light, unboxed — like subtitles */
.assistant{grid-template-columns:36px minmax(0,1fr);column-gap:14px}
.who{width:32px;height:32px;margin-top:3px;display:grid;place-items:center;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,182,72,.5);color:var(--amber);font:600 12px/1 var(--mono);font-style:normal}
.assistant .said{max-width:640px}
.assistant .line{font-size:23px;font-weight:300;line-height:1.5;letter-spacing:-.012em;text-wrap:pretty}
.gloss{margin-top:8px;color:var(--soft);font-size:14px;line-height:1.75}
.tools{height:30px;margin-top:6px;display:flex;align-items:center;gap:8px}
.tools .nf-link{color:var(--muted);font-size:12px}
.refs{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.refs a{display:inline-flex;align-items:center;gap:7px;max-width:100%;height:30px;padding:0 12px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);font-size:12px;transition:color .25s,box-shadow .25s}
.refs a:hover{color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber)}
.refs span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.refs small{color:var(--muted);font-size:10.5px}
.refs iframe{width:100%;height:52px;border:0;border-radius:12px}

/* me: outlined in amber on the right */
.user{justify-items:end}
.user .said{max-width:min(540px,86%);padding:12px 18px;border-radius:20px 20px 4px 20px;background:var(--amber-soft);box-shadow:inset 0 0 0 1px rgba(255,182,72,.45)}
.user .line{color:#ffe4b8;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}

/* a revision slip, torn along the left edge */
.revs{width:min(480px,90%);display:grid;gap:10px}
.rev{position:relative;display:grid;gap:5px;justify-items:start;padding:14px 18px 15px 22px;border-radius:4px 16px 16px 4px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line)}
.rev::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;background:repeating-linear-gradient(180deg,var(--amber) 0 5px,transparent 5px 9px)}
.rev small,.tag small{color:var(--amber);font:500 10.5px/1.3 var(--mono);letter-spacing:.12em;text-transform:uppercase}
.rev s{color:var(--muted);font-size:13.5px;line-height:1.6}
.fix{display:flex;align-items:flex-start;gap:6px}
.fix strong{font-size:17px;font-weight:500;line-height:1.5}
.rev p{color:var(--soft);font-size:12.5px;line-height:1.75}

/* a luggage tag for something worth keeping */
.tag{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:12px 14px 12px 16px;border-radius:999px 18px 18px 999px;background:var(--raise);box-shadow:inset 0 0 0 1px var(--line)}
.eye{width:12px;height:12px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--muted)}
.tag div{display:grid;gap:2px}
.tag small{color:var(--muted)}
.tag s{color:var(--muted);font-size:12.5px}
.tag b{font-size:14px;font-weight:500;line-height:1.5}

@media (max-width:760px){
  .assistant{grid-template-columns:minmax(0,1fr)}
  .who{width:26px;height:26px;margin:0;font-size:11px}
  .assistant .line{font-size:20px}
  .tag{grid-template-columns:auto minmax(0,1fr);border-radius:18px}
  .tag .nf-btn{grid-column:2;justify-self:start}
}
@media (prefers-reduced-motion:reduce){.msg{animation:none}}
</style>
