<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Flap from './Flap.vue'
import Speak from './Speak.vue'
import { useWordbookPage } from '../logic/WordbookPage'

const { t, query, selected, localizing, error, current, shown, selectWord, remove, formatDate } = useWordbookPage()
</script>

<template>
  <div class="nf-page wd">
    <header class="nf-head">
      <h1 class="nf-title"><Flap :text="t('words.title')" /></h1>
      <RouterLink to="/review" class="nf-btn ghost"><Icon name="repeat" :size="15" />{{ t('words.reviewDue') }}</RouterLink>
    </header>

    <label class="find">
      <Icon name="search" :size="17" />
      <input v-model="query" type="search" :placeholder="t('words.search')" :aria-label="t('words.search')" />
      <span class="nf-mono">{{ String(shown.length).padStart(2, '0') }}</span>
    </label>
    <p v-if="error" class="nf-error">{{ error }}</p>

    <div v-if="shown.length" class="spread" :class="{ reading: !!selected }">
      <div class="index">
        <button v-for="word in shown" :key="word.id" type="button" :disabled="localizing === word.id" :class="{ on: selected?.id === word.id, busy: localizing === word.id }" @click="selectWord(word)">
          <i class="nf-lamp" :class="{ on: selected?.id === word.id, blink: localizing === word.id }"></i>
          <b :lang="word.language">{{ word.term }}</b>
          <span v-if="current(word)">{{ word.meaning }}</span>
          <small class="nf-mono">{{ formatDate(word.created_at) }}</small>
        </button>
      </div>

      <Transition name="entry" mode="out-in">
        <aside v-if="selected" :key="selected.id" class="entry nf-glass">
          <button type="button" class="shut" :aria-label="t('common.close')" @click="selected = null"><Icon name="close" :size="18" /></button>
          <span class="nf-label">{{ selected.language.toUpperCase() }}<template v-if="selected.lemma !== selected.term"> · {{ selected.lemma }}</template></span>
          <div class="head"><h2 :lang="selected.language">{{ selected.term }}</h2><Speak :speech-id="`word-${selected.id}-term`" :text="selected.term" :language-code="selected.language" /></div>
          <p class="meaning">{{ selected.meaning }}</p>
          <div v-if="selected.source_sentence" class="origin"><blockquote :lang="selected.language">{{ selected.source_sentence }}</blockquote><Speak :speech-id="`word-${selected.id}-context`" :text="selected.source_sentence" :language-code="selected.language" compact /></div>
          <section v-if="selected.details?.senses">
            <h3 class="nf-label">{{ t('words.commonUses') }}</h3>
            <article v-for="(sense, senseIndex) in selected.details.senses" :key="sense.meaning + sense.example">
              <em class="nf-mono">{{ String(Number(senseIndex) + 1).padStart(2, '0') }}</em>
              <div>
                <b>{{ sense.meaning }}</b>
                <div class="example"><p :lang="selected.language">{{ sense.example }}</p><Speak :speech-id="`word-${selected.id}-example-${senseIndex}`" :text="sense.example" :language-code="selected.language" compact /></div>
                <small>{{ sense.translation }}</small>
              </div>
            </article>
          </section>
          <button type="button" class="nf-link red drop" @click="remove(selected.id)"><Icon name="trash" :size="14" />{{ t('words.remove') }}</button>
        </aside>
        <div v-else class="idle" aria-hidden="true"><i></i><i></i><i></i></div>
      </Transition>
    </div>
    <p v-else class="nf-empty">{{ t('words.emptyTitle') }}</p>
  </div>
</template>

<style scoped>
.find{display:flex;align-items:center;gap:12px;height:52px;margin-bottom:26px;padding:0 20px;border-radius:999px;background:var(--faint);box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);transition:box-shadow .3s,background .3s}
.find:focus-within{background:rgba(255,182,72,.05);box-shadow:inset 0 0 0 1px var(--amber),0 0 0 4px var(--amber-soft);color:var(--amber)}
.find input{flex:1;min-width:0;height:100%;border:0;background:none;color:var(--text);font-size:15.5px;outline:0}
.find input:focus-visible{outline:0}
.find input::placeholder{color:rgba(234,238,246,.28)}
.find input::-webkit-search-cancel-button{display:none}
.find span{font-size:12px;letter-spacing:.1em}
.wd>.nf-error{margin-bottom:16px}

.spread{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);align-items:start;gap:34px}
.index{display:grid}
.index button{position:relative;display:grid;grid-template-columns:auto minmax(0,auto) minmax(0,1fr) auto;align-items:baseline;gap:14px;padding:17px 14px 17px 6px;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;transition:padding .45s var(--out),background .3s}
.index .nf-lamp{align-self:center;opacity:0;transform:scale(.4);transition:opacity .3s,transform .4s var(--spring)}
.index b{font-size:21px;font-weight:400;letter-spacing:-.02em;transition:color .25s}
.index span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:13.5px}
.index small{color:var(--muted);font-size:11px;letter-spacing:.04em;opacity:.7}
.index button:hover,.index button.on{padding-left:14px;background:linear-gradient(90deg,var(--amber-soft),transparent 80%)}
.index button:hover b,.index button.on b{color:var(--amber)}
.index button.on .nf-lamp,.index button.busy .nf-lamp{opacity:1;transform:none}
.index button.busy{opacity:.6}

.entry{position:sticky;top:calc(var(--bar) + 20px);display:grid;gap:18px;padding:34px 34px 28px;max-height:calc(100dvh - var(--bar) - var(--dock) - 60px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.shut{display:none;position:absolute;top:14px;right:14px;width:38px;height:38px;place-items:center;border:0;border-radius:50%;background:var(--faint);color:var(--soft)}
.head{display:flex;align-items:center;gap:14px}
.head h2{font-size:clamp(40px,4.4vw,60px);font-weight:300;line-height:1.05;letter-spacing:-.045em;overflow-wrap:anywhere}
.meaning{color:var(--amber);font-size:19px;line-height:1.5}
.origin{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-radius:14px;background:var(--faint)}
.origin blockquote{flex:1;color:var(--soft);font-size:15.5px;font-weight:300;line-height:1.7}
.entry section{display:grid;gap:16px;padding-top:20px;border-top:1px dashed var(--line)}
.entry article{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px}
.entry em{padding-top:3px;color:var(--amber);font-size:11.5px;font-style:normal;letter-spacing:.08em}
.entry article div{display:grid;gap:6px}
.entry article b{font-size:15px;font-weight:600}
.example{display:flex!important;align-items:flex-start;gap:8px}
.example p{flex:1;color:var(--soft);font-size:14.5px;line-height:1.7}
.entry article small{color:var(--muted);font-size:12.5px;line-height:1.6}
.drop{justify-self:start;display:inline-flex;align-items:center;gap:7px;margin-top:4px}

/* three runway lights wait where the entry will land */
.idle{position:sticky;top:calc(var(--bar) + 20px);height:300px;display:flex;align-items:center;justify-content:center;gap:14px;border-radius:22px;box-shadow:inset 0 0 0 1px var(--line)}
.idle i{width:6px;height:6px;border-radius:50%;background:var(--muted);opacity:.5}

.entry-enter-active{transition:opacity .4s,transform .6s var(--out)}
.entry-leave-active{transition:opacity .14s}
.entry-enter-from{opacity:0;transform:translateX(26px)}
.entry-leave-to{opacity:0}

@media (max-width:900px){
  .spread{grid-template-columns:1fr}
  .idle{display:none}
  .index button{grid-template-columns:auto minmax(0,1fr) auto}
  .index span{grid-column:2 / -1;grid-row:2}
  .entry{position:fixed;inset:auto 0 0;z-index:110;max-height:82dvh;padding:30px 22px calc(26px + env(safe-area-inset-bottom));border-radius:26px 26px 0 0;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line),0 -30px 80px rgba(0,0,0,.6),0 0 0 100vmax rgba(3,6,12,.6)}
  .shut{display:grid}
  .entry-enter-from{transform:translateY(40px)}
}
</style>
