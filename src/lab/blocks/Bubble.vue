<script setup lang="ts">
import type { Message, MessageMeta } from '../../types'
import { textLookupDirective as vTextLookup } from '../../text-lookup'
import Icon from '../kit/Icon.vue'
import WordText from '../kit/WordText.vue'
import Face from './Face.vue'
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
      <i class="who" aria-hidden="true"><Face /></i>
      <div class="side">
        <div class="said">
          <template v-for="(beat, at) in beats" :key="at">
            <p v-if="beat.type === 'narration'" class="reply-told">{{ beat.text }}</p>
            <template v-else>
              <small v-if="beat.name" class="reply-name">{{ beat.name }}</small>
              <p v-text-lookup="lookupText(beat.text)" class="line" :lang="targetLanguageCode"><WordText :text="beat.text" :language-code="targetLanguageCode" @pick="(term) => emit('lookup', term, beat.text)" /></p>
            </template>
          </template>
          <p v-if="showTranslation" class="gloss">{{ message.meta.roleReplyTranslations?.[String(locale)] }}</p>
        </div>
        <p v-if="translationError" class="bk-error">{{ translationError }}</p>
        <div class="tools">
          <button type="button" class="bk-link" :class="{ on: showTranslation }" :disabled="translating" @click="toggleTranslation">{{ translating ? t('message.translating') : showTranslation ? t('message.hideTranslation') : t('message.showTranslation') }}</button>
          <Speak :speech-id="`message-${message.id}`" :text="message.content" :language-code="targetLanguageCode" />
        </div>
        <aside v-if="groundingLinks.length || message.meta.grounding?.searchSuggestionsHtml" class="refs" :aria-label="t('message.webLinks')">
          <a v-for="link in groundingLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.title">
            <Icon name="link" :size="13" :weight="2" /><span>{{ link.label }}</span><small>{{ link.host }}</small>
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
      <p v-if="message.status === 'failed'" class="bk-error" role="status">{{ t('message.failed') }}</p>
      <div v-if="(coachingVisible && (feedback?.reconstruction || feedback?.corrections?.length)) || memoryCandidates.length" class="notes">
        <section v-if="coachingVisible && feedback?.reconstruction" class="sticky">
          <small>{{ feedback.reconstruction.type === 'optional' ? t('message.moreNatural') : t('message.howToSay') }}</small>
          <s v-text-lookup="lookupText(feedback.reconstruction.original)">{{ feedback.reconstruction.original }}</s>
          <div class="fix"><strong v-text-lookup="lookupText(feedback.reconstruction.improved)" :lang="targetLanguageCode">{{ feedback.reconstruction.improved }}</strong><Speak :speech-id="`coaching-${message.id}-reconstruction`" :text="feedback.reconstruction.improved" :language-code="targetLanguageCode" compact /></div>
          <p v-text-lookup="lookupText(feedback.reconstruction.explanation)">{{ feedback.reconstruction.explanation }}</p>
        </section>
        <section v-for="(correction, correctionIndex) in coachingVisible ? feedback?.corrections || [] : []" :key="correction.original + correction.improved" class="sticky" :class="{ strong: correction.severity === 'meaning' }">
          <small>{{ correction.severity === 'meaning' ? t('message.meaningFix') : t('message.naturalPhrasing') }}</small>
          <s v-text-lookup="lookupText(correction.original)">{{ correction.original }}</s>
          <div class="fix"><strong v-text-lookup="lookupText(correction.improved)" :lang="targetLanguageCode">{{ correction.improved }}</strong><Speak :speech-id="`coaching-${message.id}-${correctionIndex}`" :text="correction.improved" :language-code="targetLanguageCode" compact /></div>
          <p v-text-lookup="lookupText(correction.explanation)">{{ correction.explanation }}</p>
        </section>
        <section v-for="memory in memoryCandidates" :key="memory.key + memory.value" class="keep">
          <div>
            <small>{{ memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle') }}</small>
            <s v-if="memory.action === 'update' && memory.previousValue">{{ memory.previousValue }}</s>
            <b>{{ memory.value }}</b>
          </div>
          <button type="button" class="bk-btn small" @click="emit('remember', memory)">{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.confirmRemember') }}</button>
        </section>
      </div>
    </template>
  </article>
</template>

<style scoped>
.msg{display:grid;animation:plop .6s var(--spring) both}
@keyframes plop{from{opacity:0;transform:translateY(16px) scale(.92)}}

.msg.assistant{grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;transform-origin:left bottom}
.who{width:46px;height:46px;display:grid;place-items:center;border-radius:16px;background:var(--cobalt);font-size:11px;font-style:normal;transition:transform .5s var(--spring),border-radius .3s}
.msg:hover .who{transform:rotate(-8deg) scale(1.08);border-radius:50%}
.side{display:grid;justify-items:start;gap:8px;min-width:0}
.assistant .said{max-width:min(600px,100%);padding:16px 20px;border-radius:6px 26px 26px 26px;background:var(--paper)}
.assistant .line{font-size:19px;font-weight:600;line-height:1.5;letter-spacing:-.012em}
.gloss{margin-top:10px;padding-top:10px;border-top:2px dashed var(--line);color:var(--soft);font-size:14.5px;line-height:1.7;animation:plop .4s var(--spring) both}
.tools{display:flex;align-items:center;gap:12px;padding-left:6px}
.refs{display:flex;flex-wrap:wrap;gap:6px;max-width:100%}
.refs a{max-width:100%;height:34px;padding:0 14px;display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:var(--mint);font-size:12.5px;font-weight:700;transition:transform .45s var(--spring)}
.refs a:hover{transform:translateY(-3px) rotate(-2deg)}
.refs a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.refs a small{flex:none;font-size:11px;font-weight:600;opacity:.6}
.refs iframe{width:100%;height:46px;border:0;border-radius:14px}

.msg.user{justify-items:end;gap:10px;transform-origin:right bottom}
.user .said{max-width:min(520px,86%);padding:14px 20px;border-radius:26px 26px 6px 26px;background:var(--cobalt);color:#fff}
.user .line{font-size:17px;font-weight:600;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}

/* corrections are sticky notes, slapped on a little crooked */
.notes{width:min(440px,92%);display:grid;gap:10px;margin-top:2px}
.sticky{position:relative;display:grid;gap:5px;padding:16px 18px 15px;border-radius:4px 20px 20px 20px;background:var(--sun);transform:rotate(-1.4deg);transform-origin:top right;transition:transform .5s var(--spring);--speak-bg:rgba(21,21,21,.12)}
.sticky:nth-child(even){transform:rotate(1.2deg);background:var(--peach)}
.sticky.strong{background:var(--tomato)}
.sticky:hover{transform:rotate(0) scale(1.02)}
.sticky small,.keep small{font-size:11.5px;font-weight:800;letter-spacing:.02em;opacity:.62}
.sticky s{font-size:13.5px;opacity:.55;text-decoration-thickness:2px}
.fix{display:flex;align-items:center;gap:8px}
.fix strong{font-size:18px;font-weight:800;line-height:1.4;letter-spacing:-.015em}
.sticky p{font-size:13px;line-height:1.65;opacity:.8}
.keep{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px 14px 14px 18px;border-radius:20px;background:var(--mint);transform:rotate(.8deg);transition:transform .5s var(--spring)}
.keep:hover{transform:rotate(0) scale(1.02)}
.keep div{display:grid;gap:3px}
.keep s{font-size:12.5px;opacity:.55}
.keep b{font-size:15px;font-weight:800;line-height:1.45}

@media (max-width:760px){
  .msg.assistant{gap:8px}
  .who{width:36px;height:36px;border-radius:13px;font-size:8.5px}
  .assistant .line{font-size:17.5px}
  .notes{width:94%}
}
@media (prefers-reduced-motion:reduce){.msg,.gloss{animation:none}}
</style>
