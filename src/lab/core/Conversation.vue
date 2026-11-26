<script setup lang="ts">
import { inject, nextTick, ref, watch, type Component } from 'vue'
import Icon from '../kit/Icon.vue'
import Lookup from './Lookup.vue'
import Turn from './Turn.vue'
import { vTip } from './tip'
import { useConversationPage } from '../logic/ConversationPage'
import { aboveComposer } from '../../conversation-extras'

const {
  router, t, conversation, input, sending, chat, newReplyAvailable, error, lookup, sceneStarting, partnerInitial, targetLanguageCode,
  setupMatchesLocale, conversationTitle, send, openLookup, saveMemory, formatDate, handleComposerKeydown,
  handleCompositionStart, handleCompositionEnd, feedbackFor, replayScene, toggleSceneSaved, customizeScene,
  handleConversationScroll, showLatestReply,
} = useConversationPage()
const mascot = inject<Component | null>('labMascot', null)

// Presentation only: the input grows with the text; scene actions stay folded until asked for.
const pad = ref<HTMLTextAreaElement | null>(null)
const sceneMenu = ref(false)
watch(input, async () => {
  await nextTick()
  const el = pad.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`
})
</script>

<template>
  <div v-if="conversation" class="c-conv">
    <header class="c-conv-bar">
      <button v-tip:bottom="t('common.back')" type="button" class="c-icon" :aria-label="t('common.back')" @click="router.push('/')"><Icon name="back" :size="18" :weight="2" /></button>
      <h1>{{ conversationTitle }}</h1>
      <time>{{ formatDate(conversation.createdAt) }}</time>
    </header>

    <div ref="chat" class="c-conv-scroll" :class="{ 'has-new-reply': newReplyAvailable }" :aria-busy="sending || sceneStarting" @scroll.passive="handleConversationScroll">
      <div class="c-lane">
        <section v-if="conversation.setup && setupMatchesLocale" class="c-scene">
          <i class="c-avatar" aria-hidden="true"><component :is="mascot" v-if="mascot" /><template v-else>{{ partnerInitial }}</template></i>
          <div class="c-scene-who">
            <b>{{ conversation.setup.partnerName || conversation.setup.partnerRole }}</b>
            <span>{{ conversation.setup.partnerRole }} · {{ conversation.setup.setting }}</span>
          </div>
          <button v-if="conversation.scene" type="button" class="c-textbtn c-scene-more" :class="{ on: sceneMenu }" :aria-expanded="sceneMenu" @click="sceneMenu = !sceneMenu">{{ t('nav.more') }}<Icon name="chevron" :size="13" :weight="2.2" /></button>
          <p>{{ conversation.setup.encounterSummary || conversation.setup.topicSeed }}</p>
          <div v-if="conversation.scene && sceneMenu" class="c-scene-acts">
            <button type="button" class="c-btn small" :disabled="sceneStarting" @click="replayScene('same_background')"><Icon name="refresh" :size="14" :weight="2" />{{ t('conversation.sameBackground') }}</button>
            <button type="button" class="c-btn small" :disabled="sceneStarting" @click="replayScene('new_encounter')"><Icon name="repeat" :size="14" :weight="2" />{{ t('conversation.newBackground') }}</button>
            <button type="button" class="c-btn small" :aria-pressed="conversation.scene.origin.saved" @click="toggleSceneSaved"><Icon name="bookmark" :size="14" :weight="2" />{{ conversation.scene.origin.saved ? t('conversation.unsaveBackground') : t('conversation.saveBackground') }}</button>
            <button type="button" class="c-btn small" @click="customizeScene"><Icon name="edit" :size="14" :weight="2" />{{ t('conversation.customizeBackground') }}</button>
            <span v-if="sceneStarting" class="c-dots" role="progressbar" :aria-label="t('scene.presetStarting')"><i></i><i></i><i></i></span>
          </div>
        </section>

        <div v-if="!conversation.messages.length && mascot" class="c-blank" aria-hidden="true"><i><component :is="mascot" mood="wow" /></i></div>

        <Turn
          v-for="(message, index) in conversation.messages"
          :key="message.id"
          :message="message"
          :feedback="feedbackFor(index)"
          :partner-initial="partnerInitial"
          :target-language-code="targetLanguageCode"
          @lookup="openLookup"
          @remember="saveMemory"
        />

        <div v-if="sending" class="c-turn assistant" role="status" aria-live="polite" :aria-label="t('conversation.partnerTyping')">
          <div class="c-msg">
            <i class="c-who" aria-hidden="true"><component :is="mascot" v-if="mascot" mood="talk" /><template v-else>{{ partnerInitial }}</template></i>
            <div class="c-side"><span class="c-said c-typing" aria-hidden="true"><span class="c-dots"><i></i><i></i><i></i></span></span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="c-deck">
      <Transition name="c-new-reply"><button v-if="newReplyAvailable" type="button" class="c-btn small c-new-reply" data-qs-id="qs-new-reply" aria-live="polite" @click="showLatestReply">{{ t('conversation.newReply') }} <span aria-hidden="true">↓</span></button></Transition>
      <div class="c-lane">
        <div class="c-deck-in">
          <p v-if="conversation.status === 'archived'" class="c-deck-note">{{ t('conversation.archivedContinue') }}</p>
          <p v-if="error" class="c-error" role="alert">{{ error }}</p>
          <component :is="extra" v-for="(extra, at) in aboveComposer" :key="at" :conversation="conversation" />
          <div class="c-write">
            <label class="c-sr" for="conversation-message">{{ t('conversation.openPlaceholder') }}</label>
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
            <button v-tip="t('conversation.send')" type="button" class="c-send" :aria-label="t('conversation.send')" :disabled="!input.trim() || sending" @click="send"><Icon name="up" :size="20" :weight="2.4" /></button>
          </div>
        </div>
      </div>
    </div>

    <Lookup :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" :target-language-code="targetLanguageCode" @close="lookup.open = false" />
  </div>
  <div v-else class="c-opening" role="status" :aria-label="t('conversation.opening')"><span class="c-dots big"><i></i><i></i><i></i></span></div>
</template>
