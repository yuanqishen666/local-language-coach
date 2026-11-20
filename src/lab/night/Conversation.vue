<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Bubble from './Bubble.vue'
import Lookup from './Lookup.vue'
import { useConversationPage } from '../logic/ConversationPage'

const {
  router, t, conversation, input, sending, chat, error, lookup, sceneStarting, partnerInitial, targetLanguageCode,
  setupMatchesLocale, conversationTitle, send, openLookup, saveMemory, formatDate, handleComposerKeydown,
  handleCompositionStart, handleCompositionEnd, feedbackFor, replayScene, toggleSceneSaved, customizeScene,
} = useConversationPage()

// Presentation only: the input grows with the text; the paper plane takes off when a message leaves.
const pad = ref<HTMLTextAreaElement | null>(null)
const flying = ref(false)
watch(input, async () => {
  await nextTick()
  const el = pad.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`
})
watch(sending, (now) => {
  if (!now) return
  flying.value = true
  window.setTimeout(() => { flying.value = false }, 700)
})
</script>

<template>
  <div v-if="conversation" class="cv">
    <header class="bar">
      <button type="button" class="back" :aria-label="t('common.close')" @click="router.push('/')"><Icon name="back" :size="18" /></button>
      <h1>{{ conversationTitle }}</h1>
      <time class="nf-mono">{{ formatDate(conversation.createdAt) }}</time>
    </header>

    <div ref="chat" class="scroll" :aria-busy="sending || sceneStarting">
      <div class="lane">
        <section v-if="conversation.setup && setupMatchesLocale" class="scene nf-glass">
          <i class="face" aria-hidden="true">{{ (conversation.setup.partnerName || conversation.setup.partnerRole).slice(0, 1) }}</i>
          <div class="scene-who">
            <b>{{ conversation.setup.partnerName || conversation.setup.partnerRole }}</b>
            <span class="nf-mono">{{ conversation.setup.partnerRole }} · {{ conversation.setup.setting }}</span>
          </div>
          <p>{{ conversation.setup.encounterSummary || conversation.setup.topicSeed }}</p>
          <div v-if="conversation.scene" class="nf-chips scene-acts">
            <button type="button" :disabled="sceneStarting" @click="replayScene('same_background')">{{ t('conversation.sameBackground') }}</button>
            <button type="button" :disabled="sceneStarting" @click="replayScene('new_encounter')">{{ t('conversation.newBackground') }}</button>
            <button type="button" :aria-pressed="conversation.scene.origin.saved" @click="toggleSceneSaved">{{ conversation.scene.origin.saved ? t('conversation.unsaveBackground') : t('conversation.saveBackground') }}</button>
            <button type="button" @click="customizeScene">{{ t('conversation.customizeBackground') }}</button>
            <i v-if="sceneStarting" class="nf-lamp on blink" role="progressbar" :aria-label="t('scene.presetStarting')"></i>
          </div>
        </section>

        <svg v-if="!conversation.messages.length" class="route" viewBox="0 0 600 200" aria-hidden="true">
          <path d="M30 170 Q300 -40 570 170" pathLength="1" />
          <circle cx="30" cy="170" r="4" /><circle cx="570" cy="170" r="4" />
          <g class="plane"><path d="m0-7 14 7-14 7 3-7Z" /></g>
        </svg>

        <Bubble
          v-for="(message, index) in conversation.messages"
          :key="message.id"
          :message="message"
          :feedback="feedbackFor(index)"
          :partner-initial="partnerInitial"
          :target-language-code="targetLanguageCode"
          @lookup="openLookup"
          @remember="saveMemory"
        />

        <div v-if="sending" class="runway" role="status" aria-live="polite" :aria-label="t('conversation.partnerTyping')">
          <i class="who" aria-hidden="true">{{ partnerInitial }}</i>
          <span aria-hidden="true"><i v-for="n in 6" :key="n" :style="{ '--i': n }"></i></span>
        </div>
      </div>
    </div>

    <div class="deck">
      <div class="deck-in">
        <p v-if="conversation.status === 'archived'" class="deck-note">{{ t('conversation.archivedContinue') }}</p>
        <p v-if="error" class="nf-error" role="alert">{{ error }}</p>
        <div class="write" :class="{ busy: sending }">
          <label class="sr" for="conversation-message">{{ t('conversation.openPlaceholder') }}</label>
          <textarea
            id="conversation-message"
            ref="pad"
            v-model="input"
            name="message"
            rows="1"
            autocomplete="off"
            :disabled="sending"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @keydown="handleComposerKeydown"
          ></textarea>
          <button type="button" class="send" :class="{ flying }" :aria-label="t('conversation.send')" :disabled="!input.trim() || sending" @click="send"><Icon name="send" :size="18" /></button>
        </div>
      </div>
    </div>

    <Lookup :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" :target-language-code="targetLanguageCode" @close="lookup.open = false" />
  </div>
  <div v-else class="opening" role="status" :aria-label="t('conversation.opening')"><i v-for="n in 6" :key="n" :style="{ '--i': n }"></i></div>
</template>

<style scoped>
.cv{height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr) auto}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}

.bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;height:64px;padding:0 var(--gutter)}
.back{width:40px;height:40px;margin-left:-8px;display:grid;place-items:center;border:0;border-radius:50%;background:var(--faint);color:var(--soft);transition:color .25s,background .25s,transform .5s var(--spring)}
.back:hover{color:#1b1204;background:var(--amber);transform:translateX(-3px)}
.bar h1{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:600;letter-spacing:-.01em}
.bar time{color:var(--muted);font-size:11.5px;letter-spacing:.06em}

.scroll{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;mask-image:linear-gradient(180deg,transparent,#000 28px,#000 calc(100% - 28px),transparent)}
.lane{max-width:820px;margin:0 auto;padding:30px var(--gutter) 40px;display:grid;gap:28px}

.scene{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 16px;padding:22px 24px}
.face{grid-row:span 2;width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:var(--amber);color:#1b1204;font-size:20px;font-style:normal;font-weight:700}
.scene-who{display:grid;gap:4px;align-content:center}
.scene-who b{font-size:22px;font-weight:400;letter-spacing:-.02em;line-height:1.2}
.scene-who span{color:var(--muted);font-size:11.5px;letter-spacing:.04em}
.scene p{color:var(--soft);font-size:14.5px;line-height:1.8}
.scene-acts{grid-column:1 / -1;align-items:center;margin-top:6px}
.scene-acts button{height:32px;padding:0 13px;font-size:12px}
.scene-acts button:disabled{opacity:.4}

.route{width:min(520px,90%);margin:8vh auto 0;overflow:visible}
.route path{fill:none;stroke:rgba(234,238,246,.2);stroke-width:1.2;stroke-dasharray:.012 .012}
.route circle{fill:none;stroke:rgba(234,238,246,.3);stroke-width:1.2}
.route .plane{offset-path:path('M30 170 Q300 -40 570 170');offset-rotate:auto;animation:fly 9s ease-in-out infinite}
.route .plane path{fill:var(--amber);stroke:none}
@keyframes fly{0%{offset-distance:0%;opacity:0}8%{opacity:1}92%{opacity:1}100%{offset-distance:100%;opacity:0}}

.runway{height:32px;display:flex;align-items:center;gap:14px}
.who{width:32px;height:32px;margin-right:4px;display:grid;place-items:center;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,182,72,.5);color:var(--amber);font:600 12px/1 var(--mono);font-style:normal}
.runway span,.opening{display:flex;align-items:center;gap:9px}
.runway span i,.opening i{width:6px;height:6px;border-radius:50%;background:var(--amber);opacity:.14;animation:lights 1.2s linear infinite;animation-delay:calc(var(--i) * 120ms)}
@keyframes lights{0%{opacity:1;box-shadow:0 0 10px var(--amber)}40%,100%{opacity:.14;box-shadow:none}}

.deck-in{max-width:820px;margin:0 auto;padding:6px var(--gutter) calc(20px + env(safe-area-inset-bottom));display:grid;gap:8px}
.deck-note{padding:0 6px;color:var(--muted);font-size:12.5px;line-height:1.7}
.deck .nf-error{padding:0 6px}
.write{display:flex;align-items:flex-end;gap:10px;padding:8px 8px 8px 22px;border-radius:30px;background:rgba(17,27,45,.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:inset 0 0 0 1px var(--line),0 20px 50px rgba(0,0,0,.4);transition:box-shadow .3s}
.write:focus-within{box-shadow:inset 0 0 0 1px rgba(255,182,72,.6),0 0 0 5px var(--amber-soft),0 20px 50px rgba(0,0,0,.4)}
.write textarea{flex:1;min-width:0;height:44px;max-height:168px;padding:10px 0;border:0;background:none;font-size:16px;line-height:1.5;resize:none;outline:0}
.write.busy textarea{color:var(--muted)}
.send{flex:none;width:44px;height:44px;display:grid;place-items:center;overflow:hidden;border:0;border-radius:50%;background:var(--amber);color:#1b1204;transition:transform .45s var(--spring),background .3s,color .3s,box-shadow .3s}
.send:not(:disabled):hover{transform:scale(1.08) rotate(-8deg);box-shadow:0 0 0 6px var(--amber-soft)}
.send:not(:disabled):active{transform:scale(.9)}
.send:disabled{background:var(--faint);color:var(--muted)}
.send.flying svg{animation:takeoff .7s var(--out)}
@keyframes takeoff{0%{transform:none;opacity:1}45%{transform:translate(30px,-30px);opacity:0}46%{transform:translate(-30px,30px);opacity:0}100%{transform:none;opacity:1}}

.opening{height:100dvh;justify-content:center}

@media (max-width:760px){
  .bar{height:56px}
  .bar time{display:none}
  .lane{padding:18px var(--gutter) 28px;gap:22px}
  .runway .who{display:none}
  .deck-in{padding:4px 10px calc(10px + env(safe-area-inset-bottom))}
}
@media (prefers-reduced-motion:reduce){.runway span i,.opening i,.route .plane,.send.flying svg{animation:none}.runway span i,.opening i{opacity:.6}}
</style>
