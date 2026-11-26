<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Bubble from './Bubble.vue'
import Face from './Face.vue'
import Lookup from './Lookup.vue'
import { useConversationPage } from '../logic/ConversationPage'
import { aboveComposer } from '../../conversation-extras'

const {
  router, t, conversation, input, sending, chat, newReplyAvailable, error, lookup, sceneStarting, partnerInitial, targetLanguageCode,
  setupMatchesLocale, conversationTitle, send, openLookup, saveMemory, formatDate, handleComposerKeydown,
  handleCompositionStart, handleCompositionEnd, feedbackFor, replayScene, toggleSceneSaved, customizeScene,
  handleConversationScroll, showLatestReply,
} = useConversationPage()

// Presentation only: the input grows with the text; the send button squashes when a message leaves.
const pad = ref<HTMLTextAreaElement | null>(null)
const squash = ref(false)
watch(input, async () => {
  await nextTick()
  const el = pad.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`
})
watch(sending, (now) => {
  if (!now) return
  squash.value = true
  window.setTimeout(() => { squash.value = false }, 520)
})
</script>

<template>
  <div v-if="conversation" class="cv">
    <header class="bar">
      <button type="button" class="bk-round" :aria-label="t('common.close')" @click="router.push('/')"><Icon name="back" :size="19" :weight="2.4" /></button>
      <h1>{{ conversationTitle }}</h1>
      <time class="bk-num">{{ formatDate(conversation.createdAt) }}</time>
    </header>

    <div ref="chat" class="scroll" :class="{ 'has-new-reply': newReplyAvailable }" :aria-busy="sending || sceneStarting" @scroll.passive="handleConversationScroll">
      <div class="lane">
        <section v-if="conversation.setup && setupMatchesLocale" class="scene">
          <i class="mug" aria-hidden="true"><Face :mood="sceneStarting ? 'wow' : 'calm'" /></i>
          <div class="scene-who">
            <b>{{ conversation.setup.partnerName || conversation.setup.partnerRole }}</b>
            <span>{{ conversation.setup.partnerRole }} · {{ conversation.setup.setting }}</span>
          </div>
          <p>{{ conversation.setup.encounterSummary || conversation.setup.topicSeed }}</p>
          <div v-if="conversation.scene" class="bk-chips scene-acts">
            <button type="button" :disabled="sceneStarting" @click="replayScene('same_background')">{{ t('conversation.sameBackground') }}</button>
            <button type="button" :disabled="sceneStarting" @click="replayScene('new_encounter')">{{ t('conversation.newBackground') }}</button>
            <button type="button" :aria-pressed="conversation.scene.origin.saved" @click="toggleSceneSaved">{{ conversation.scene.origin.saved ? t('conversation.unsaveBackground') : t('conversation.saveBackground') }}</button>
            <button type="button" @click="customizeScene">{{ t('conversation.customizeBackground') }}</button>
            <span v-if="sceneStarting" class="hops" role="progressbar" :aria-label="t('scene.presetStarting')"><i></i><i></i><i></i></span>
          </div>
        </section>

        <div v-if="!conversation.messages.length" class="blank" aria-hidden="true"><i><Face mood="wow" /></i></div>

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
          <i class="who" aria-hidden="true"><Face mood="talk" /></i>
          <span class="hops" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
      </div>
    </div>

    <div class="deck">
      <Transition name="new-reply"><button v-if="newReplyAvailable" type="button" class="new-reply" data-qs-id="qs-new-reply" aria-live="polite" @click="showLatestReply">{{ t('conversation.newReply') }} <span aria-hidden="true">↓</span></button></Transition>
      <div class="deck-in">
        <p v-if="conversation.status === 'archived'" class="deck-note">{{ t('conversation.archivedContinue') }}</p>
        <p v-if="error" class="bk-error" role="alert">{{ error }}</p>
        <component :is="extra" v-for="(extra, at) in aboveComposer" :key="at" :conversation="conversation" />
        <div class="write">
          <label class="sr" for="conversation-message">{{ t('conversation.openPlaceholder') }}</label>
          <textarea
            id="conversation-message"
            ref="pad"
            v-model="input"
            name="message"
            rows="1"
            autocomplete="off"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @keydown="handleComposerKeydown"
          ></textarea>
          <button type="button" class="send" :class="{ squash }" :aria-label="t('conversation.send')" :disabled="!input.trim() || sending" @click="send"><Icon name="up" :size="22" :weight="2.6" /></button>
        </div>
      </div>
    </div>

    <Lookup :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" :target-language-code="targetLanguageCode" @close="lookup.open = false" />
  </div>
  <div v-else class="opening" role="status" :aria-label="t('conversation.opening')"><span class="hops"><i></i><i></i><i></i></span></div>
</template>

<style scoped>
.cv{box-sizing:border-box;height:100dvh;padding-top:var(--top);display:grid;grid-template-rows:auto minmax(0,1fr) auto}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}

.bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;height:70px;padding:0 20px}
.bar h1{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:19px;font-weight:800;letter-spacing:-.025em}
.bar time{height:32px;padding:0 14px;display:inline-flex;align-items:center;border-radius:999px;background:var(--paper);font-size:12px;font-weight:700}

.scroll{overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.scroll.has-new-reply{padding-bottom:52px}
.lane{max-width:800px;margin:0 auto;padding:14px 20px 34px;display:grid;gap:22px}

.scene{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 16px;padding:22px 24px;border-radius:32px;background:var(--tomato);animation:bk-drop .7s var(--spring) both}
.mug{grid-row:span 2;width:64px;height:64px;display:grid;place-items:center;border-radius:22px;background:var(--sun);font-size:15px;font-style:normal;--face-mouth:var(--ink);transform:rotate(-6deg);transition:transform .5s var(--spring)}
.scene:hover .mug{transform:rotate(6deg) scale(1.08)}
.scene-who{display:grid;gap:2px;align-content:center}
.scene-who b{font-size:26px;font-weight:800;letter-spacing:-.035em;line-height:1.1}
.scene-who span{font-size:12.5px;font-weight:700;opacity:.7}
.scene p{font-size:15px;font-weight:600;line-height:1.65}
.scene-acts{grid-column:1 / -1;align-items:center;margin-top:6px}
.scene-acts button{height:36px;padding:0 15px;font-size:12.5px}
.scene-acts button:disabled{opacity:.4}

.blank{display:grid;place-items:center;padding:8vh 0}
.blank i{width:150px;height:150px;display:grid;place-items:center;border-radius:50%;background:var(--cobalt);font-size:36px;animation:float 3.4s ease-in-out infinite alternate}
@keyframes float{to{transform:translateY(-14px) rotate(4deg)}}

.typing{display:flex;align-items:center;gap:12px}
.who{width:46px;height:46px;display:grid;place-items:center;border-radius:16px;background:var(--cobalt);font-size:11px;font-style:normal;animation:nod .7s ease-in-out infinite alternate}
@keyframes nod{to{transform:rotate(-7deg) translateY(-2px)}}
.typing .hops{height:46px;padding:0 20px;border-radius:6px 23px 23px 23px;background:var(--paper)}
.hops{display:inline-flex;align-items:center;gap:7px}
.hops i{width:9px;height:9px;border-radius:50%;background:var(--ink);animation:hop .5s var(--out) infinite alternate}
.hops i:nth-child(2){background:var(--tomato);animation-delay:.12s}
.hops i:nth-child(3){background:var(--cobalt);animation-delay:.24s}
.scene .hops i{background:var(--ink)}
@keyframes hop{to{transform:translateY(-8px)}}

.deck{position:relative}.new-reply{position:absolute;left:50%;top:-36px;z-index:4;min-height:30px;padding:0 13px;border:2px solid var(--ink);border-radius:14px;background:var(--paper);color:var(--ink);box-shadow:4px 4px 0 var(--ink);font-size:12px;font-weight:800;transform:translateX(-50%)}
.new-reply-enter-active,.new-reply-leave-active{transition:opacity .16s ease,transform .28s var(--spring)}.new-reply-enter-from,.new-reply-leave-to{opacity:0;transform:translate(-50%,8px)}
.deck-in{max-width:800px;margin:0 auto;padding:4px 20px calc(18px + env(safe-area-inset-bottom));display:grid;gap:8px}
.deck-note{padding:0 8px;color:var(--soft);font-size:12.5px;font-weight:600;line-height:1.6}
.write{display:flex;align-items:flex-end;gap:10px;padding:8px 8px 8px 24px;border-radius:32px;background:var(--paper);box-shadow:inset 0 0 0 3px transparent;transition:box-shadow .2s,transform .5s var(--spring)}
.write:focus-within{box-shadow:inset 0 0 0 3px var(--ink)}
.write textarea{flex:1;min-width:0;height:48px;max-height:168px;padding:11px 0;border:0;background:none;font-size:17px;font-weight:600;line-height:1.5;resize:none;outline:0}
.write.busy textarea{color:var(--muted)}
.send{flex:none;width:48px;height:48px;display:grid;place-items:center;border:0;border-radius:50%;background:var(--sun);transition:transform .5s var(--spring),background .2s,border-radius .3s}
.send:not(:disabled):hover{transform:scale(1.14) rotate(-12deg)}
.send:not(:disabled):active{transform:scale(1.2,.7)}
.send:disabled{background:var(--dent);color:var(--muted)}
.send.squash{animation:squash .52s var(--spring)}
.send.squash svg{animation:toss .52s var(--out)}
@keyframes squash{0%{transform:scale(1.25,.6)}45%{transform:scale(.8,1.25)}100%{transform:none}}
@keyframes toss{0%{transform:none;opacity:1}50%{transform:translateY(-34px);opacity:0}51%{transform:translateY(20px);opacity:0}100%{transform:none;opacity:1}}

.opening{height:100dvh;display:grid;place-items:center}
.opening .hops i{width:16px;height:16px}

@media (max-width:760px){
  .bar{height:60px;padding:0 12px;gap:10px}
  .bar time{display:none}
  .lane{padding:8px 12px 24px;gap:18px}
  .scene{padding:18px;border-radius:28px}
  .mug{width:52px;height:52px;border-radius:18px;font-size:12px}
  .scene-who b{font-size:22px}
  .who{width:36px;height:36px;border-radius:13px;font-size:8.5px}
  .deck-in{padding:4px 10px calc(10px + env(safe-area-inset-bottom))}
  .write{padding-left:20px}
}
@media (prefers-reduced-motion:reduce){.scroll{scroll-behavior:auto}.hops i,.who,.blank i,.scene,.send.squash,.send.squash svg{animation:none}.new-reply-enter-active,.new-reply-leave-active{transition:opacity .12s}.new-reply-enter-from,.new-reply-leave-to{transform:translateX(-50%)}}
</style>
