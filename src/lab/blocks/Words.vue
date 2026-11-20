<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Face from './Face.vue'
import Speak from './Speak.vue'
import { useWordbookPage } from '../logic/WordbookPage'

const { t, query, selected, localizing, error, current, shown, selectWord, remove, formatDate } = useWordbookPage()

const tones = ['t-sun', 't-mint', 't-lilac', 't-peach', 't-paper', 't-cobalt']
</script>

<template>
  <div class="bk-page wd">
    <header class="bk-head">
      <h1 class="bk-title">{{ t('words.title') }}</h1>
      <RouterLink to="/review" class="bk-btn"><Icon name="repeat" :size="17" :weight="2.2" />{{ t('words.reviewDue') }}</RouterLink>
    </header>

    <label class="find">
      <Icon name="search" :size="20" :weight="2.4" />
      <input v-model="query" type="search" :placeholder="t('words.search')" :aria-label="t('words.search')" />
      <span class="bk-num">{{ shown.length }}</span>
    </label>
    <p v-if="error" class="bk-error">{{ error }}</p>

    <div v-if="shown.length" class="spread" :class="{ reading: !!selected }">
      <TransitionGroup tag="div" name="tile" class="tiles">
        <button v-for="(word, index) in shown" :key="word.id" type="button" class="tile" :disabled="localizing === word.id" :class="[tones[index % tones.length], { on: selected?.id === word.id, busy: localizing === word.id }]" @click="selectWord(word)">
          <b :lang="word.language">{{ word.term }}</b>
          <span v-if="current(word)">{{ word.meaning }}</span>
        </button>
      </TransitionGroup>

      <Transition name="entry" mode="out-in">
        <aside v-if="selected" :key="selected.id" class="entry">
          <header class="t-cobalt">
            <button type="button" class="bk-round shut" :aria-label="t('common.close')" @click="selected = null"><Icon name="close" :size="18" :weight="2.4" /></button>
            <span class="bk-label">{{ selected.language.toUpperCase() }}<template v-if="selected.lemma !== selected.term"> · {{ selected.lemma }}</template> · {{ formatDate(selected.created_at) }}</span>
            <div class="head"><h2 :lang="selected.language">{{ selected.term }}</h2><Speak :speech-id="`word-${selected.id}-term`" :text="selected.term" :language-code="selected.language" /></div>
            <p class="meaning">{{ selected.meaning }}</p>
          </header>
          <div class="more">
            <div v-if="selected.source_sentence" class="origin"><blockquote :lang="selected.language">{{ selected.source_sentence }}</blockquote><Speak :speech-id="`word-${selected.id}-context`" :text="selected.source_sentence" :language-code="selected.language" compact /></div>
            <section v-if="selected.details?.senses">
              <h3 class="bk-label">{{ t('words.commonUses') }}</h3>
              <article v-for="(sense, senseIndex) in selected.details.senses" :key="sense.meaning + sense.example">
                <em class="bk-num">{{ Number(senseIndex) + 1 }}</em>
                <div>
                  <b>{{ sense.meaning }}</b>
                  <div class="example"><p :lang="selected.language">{{ sense.example }}</p><Speak :speech-id="`word-${selected.id}-example-${senseIndex}`" :text="sense.example" :language-code="selected.language" compact /></div>
                  <small>{{ sense.translation }}</small>
                </div>
              </article>
            </section>
            <button type="button" class="bk-link red drop" @click="remove(selected.id)"><Icon name="trash" :size="15" :weight="2" />{{ t('words.remove') }}</button>
          </div>
        </aside>
        <div v-else class="idle" aria-hidden="true"><i><Face mood="wow" /></i></div>
      </Transition>
    </div>
    <div v-else class="none"><i aria-hidden="true"><Face mood="sleepy" /></i><p>{{ t('words.emptyTitle') }}</p></div>
  </div>
</template>

<style scoped>
.find{display:flex;align-items:center;gap:14px;height:64px;margin-bottom:14px;padding:0 12px 0 24px;border-radius:32px;background:var(--paper);box-shadow:inset 0 0 0 3px transparent;transition:box-shadow .2s}
.find:focus-within{box-shadow:inset 0 0 0 3px var(--ink)}
.find input{flex:1;min-width:0;height:100%;border:0;background:none;font-size:17px;font-weight:700;outline:0}
.find input:focus-visible{outline:0}
.find input::placeholder{color:rgba(21,21,21,.32);font-weight:600}
.find input::-webkit-search-cancel-button{display:none}
.find span{min-width:40px;height:40px;padding:0 12px;display:grid;place-items:center;border-radius:999px;background:var(--ink);color:var(--paper);font-size:14px;font-weight:800}
.wd>.bk-error{margin-bottom:14px}

.spread{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:start;gap:14px}

/* every word is a tile; pick one up to read it */
.tiles{position:relative;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start}
.tile{flex:1 1 auto;min-width:150px;max-width:100%;display:grid;gap:4px;align-content:center;min-height:86px;padding:16px 20px;border:0;border-radius:26px;text-align:left;transition:transform .5s var(--spring),border-radius .3s,box-shadow .2s,opacity .2s}
.tile b{font-size:22px;font-weight:800;line-height:1.1;letter-spacing:-.035em;overflow-wrap:anywhere}
.tile span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;opacity:.7}
.tile:hover{transform:translateY(-5px) rotate(-2deg)}
.tile:nth-child(even):hover{transform:translateY(-5px) rotate(2deg)}
.tile:active{transform:scale(.94)}
.tile.on{box-shadow:inset 0 0 0 4px var(--ink);border-radius:999px;padding-left:28px}
.tile.busy{animation:wob .4s ease-in-out infinite alternate}
@keyframes wob{from{transform:rotate(-2deg)}to{transform:rotate(2deg)}}
.tile-move,.tile-enter-active{transition:transform .55s var(--spring),opacity .25s}
.tile-leave-active{position:absolute;transition:transform .3s ease-in,opacity .25s}
.tile-enter-from,.tile-leave-to{opacity:0;transform:scale(.6)}

.entry{position:sticky;top:14px;display:grid;max-height:calc(100dvh - 28px);overflow-y:auto;border-radius:36px;background:var(--paper);scrollbar-width:none}
.entry header{position:relative;display:grid;gap:12px;padding:28px 28px 26px;border-radius:36px;--speak-bg:rgba(255,255,255,.2)}
.entry .bk-label{opacity:.7}
.shut{display:none;position:absolute;top:14px;right:14px;color:var(--ink)}
.head{display:flex;align-items:center;gap:14px}
.head h2{font-size:clamp(42px,4.6vw,68px);font-weight:800;line-height:1;letter-spacing:-.05em;overflow-wrap:anywhere}
.meaning{font-size:20px;font-weight:700;line-height:1.4}
.more{display:grid;gap:18px;padding:22px 28px 26px}
.origin{display:flex;align-items:flex-start;gap:10px;padding:14px 18px;border-radius:4px 20px 20px 20px;background:var(--sun)}
.origin blockquote{flex:1;font-size:15.5px;font-weight:600;line-height:1.6}
.more section{display:grid;gap:10px}
.more article{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;padding:14px 16px;border-radius:20px;background:var(--dent)}
.more em{width:32px;height:32px;display:grid;place-items:center;border-radius:11px;background:var(--ink);color:var(--paper);font-size:14px;font-style:normal;font-weight:800}
.more article div{display:grid;gap:4px}
.more article b{font-size:15px;font-weight:800;line-height:1.5}
.example{display:flex!important;align-items:flex-start;gap:8px}
.example p{flex:1;font-size:14.5px;font-weight:600;line-height:1.6}
.more article small{color:var(--muted);font-size:12.5px;line-height:1.6}
.drop{justify-self:start;display:inline-flex;align-items:center;gap:7px}

.idle{position:sticky;top:14px;height:340px;display:grid;place-items:center;border-radius:36px;background:var(--cobalt)}
.idle i{font-size:64px}
.none{display:grid;justify-items:center;gap:22px;padding:60px 0}
.none i{width:130px;height:130px;display:grid;place-items:center;border-radius:50%;background:var(--mint);font-size:30px;--face-mouth:var(--ink)}
.none p{color:var(--soft);font-size:clamp(22px,2.6vw,32px);font-weight:800;letter-spacing:-.03em;text-align:center}

.entry-enter-active{transition:opacity .2s,transform .65s var(--spring)}
.entry-leave-active{transition:opacity .12s}
.entry-enter-from{opacity:0;transform:translateY(20px) rotate(3deg) scale(.94)}
.entry-leave-to{opacity:0}

@media (max-width:900px){
  .spread{grid-template-columns:1fr}
  .idle{display:none}
  .entry{position:fixed;inset:auto 8px 8px;z-index:110;max-height:84dvh;border-radius:32px;box-shadow:0 0 0 100vmax rgba(21,21,21,.45)}
  .entry header{border-radius:32px;padding:24px 22px 22px}
  .more{padding:18px 22px calc(22px + env(safe-area-inset-bottom))}
  .shut{display:grid}
  .entry-enter-from{transform:translateY(60px)}
}
@media (max-width:760px){
  .find{height:56px;padding-left:20px}
  .tile{min-width:128px;min-height:74px;padding:13px 17px;border-radius:22px}
  .tile b{font-size:19px}
}
@media (prefers-reduced-motion:reduce){.tile.busy{animation:none}}
</style>
