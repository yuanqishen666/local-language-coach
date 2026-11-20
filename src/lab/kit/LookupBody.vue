<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TermLookup } from '../../types'

/** The dictionary entry itself. Each theme wraps it in its own drawer and styles the lk-* classes. */
defineProps<{
  term: string
  sentence: string
  data: TermLookup
  collocations: Array<{ phrase: string; meaning: string }>
  targetLanguageCode: string
}>()
defineSlots<{ speak(props: { speechId: string; text: string }): unknown }>()
const { t } = useI18n()
</script>

<template>
  <div class="lk">
    <div class="lk-meta">
      <span>{{ data.partOfSpeech }}</span>
      <span v-if="data.pronunciation">{{ data.pronunciation }}</span>
      <span v-if="data.lemma && data.lemma !== term">{{ t('lookup.lemma') }} · <b :lang="targetLanguageCode">{{ data.lemma }}</b></span>
    </div>
    <section class="lk-here">
      <h3 class="lk-label">{{ t('lookup.meaningHere') }}</h3>
      <strong>{{ data.contextMeaning }}</strong>
      <div class="lk-quote"><blockquote :lang="targetLanguageCode">{{ sentence }}</blockquote><slot name="speak" speech-id="lookup-context" :text="sentence" /></div>
    </section>
    <section v-if="data.forms?.length" class="lk-forms">
      <h3 class="lk-label">{{ t('lookup.forms') }}</h3>
      <div><span v-for="form in data.forms" :key="form.label + form.value"><b>{{ form.label }}</b><i :lang="targetLanguageCode">{{ form.value }}</i></span></div>
    </section>
    <section class="lk-senses">
      <h3 class="lk-label">{{ t('lookup.meanings') }}</h3>
      <article v-for="(sense, index) in data.senses" :key="sense.meaning + sense.example">
        <em>{{ Number(index) + 1 }}</em>
        <div>
          <b>{{ sense.meaning }}</b>
          <div class="lk-example"><p :lang="targetLanguageCode">{{ sense.example }}</p><slot name="speak" :speech-id="`lookup-example-${index}`" :text="sense.example" /></div>
          <small>{{ sense.translation }}</small>
        </div>
      </article>
    </section>
    <section v-if="collocations.length" class="lk-colls">
      <h3 class="lk-label">{{ t('lookup.collocations') }}</h3>
      <dl>
        <div v-for="(item, index) in collocations" :key="item.phrase + item.meaning">
          <dt :lang="targetLanguageCode"><span>{{ item.phrase }}</span><slot name="speak" :speech-id="`lookup-collocation-${index}`" :text="item.phrase" /></dt>
          <dd v-if="item.meaning">{{ item.meaning }}</dd>
        </div>
      </dl>
    </section>
    <section v-if="data.register || data.regionalNotes" class="lk-usage">
      <h3 class="lk-label">{{ t('lookup.usage') }}</h3>
      <p>{{ data.register }} {{ data.regionalNotes }}</p>
    </section>
  </div>
</template>
