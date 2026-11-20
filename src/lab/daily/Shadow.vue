<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { vTip } from '../core/tip'
import { useShadow } from '../../shadow'

// `listen` puts the way to hear the sentence inside, for places that have none beside it.
const props = defineProps<{ text: string; languageCode: string; listen?: boolean }>()
const { t, available, open, toggle, read, listening, liveHeard, asking, comparison, pieces, heardText, remarks, note, mine, playMine, canAsk, provider } = useShadow(props)
</script>

<template>
  <button v-if="available" v-tip="t('shadow.startTip')" type="button" class="y-link y-shadow-open" :class="{ on: open }" :aria-expanded="open" @click.stop="toggle"><Icon name="mic" :size="13" :weight="2" />{{ t('shadow.start') }}</button>
  <div v-if="available && open" class="y-shadow" role="group" :aria-label="t('shadow.start')" @click.stop>
    <p class="y-shadow-line" :lang="languageCode"><template v-for="(piece, at) in pieces" :key="at"><mark v-if="piece.word && !piece.heard">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></p>
    <div class="y-shadow-acts">
      <button type="button" class="y-btn sm" :class="{ primary: !listening, live: listening }" :disabled="asking" @click="read()"><Icon :name="listening ? 'stop' : 'mic'" :size="14" :weight="2" />{{ listening ? t('voice.finish') : comparison ? t('shadow.again') : t('shadow.read') }}</button>
      <Speak v-if="listen" :speech-id="`shadow:${text}`" :text="text" :language-code="languageCode" show-label />
      <button v-if="mine" type="button" class="y-link" @click="playMine"><Icon name="play" :size="12" :weight="2" />{{ t('shadow.mine') }}</button>
      <button v-if="canAsk && !listening" v-tip="t('shadow.askTip', { provider })" type="button" class="y-link" :disabled="asking" @click="read(true)">{{ t('shadow.ask') }}</button>
    </div>
    <p v-if="listening" class="y-shadow-state" role="status"><i class="y-live-dot on" aria-hidden="true"></i>{{ liveHeard || t('voice.listening') }}</p>
    <p v-else-if="asking" class="y-shadow-state" role="status"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span>{{ t('shadow.asking') }}</p>
    <template v-else-if="comparison">
      <p class="y-shadow-result" :class="{ ok: !comparison.missed }" role="status">{{ comparison.missed ? t('shadow.missed') : t('shadow.clear') }}</p>
      <p v-if="comparison.missed && heardText" class="y-shadow-heard"><small>{{ t('shadow.heard') }}</small><span :lang="languageCode">{{ heardText }}</span></p>
      <ul v-if="remarks && remarks.length" class="y-shadow-remarks" :aria-label="t('shadow.remarks')"><li v-for="remark in remarks" :key="remark">{{ remark }}</li></ul>
      <p v-else-if="remarks" class="y-shadow-state">{{ t('shadow.noRemarks') }}</p>
    </template>
    <p v-if="note" class="y-error" role="alert">{{ note }}</p>
  </div>
</template>
