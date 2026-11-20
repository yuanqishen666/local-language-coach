<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { vTip } from './tip'
import { useLookupDrawer } from '../logic/LookupDrawer'

const props = defineProps<{ term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }>()
const emit = defineEmits<{ close: [] }>()
const { loading, data, saved, error, targetLanguageCode, collocations, save, t } = useLookupDrawer(props)

// A habitual double-click must not open the panel and dismiss it in the same gesture.
let openedAt = 0
watch(() => props.open, (open) => { if (open) openedAt = performance.now() })
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
  <Transition name="c-veil"><div v-if="open" class="c-veil clear" @click="dismiss"></div></Transition>
  <Transition name="c-sheet">
    <aside v-if="open" class="c-sheet" :aria-label="t('lookup.title')">
      <header>
        <div class="c-sheet-title">
          <small class="c-label">{{ t('lookup.title') }}</small>
          <h2 :lang="targetLanguageCode">{{ term }}</h2>
        </div>
        <Speak speech-id="lookup-term" :text="term" :language-code="targetLanguageCode" />
        <button v-tip:bottom="t('common.close')" type="button" class="c-icon" :aria-label="t('common.close')" @click="emit('close')"><Icon name="close" :size="18" :weight="2" /></button>
      </header>

      <div class="c-sheet-body">
        <div v-if="loading" class="c-dots big" aria-busy="true"><i></i><i></i><i></i></div>
        <p v-else-if="error" class="c-error">{{ error }}</p>
        <div v-else-if="data" class="c-lk">
          <div class="c-lk-meta">
            <span>{{ data.partOfSpeech }}</span>
            <span v-if="data.pronunciation">{{ data.pronunciation }}</span>
            <span v-if="data.lemma && data.lemma !== term">{{ t('lookup.lemma') }} · <b :lang="targetLanguageCode">{{ data.lemma }}</b></span>
          </div>
          <section class="c-lk-here">
            <h3 class="c-label">{{ t('lookup.meaningHere') }}</h3>
            <strong>{{ data.contextMeaning }}</strong>
            <div class="c-quote"><blockquote :lang="targetLanguageCode">{{ sentence }}</blockquote><Speak speech-id="lookup-context" :text="sentence" :language-code="targetLanguageCode" compact /></div>
          </section>

          <details v-if="data.senses?.length" class="c-fold" open>
            <summary><span>{{ t('lookup.meanings') }}</span><em>{{ data.senses.length }}</em><Icon name="chevron" :size="15" :weight="2.2" /></summary>
            <div class="c-senses">
              <article v-for="(sense, index) in data.senses" :key="sense.meaning + sense.example">
                <em>{{ Number(index) + 1 }}</em>
                <div>
                  <b>{{ sense.meaning }}</b>
                  <div class="c-example"><p :lang="targetLanguageCode">{{ sense.example }}</p><Speak :speech-id="`lookup-example-${index}`" :text="sense.example" :language-code="targetLanguageCode" compact /></div>
                  <small>{{ sense.translation }}</small>
                </div>
              </article>
            </div>
          </details>
          <details v-if="collocations.length" class="c-fold">
            <summary><span>{{ t('lookup.collocations') }}</span><em>{{ collocations.length }}</em><Icon name="chevron" :size="15" :weight="2.2" /></summary>
            <dl class="c-colls">
              <div v-for="(item, index) in collocations" :key="item.phrase + item.meaning">
                <dt :lang="targetLanguageCode"><span>{{ item.phrase }}</span><Speak :speech-id="`lookup-collocation-${index}`" :text="item.phrase" :language-code="targetLanguageCode" compact /></dt>
                <dd v-if="item.meaning">{{ item.meaning }}</dd>
              </div>
            </dl>
          </details>
          <details v-if="data.forms?.length" class="c-fold">
            <summary><span>{{ t('lookup.forms') }}</span><em>{{ data.forms.length }}</em><Icon name="chevron" :size="15" :weight="2.2" /></summary>
            <div class="c-forms"><span v-for="form in data.forms" :key="form.label + form.value"><b>{{ form.label }}</b><i :lang="targetLanguageCode">{{ form.value }}</i></span></div>
          </details>
          <details v-if="data.register || data.regionalNotes" class="c-fold">
            <summary><span>{{ t('lookup.usage') }}</span><Icon name="chevron" :size="15" :weight="2.2" /></summary>
            <p class="c-usage">{{ data.register }} {{ data.regionalNotes }}</p>
          </details>
        </div>
      </div>

      <footer>
        <button type="button" class="c-btn primary wide" :disabled="loading || saved || !data" @click="save">
          <Icon :name="saved ? 'check' : 'plus'" :size="17" :weight="2.2" />{{ saved ? t('lookup.saved') : t('lookup.add') }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>
