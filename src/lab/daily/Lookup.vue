<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Fold from './Fold.vue'
import Speak from './Speak.vue'
import { vTip } from '../core/tip'
import { useLookupDrawer } from '../logic/LookupDrawer'
import { gapPieces, sentenceWith } from './text'

const props = defineProps<{ term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }>()
const emit = defineEmits<{ close: [] }>()
const { loading, data, saved, error, targetLanguageCode, collocations, save, t } = useLookupDrawer(props)

// Presentation only. The panel answers one question first, what the word means here, with the
// one sentence it was picked from; everything else is a closed section.
const whole = ref(false)
const context = computed(() => sentenceWith(props.sentence, props.term, targetLanguageCode.value))
const shownText = computed(() => (whole.value ? props.sentence : context.value.sentence))

// A habitual double-click must not open the panel and dismiss it in the same gesture.
let openedAt = 0
watch(() => props.open, (open) => { if (open) { openedAt = performance.now(); whole.value = false } })
function dismiss() {
  if (performance.now() - openedAt > 450) emit('close')
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="y-veil"><div v-if="open" class="y-veil clear" @click="dismiss"></div></Transition>
  <Transition name="y-drawer">
    <aside v-if="open" class="y-drawer y-lookup" :aria-label="t('lookup.title')">
      <header>
        <h2 :lang="targetLanguageCode">{{ term }}</h2>
        <Speak speech-id="lookup-term" :text="term" :language-code="targetLanguageCode" />
        <button v-tip:bottom="t('common.close')" type="button" class="y-ic push" :aria-label="t('common.close')" @click="emit('close')"><Icon name="close" :size="16" :weight="2" /></button>
      </header>

      <div class="y-drawer-body">
        <div v-if="loading" class="y-lk-wait" aria-busy="true"><span class="y-dots"><i></i><i></i><i></i></span></div>
        <p v-else-if="error" class="y-error">{{ error }}</p>
        <template v-else-if="data">
          <p class="y-lk-meta">
            <span>{{ data.partOfSpeech }}</span>
            <span v-if="data.pronunciation">{{ data.pronunciation }}</span>
            <span v-if="data.lemma && data.lemma !== term">{{ t('lookup.lemma') }} <b :lang="targetLanguageCode">{{ data.lemma }}</b></span>
          </p>

          <section class="y-lk-here">
            <h3 class="y-label">{{ t('lookup.meaningHere') }}</h3>
            <strong>{{ data.contextMeaning }}</strong>
            <div class="y-quote">
              <blockquote :lang="targetLanguageCode"><template v-for="(piece, at) in gapPieces(shownText, term)" :key="at"><mark v-if="piece.gap">{{ piece.text }}</mark><template v-else>{{ piece.text }}</template></template></blockquote>
              <div class="y-quote-tools">
                <Speak speech-id="lookup-context" :text="shownText" :language-code="targetLanguageCode" compact />
                <button v-if="context.more" type="button" class="y-link" :aria-expanded="whole" @click="whole = !whole">{{ t('nav.more') }}<Icon name="chevron" :size="12" :weight="2.2" class="turn" /></button>
              </div>
            </div>
          </section>

          <Fold v-if="data.senses?.length" :title="t('lookup.meanings')" :count="data.senses.length">
            <ol class="y-senses">
              <li v-for="(sense, index) in data.senses" :key="sense.meaning + sense.example">
                <b>{{ sense.meaning }}</b>
                <p :lang="targetLanguageCode">{{ sense.example }}<Speak :speech-id="`lookup-example-${index}`" :text="sense.example" :language-code="targetLanguageCode" compact /></p>
                <small v-if="sense.translation">{{ sense.translation }}</small>
              </li>
            </ol>
          </Fold>
          <Fold v-if="collocations.length" :title="t('lookup.collocations')" :count="collocations.length">
            <dl class="y-colls">
              <div v-for="(item, index) in collocations" :key="item.phrase + item.meaning">
                <dt :lang="targetLanguageCode">{{ item.phrase }}<Speak :speech-id="`lookup-collocation-${index}`" :text="item.phrase" :language-code="targetLanguageCode" compact /></dt>
                <dd v-if="item.meaning">{{ item.meaning }}</dd>
              </div>
            </dl>
          </Fold>
          <Fold v-if="data.forms?.length" :title="t('lookup.forms')" :count="data.forms.length">
            <dl class="y-forms"><div v-for="form in data.forms" :key="form.label + form.value"><dt>{{ form.label }}</dt><dd :lang="targetLanguageCode">{{ form.value }}</dd></div></dl>
          </Fold>
          <Fold v-if="data.register || data.regionalNotes" :title="t('lookup.usage')">
            <p class="y-usage">{{ data.register }} {{ data.regionalNotes }}</p>
          </Fold>
        </template>
      </div>

      <footer>
        <button type="button" class="y-btn primary wide" :disabled="loading || saved || !data" @click="save">
          <Icon :name="saved ? 'check' : 'plus'" :size="14" :weight="2.2" />{{ saved ? t('lookup.saved') : t('lookup.add') }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>
