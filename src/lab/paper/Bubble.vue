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
const { t, locale, showTranslation, translating, translationError, groundingLinks, coachingVisible, memoryCandidates, toggleTranslation, lookupText, beats } = useMessageBubble(props, emit)
</script>

<template>
  <article class="msg" :class="message.role">
    <template v-if="message.role === 'assistant'">
      <div class="said">
        <i class="who" aria-hidden="true">{{ partnerInitial }}</i>
        <template v-for="(beat, at) in beats" :key="at">
          <p v-if="beat.type === 'narration'" class="reply-told">{{ beat.text }}</p>
          <template v-else>
            <small v-if="beat.name" class="reply-name">{{ beat.name }}</small>
            <p v-text-lookup="lookupText(beat.text)" class="line" :lang="targetLanguageCode"><WordText :text="beat.text" :language-code="targetLanguageCode" @pick="(term) => emit('lookup', term, beat.text)" /></p>
          </template>
        </template>
        <p v-if="showTranslation" class="gloss">{{ message.meta.roleReplyTranslations?.[String(locale)] }}</p>
        <p v-if="translationError" class="pp-error">{{ translationError }}</p>
        <div class="tools">
          <button type="button" class="pp-link" :disabled="translating" @click="toggleTranslation">{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
          <Speak :speech-id="`message-${message.id}`" :text="message.content" :language-code="targetLanguageCode" />
        </div>
        <aside v-if="groundingLinks.length || message.meta.grounding?.searchSuggestionsHtml" class="refs" :aria-label="t('message.webLinks')">
          <a v-for="(link, index) in groundingLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.title">
            <i>{{ index + 1 }}</i><span>{{ link.label }}</span><small>{{ link.host }}</small>
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
        <p v-if="message.status === 'failed'" class="pp-error" role="status">{{ t('message.failed') }}</p>
      </div>
      <div v-if="(coachingVisible && (feedback?.reconstruction || feedback?.corrections?.length)) || memoryCandidates.length" class="marks">
        <section v-if="coachingVisible && feedback?.reconstruction" class="mark">
          <small>{{ feedback.reconstruction.type === 'optional' ? t('message.moreNatural') : t('message.howToSay') }}</small>
          <s v-text-lookup="lookupText(feedback.reconstruction.original)">{{ feedback.reconstruction.original }}</s>
          <div class="fix"><strong v-text-lookup="lookupText(feedback.reconstruction.improved)" :lang="targetLanguageCode">{{ feedback.reconstruction.improved }}</strong><Speak :speech-id="`coaching-${message.id}-reconstruction`" :text="feedback.reconstruction.improved" :language-code="targetLanguageCode" compact /></div>
          <p v-text-lookup="lookupText(feedback.reconstruction.explanation)">{{ feedback.reconstruction.explanation }}</p>
        </section>
        <section v-for="(correction, correctionIndex) in coachingVisible ? feedback?.corrections || [] : []" :key="correction.original + correction.improved" class="mark">
          <small>{{ correction.severity === 'meaning' ? t('message.meaningFix') : t('message.naturalPhrasing') }}</small>
          <s v-text-lookup="lookupText(correction.original)">{{ correction.original }}</s>
          <div class="fix"><strong v-text-lookup="lookupText(correction.improved)" :lang="targetLanguageCode">{{ correction.improved }}</strong><Speak :speech-id="`coaching-${message.id}-${correctionIndex}`" :text="correction.improved" :language-code="targetLanguageCode" compact /></div>
          <p v-text-lookup="lookupText(correction.explanation)">{{ correction.explanation }}</p>
        </section>
        <section v-for="memory in memoryCandidates" :key="memory.key + memory.value" class="keep">
          <small>{{ memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle') }}</small>
          <s v-if="memory.action === 'update' && memory.previousValue">{{ memory.previousValue }}</s>
          <b>{{ memory.value }}</b>
          <button type="button" class="pp-link red" @click="emit('remember', memory)"><Icon name="plus" :size="12" />{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.confirmRemember') }}</button>
        </section>
      </div>
    </template>
  </article>
</template>

<style scoped>
.msg{position:relative;display:grid;grid-template-columns:var(--cols,minmax(0,1fr));column-gap:var(--col-gap,0px);row-gap:14px;align-items:start;animation:msg-in .6s var(--out) both}
@keyframes msg-in{from{opacity:0;transform:translateY(10px)}}

/* the partner: printed dialogue, set in serif */
.assistant .said{position:relative;max-width:600px}
.who{position:absolute;left:-46px;top:3px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);font:500 13px/1 var(--serif);font-style:normal}
.assistant .line{font:400 21px/1.62 var(--serif);letter-spacing:-.005em;text-wrap:pretty}
.gloss{margin-top:8px;padding-left:14px;border-left:1px solid var(--line);color:var(--soft);font-size:14px;line-height:1.75}
.tools{height:30px;margin-top:4px;display:flex;align-items:center;gap:10px}
.tools .pp-link{color:var(--muted);font-size:12px}
.tools .pp-link:hover{color:var(--ink)}
.refs{margin-top:10px;display:grid;gap:2px}
.refs a{display:grid;grid-template-columns:18px minmax(0,auto) 1fr;align-items:baseline;gap:6px;padding:3px 0;color:var(--soft);font-size:12px;transition:color .25s}
.refs a:hover{color:var(--red)}
.refs i{color:var(--red);font:500 11px/1 var(--serif);font-style:normal}
.refs span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}
.refs small{color:var(--muted);font-size:11px}
.refs iframe{width:100%;height:52px;margin-top:6px;border:0}

/* me: a handwritten slip pinned to the right edge */
.user .said{justify-self:end;max-width:min(520px,88%);padding:12px 18px 13px;background:var(--sheet);box-shadow:0 0 0 1px var(--line),4px 4px 0 var(--faint)}
.user .line{font-size:16px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
.user .pp-error{margin-top:6px}

/* proofreader's marks in red ink */
.marks{display:grid;gap:18px;justify-self:var(--marks-at,end);width:var(--marks-w,min(440px,88%));padding-top:2px}
.mark,.keep{position:relative;padding-left:16px;display:grid;gap:4px;justify-items:start}
.mark::before{content:'';position:absolute;left:0;top:5px;bottom:4px;width:1px;background:var(--red)}
.mark::after{content:'';position:absolute;left:0;top:5px;width:7px;height:1px;background:var(--red)}
.mark small,.keep small{color:var(--red);font-size:11px;font-weight:600;letter-spacing:.1em}
.mark s{color:var(--muted);font-size:13.5px;line-height:1.6;text-decoration-color:var(--red);text-decoration-thickness:1px}
.fix{display:flex;align-items:flex-start;gap:6px}
.fix strong{color:var(--red);font:500 18px/1.5 var(--serif)}
.mark p{color:var(--soft);font-size:12.5px;line-height:1.75}
.keep{padding:12px 14px;border:1px dashed rgba(25,22,18,.28)}
.keep small{color:var(--muted)}
.keep s{color:var(--muted);font-size:13px}
.keep b{font:500 15px/1.6 var(--serif)}
.keep .pp-link{display:inline-flex;align-items:center;gap:4px;font-size:12px}

@media (max-width:760px){
  .who{position:static;margin-bottom:8px;width:24px;height:24px;font-size:12px}
  .assistant .line{font-size:19px}
  .marks{width:92%}
}
@media (min-width:1100px){
  .marks{position:relative;margin-top:10px}
  .marks::before{content:'';position:absolute;right:100%;top:9px;width:calc(var(--col-gap) - 10px);margin-right:4px;height:1px;background:linear-gradient(90deg,transparent,var(--red));opacity:.55}
  .user .said{transition:box-shadow .3s}
  .msg:has(.mark:hover) .said{box-shadow:0 0 0 1px var(--red),4px 4px 0 rgba(197,55,30,.12)}
}
@media (prefers-reduced-motion:reduce){.msg{animation:none}}
</style>
