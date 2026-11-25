<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Bubble from './Bubble.vue'
import Lookup from './Lookup.vue'
import { useConversationPage } from '../logic/ConversationPage'
import { aboveComposer } from '../../conversation-extras'

const {
  router, t, conversation, input, sending, chat, error, lookup, sceneStarting, partnerInitial, targetLanguageCode,
  setupMatchesLocale, conversationTitle, send, openLookup, saveMemory, formatDate, handleComposerKeydown,
  handleCompositionStart, handleCompositionEnd, feedbackFor, replayScene, toggleSceneSaved, customizeScene,
} = useConversationPage()

// Presentation only: the writing line grows with the text, the seal presses when sending.
const pad = ref<HTMLTextAreaElement | null>(null)
const pressed = ref(false)
watch(input, async () => {
  await nextTick()
  const el = pad.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
})
function press() {
  pressed.value = true
  window.setTimeout(() => { pressed.value = false }, 420)
  send()
}
</script>

<template>
  <div v-if="conversation" class="cv">
    <header class="bar">
      <button type="button" class="back" :aria-label="t('common.close')" @click="router.push('/')"><Icon name="back" :size="18" /></button>
      <h1>{{ conversationTitle }}</h1>
      <time>{{ formatDate(conversation.createdAt) }}</time>
    </header>

    <div ref="chat" class="scroll" :aria-busy="sending || sceneStarting">
      <div class="sheet">
        <section v-if="conversation.setup && setupMatchesLocale" class="scene">
          <i class="pp-seal" aria-hidden="true">{{ (conversation.setup.partnerName || conversation.setup.partnerRole).slice(0, 1) }}</i>
          <div class="scene-who">
            <b>{{ conversation.setup.partnerName || conversation.setup.partnerRole }}</b>
            <span>{{ conversation.setup.partnerRole }} · {{ conversation.setup.setting }}</span>
          </div>
          <p>{{ conversation.setup.encounterSummary || conversation.setup.topicSeed }}</p>
          <div v-if="conversation.scene" class="scene-acts">
            <button type="button" class="pp-link" :disabled="sceneStarting" @click="replayScene('same_background')">{{ t('conversation.sameBackground') }}</button>
            <button type="button" class="pp-link" :disabled="sceneStarting" @click="replayScene('new_encounter')">{{ t('conversation.newBackground') }}</button>
            <button type="button" class="pp-link" :class="{ on: conversation.scene.origin.saved }" @click="toggleSceneSaved">{{ conversation.scene.origin.saved ? t('conversation.unsaveBackground') : t('conversation.saveBackground') }}</button>
            <button type="button" class="pp-link" @click="customizeScene">{{ t('conversation.customizeBackground') }}</button>
            <i v-if="sceneStarting" class="scene-wait" role="progressbar" :aria-label="t('scene.presetStarting')"></i>
          </div>
        </section>

        <div v-if="!conversation.messages.length" class="blank" aria-hidden="true">“</div>

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

        <div v-if="sending" class="typing" role="status" aria-live="polite" :aria-label="t('conversation.partnerTyping')">
          <i class="who" aria-hidden="true">{{ partnerInitial }}</i>
          <span aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
      </div>
    </div>

    <div class="desk">
      <div class="desk-in">
        <p v-if="conversation.status === 'archived'" class="desk-note">{{ t('conversation.archivedContinue') }}</p>
        <p v-if="error" class="pp-error" role="alert">{{ error }}</p>
        <component :is="extra" v-for="(extra, at) in aboveComposer" :key="at" :conversation="conversation" />
        <div class="write" :class="{ busy: sending, filled: !!input.trim() }">
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
          <i class="nib" aria-hidden="true"></i>
          <button type="button" class="seal" :class="{ pressed }" :aria-label="t('conversation.send')" :disabled="!input.trim() || sending" @click="press"><Icon name="up" :size="18" :weight="2" /></button>
        </div>
      </div>
    </div>

    <Lookup :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" :target-language-code="targetLanguageCode" @close="lookup.open = false" />
  </div>
  <div v-else class="opening" role="status" :aria-label="t('conversation.opening')"><i></i><i></i><i></i></div>
</template>

<style scoped>
.cv{height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;--shell:1054px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}

.bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;height:64px;padding:0 var(--gutter);border-bottom:1px solid var(--line)}
.back{justify-self:start;width:38px;height:38px;margin-left:-10px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--soft);transition:color .25s,transform .5s var(--out)}
.back:hover{color:var(--ink);transform:translateX(-4px)}
.bar h1{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 17px/1.3 var(--serif);letter-spacing:.01em}
.bar time{justify-self:end;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}

.scroll{overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable both-edges}
.sheet{max-width:var(--shell);margin:0 auto;padding:44px var(--gutter) 40px calc(var(--gutter) + 46px);display:grid;gap:30px}

.scene{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;max-width:660px;padding-bottom:28px;border-bottom:1px solid var(--line)}
.scene .pp-seal{grid-row:span 2;align-self:start}
.scene-who{display:grid;gap:2px}
.scene-who b{font:500 20px/1.3 var(--serif)}
.scene-who span{color:var(--muted);font-size:12.5px}
.scene p{color:var(--soft);font-size:14.5px;line-height:1.85}
.scene-acts{grid-column:2;position:relative;display:flex;flex-wrap:wrap;gap:6px 20px;padding-top:6px}
.scene-acts .pp-link{font-size:12.5px}
.scene-wait{position:absolute;left:0;right:0;bottom:-10px;height:1px;background:linear-gradient(90deg,transparent,var(--red),transparent) 0 0/40% 100% no-repeat;animation:wait 1.2s linear infinite}
@keyframes wait{from{background-position:-60% 0}to{background-position:160% 0}}

.blank{height:38vh;display:grid;place-items:center;color:var(--ink);opacity:.06;font:400 260px/1 var(--serif);user-select:none}

.typing{position:relative;height:30px;display:flex;align-items:center}
.typing .who{position:absolute;left:-46px;top:1px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);font:500 13px/1 var(--serif);font-style:normal}
.typing span{display:flex;gap:7px}
.typing span i{width:6px;height:6px;border-radius:50%;background:var(--ink);animation:ink 1.3s ease-in-out infinite}
.typing span i:nth-child(2){animation-delay:.16s}
.typing span i:nth-child(3){animation-delay:.32s}
@keyframes ink{0%,70%,100%{transform:scale(.5);opacity:.25}35%{transform:scale(1);opacity:.9}}

.desk{border-top:1px solid var(--line);background:var(--paper)}
.desk-in{max-width:var(--shell);margin:0 auto;padding:14px var(--gutter) calc(18px + env(safe-area-inset-bottom)) calc(var(--gutter) + 46px);display:grid;gap:8px}
.desk-note{color:var(--muted);font-size:12.5px;line-height:1.7}
.write{position:relative;display:flex;align-items:flex-end;gap:16px;max-width:660px}
.write textarea{flex:1;min-width:0;height:44px;max-height:180px;padding:10px 0 9px;border:0;border-bottom:1px solid var(--ink);border-radius:0;background:none;color:var(--ink);font:400 17px/1.5 var(--sans);resize:none;outline:0;transition:border-color .3s}
.write.busy textarea{border-bottom-color:var(--line);color:var(--muted)}
.nib{position:absolute;left:0;bottom:12px;width:2px;height:20px;background:var(--red);animation:nib 1.2s steps(2,jump-none) infinite;pointer-events:none}
.write.filled .nib,.write:focus-within .nib,.write.busy .nib{display:none}
@keyframes nib{to{opacity:0}}
.seal{flex:none;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:8px;background:var(--red);color:#fff;transition:transform .45s var(--out),background .3s,color .3s}
.seal:not(:disabled):hover{transform:rotate(-6deg) scale(1.05)}
.seal:not(:disabled):active,.seal.pressed{transform:scale(.86) rotate(-3deg)}
.seal:disabled{background:none;color:var(--muted);box-shadow:inset 0 0 0 1px var(--line)}

.opening{height:100dvh;display:flex;align-items:center;justify-content:center;gap:8px}
.opening i{width:6px;height:6px;border-radius:50%;background:var(--ink);animation:ink 1.3s ease-in-out infinite}
.opening i:nth-child(2){animation-delay:.16s}
.opening i:nth-child(3){animation-delay:.32s}

@media (min-width:1100px){
  .sheet{--cols:minmax(0,660px) 300px;--col-gap:48px;--marks-at:start;--marks-w:100%}
}
@media (max-width:760px){
  .bar{height:56px}
  .bar time{display:none}
  .sheet{padding:26px var(--gutter) 28px;gap:24px}
  .desk-in{padding:10px var(--gutter) calc(12px + env(safe-area-inset-bottom))}
  .typing .who{display:none}
  .scene-acts{grid-column:1 / -1}
  .blank{font-size:180px}
}
@media (prefers-reduced-motion:reduce){.typing span i,.opening i,.nib,.scene-wait{animation:none}}
</style>
