<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Lookup from './Lookup.vue'
import Turn from './Turn.vue'
import { vTip } from '../core/tip'
import { useConversationPage } from '../logic/ConversationPage'
import { aboveComposer } from '../../conversation-extras'
import { composerKeys, keyboardPlatform } from '../../platform'

const {
  router, t, conversation, input, sending, chat, newReplyAvailable, error, lookup, sceneStarting, partnerInitial, targetLanguageCode,
  setupMatchesLocale, conversationTitle, send, openLookup, saveMemory, dismissMemory, undoMemory, conversationMemories,
  forgetConversationMemory, keepConversationMemory, formatDate, handleComposerKeydown,
  handleCompositionStart, handleCompositionEnd, feedbackFor, replayScene, toggleSceneSaved, customizeScene,
  handleConversationScroll, showLatestReply,
  levelLine, canRecap, levelMoved, openRecap, exportMarkdown,
  voiceNote, spokenLine, micOn, micWriting, toggleMic, pressMic, releaseMic, leaveMic,
  call, callNote, callHeard, callWriting, startCall, endCall, pauseCall, callListen, finishCallTurn, typeInstead,
} = useConversationPage()

// Presentation only: the keys are named the way this computer's keyboard prints them.
const keyCaps = composerKeys(keyboardPlatform())
const keysHint = computed(() => t('conversation.keysHint', { send: '\u0001', newline: '\u0002' })
  .split(/([\u0001\u0002])/)
  .filter(Boolean)
  .map((part) => ({
    keys: part === '\u0001' ? keyCaps.send : part === '\u0002' ? keyCaps.newline : null,
    text: part,
  })))

// Presentation only: the input grows with the text; the scene is one line until it is opened.
const pad = ref<HTMLTextAreaElement | null>(null)
const sceneOpen = ref(false)
// What this conversation keeps to itself opens from the bar and closes on a click anywhere else.
const hereOpen = ref(false)
watch(() => conversationMemories.value.length, (count) => { if (!count) hereOpen.value = false })
watch(input, async () => {
  await nextTick()
  const el = pad.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 152)}px`
})
</script>

<template>
  <div v-if="conversation" class="y-conv">
    <header class="y-conv-bar">
      <button v-tip:bottom="t('common.back')" type="button" class="y-ic" :aria-label="t('common.back')" @click="router.push('/')"><Icon name="back" :size="16" :weight="2" /></button>
      <h1>{{ conversationTitle }}</h1>
      <button v-if="conversationMemories.length" type="button" class="y-link y-here-toggle" :class="{ on: hereOpen }" aria-haspopup="dialog" :aria-expanded="hereOpen" :aria-label="t('conversation.hereTitle')" @click="hereOpen = !hereOpen"><Icon name="notebook" :size="14" :weight="2" /><span>{{ t('conversation.hereTitle') }}</span><em class="y-count">{{ conversationMemories.length }}</em></button>
      <button v-tip:bottom="call === 'off' ? t('call.startTip') : ''" type="button" class="y-link y-call-go" :class="{ on: call !== 'off' }" :aria-pressed="call !== 'off'" :aria-label="call === 'off' ? t('call.start') : t('call.end')" @click="call === 'off' ? startCall() : endCall()"><Icon name="call" :size="14" :weight="2" /><span>{{ call === 'off' ? t('call.start') : t('call.end') }}</span></button>
      <button v-if="canRecap" v-tip:bottom="t('recap.openTip')" type="button" class="y-link y-recap-go" @click="openRecap"><Icon name="check" :size="14" :weight="2.2" /><span>{{ t('recap.open') }}</span></button>
      <button v-tip:bottom="t('export.markdown')" type="button" class="y-ic y-export-go" :aria-label="t('export.markdown')" @click="exportMarkdown"><Icon name="download" :size="15" :weight="2" /></button>
      <time>{{ formatDate(conversation.createdAt) }}</time>
      <template v-if="hereOpen && conversationMemories.length">
        <div class="y-here-veil" @click="hereOpen = false"></div>
        <div class="y-here" role="dialog" :aria-label="t('conversation.hereTitle')" @keydown.esc="hereOpen = false">
          <h2 class="y-h2">{{ t('conversation.hereTitle') }}</h2>
          <ul>
            <li v-for="memory in conversationMemories" :key="memory.id">
              <p>{{ memory.value }}</p>
              <span v-if="memory.promotedMemoryId" class="y-tag">{{ t('conversation.memoryStored') }}</span>
              <button v-else type="button" class="y-link" @click="keepConversationMemory(memory)">{{ t('conversation.keepAlways') }}</button>
              <button v-tip:left="t('common.delete')" type="button" class="y-ic danger" :aria-label="t('common.delete')" @click="forgetConversationMemory(memory)"><Icon name="trash" :size="14" :weight="2" /></button>
            </li>
          </ul>
        </div>
      </template>
    </header>

    <div ref="chat" class="y-conv-scroll" :class="{ 'has-new-reply': newReplyAvailable }" :aria-busy="sending || sceneStarting" @scroll.passive="handleConversationScroll">
      <div class="y-lane">
        <section v-if="conversation.setup && setupMatchesLocale" class="y-scene y-fold" :class="{ open: sceneOpen }">
          <button type="button" class="y-scene-head" :aria-expanded="sceneOpen" @click="sceneOpen = !sceneOpen">
            <i aria-hidden="true">{{ partnerInitial }}</i>
            <b>{{ conversation.setup.partnerName || conversation.setup.partnerRole || t('conversation.openLabel') }}</b>
            <span>{{ [conversation.setup.partnerRole, conversation.setup.setting].filter(Boolean).join(' · ') }}</span>
            <Icon name="chevron" :size="13" :weight="2.2" class="turn" />
          </button>
          <div class="y-fold-body"><div :inert="!sceneOpen">
            <div class="y-scene-body">
              <p>{{ conversation.setup.encounterSummary || conversation.setup.topicSeed }}</p>
              <div v-if="conversation.scene" class="y-scene-acts">
                <button type="button" class="y-btn sm" :disabled="sceneStarting" @click="replayScene('same_background')"><Icon name="refresh" :size="13" :weight="2" />{{ t('conversation.sameBackground') }}</button>
                <button type="button" class="y-btn sm" :disabled="sceneStarting" @click="replayScene('new_encounter')"><Icon name="repeat" :size="13" :weight="2" />{{ t('conversation.newBackground') }}</button>
                <button type="button" class="y-btn sm" :aria-pressed="conversation.scene.origin.saved" @click="toggleSceneSaved"><Icon name="bookmark" :size="13" :weight="2" />{{ conversation.scene.origin.saved ? t('conversation.unsaveBackground') : t('conversation.saveBackground') }}</button>
                <button type="button" class="y-btn sm" @click="customizeScene"><Icon name="edit" :size="13" :weight="2" />{{ t('conversation.customizeBackground') }}</button>
                <span v-if="sceneStarting" class="y-dots" role="progressbar" :aria-label="t('scene.presetStarting')"><i></i><i></i><i></i></span>
              </div>
            </div>
          </div></div>
        </section>

        <p v-if="levelLine" class="y-level-line">{{ levelLine }}</p>

        <Turn
          v-for="(message, index) in conversation.messages"
          :key="message.id"
          :message="message"
          :feedback="feedbackFor(index)"
          :partner-initial="partnerInitial"
          :target-language-code="targetLanguageCode"
          @lookup="openLookup"
          @remember="saveMemory"
          @dismiss="dismissMemory"
          @undo="undoMemory"
          @level="levelMoved"
        />

        <div v-if="sending" class="y-turn assistant" role="status" aria-live="polite" :aria-label="t('conversation.partnerTyping')">
          <div class="y-msg"><span class="y-dots y-typing" aria-hidden="true"><i></i><i></i><i></i></span></div>
        </div>
      </div>
    </div>

    <div class="y-deck">
      <Transition name="y-new-reply"><button v-if="newReplyAvailable" type="button" class="y-btn sm y-new-reply" data-qs-id="qs-new-reply" aria-live="polite" @click="showLatestReply">{{ t('conversation.newReply') }} <span aria-hidden="true">↓</span></button></Transition>
      <div class="y-lane">
        <div class="y-deck-in">
          <p v-if="conversation.status === 'archived'" class="y-deck-note">{{ t('conversation.archivedContinue') }}</p>
          <p v-if="error" class="y-error" role="alert">{{ error }}</p>
          <component :is="extra" v-for="(extra, at) in aboveComposer" :key="at" :conversation="conversation" />
          <template v-if="call !== 'off'">
            <div class="y-call" :class="call" role="group" :aria-label="t('call.start')">
              <p class="y-call-state" role="status" aria-live="polite">
                <i class="y-live-dot" :class="{ on: call === 'listening' && !callWriting }" aria-hidden="true"></i>
                <b>{{ callWriting ? t('voice.writing') : t(`call.${call}`) }}</b>
                <span v-if="call === 'listening' && callHeard" :lang="targetLanguageCode">{{ callHeard }}</span>
              </p>
              <div class="y-call-acts">
                <button v-if="call === 'listening'" v-tip="t('call.doneTip')" type="button" class="y-btn sm primary" :disabled="callWriting" @click="finishCallTurn">{{ t('voice.finish') }}</button>
                <button v-else-if="call === 'speaking'" v-tip="t('call.talkTip')" type="button" class="y-btn sm primary" @click="callListen"><Icon name="mic" :size="14" :weight="2" />{{ t('call.talk') }}</button>
                <button v-else-if="call === 'paused'" type="button" class="y-btn sm primary" @click="callListen"><Icon name="mic" :size="14" :weight="2" />{{ t('call.resume') }}</button>
                <button v-if="call === 'listening' || call === 'speaking'" v-tip="t('call.pause')" type="button" class="y-ic" :aria-label="t('call.pause')" :disabled="callWriting" @click="pauseCall"><Icon name="pause" :size="15" :weight="2" /></button>
                <button v-tip="t('call.typeTip')" type="button" class="y-link" @click="typeInstead"><Icon name="edit" :size="13" :weight="2" /><span>{{ t('call.type') }}</span></button>
                <button v-tip="t('call.end')" type="button" class="y-ic" :aria-label="t('call.end')" @click="endCall"><Icon name="close" :size="15" :weight="2" /></button>
              </div>
            </div>
            <p v-if="callNote" class="y-keys y-voice-line warn" role="alert">{{ callNote }}</p>
          </template>
          <template v-else>
          <div class="y-write" :class="{ heard: micOn }">
            <label class="y-sr" for="conversation-message">{{ t('conversation.openPlaceholder') }}</label>
            <textarea
              id="conversation-message"
              ref="pad"
              v-model="input"
              name="message"
              rows="1"
              autocomplete="off"
              aria-describedby="conversation-keys"
              :readonly="micOn"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @keydown="handleComposerKeydown"
            ></textarea>
            <button v-tip="micOn ? t('voice.finish') : t('voice.start')" type="button" class="y-mic" :class="{ on: micOn }" :aria-label="micOn ? t('voice.finish') : t('voice.start')" :aria-pressed="micOn" :disabled="sending || micWriting" @pointerdown="pressMic" @pointerup="releaseMic" @pointerleave="leaveMic" @click="toggleMic"><Icon :name="micOn ? 'stop' : 'mic'" :size="16" :weight="2" /></button>
            <button v-tip="t('conversation.send')" type="button" class="y-send" :aria-label="t('conversation.send')" :disabled="!input.trim() || sending || micOn" @click="send"><Icon name="up" :size="16" :weight="2.4" /></button>
          </div>
          <p v-if="micOn" class="y-keys y-voice-line" role="status"><i class="y-live-dot on" aria-hidden="true"></i>{{ micWriting ? t('voice.writing') : t('voice.listening') }}</p>
          <p v-else-if="voiceNote" class="y-keys y-voice-line warn" role="alert">{{ voiceNote }}</p>
          <p v-else-if="spokenLine" class="y-keys y-voice-line">{{ spokenLine }}</p>
          <p v-else id="conversation-keys" class="y-keys">
            <template v-for="(part, index) in keysHint" :key="index">
              <span v-if="part.keys" class="y-keys-combo"><template v-for="(key, at) in part.keys" :key="key"><template v-if="at">+</template><kbd class="y-kbd">{{ key }}</kbd></template></span>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          </template>
        </div>
      </div>
    </div>

    <Lookup :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" :target-language-code="targetLanguageCode" @close="lookup.open = false" />
  </div>
  <div v-else class="y-opening" role="status" :aria-label="t('conversation.opening')"><span class="y-dots"><i></i><i></i><i></i></span></div>
</template>
