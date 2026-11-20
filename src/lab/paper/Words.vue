<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { useWordbookPage } from '../logic/WordbookPage'

const { t, query, selected, localizing, error, current, shown, selectWord, remove, formatDate } = useWordbookPage()
</script>

<template>
  <div class="pp-page wd">
    <header class="pp-head">
      <h1 class="pp-title">{{ t('words.title') }}</h1>
      <RouterLink to="/review" class="pp-btn line"><Icon name="repeat" :size="15" />{{ t('words.reviewDue') }}</RouterLink>
    </header>

    <label class="find">
      <Icon name="search" :size="17" />
      <input v-model="query" type="search" :placeholder="t('words.search')" :aria-label="t('words.search')" />
      <span class="pp-num">{{ shown.length }}</span>
    </label>
    <p v-if="error" class="pp-error">{{ error }}</p>

    <div v-if="shown.length" class="spread" :class="{ reading: !!selected }">
      <div class="index">
        <button v-for="word in shown" :key="word.id" type="button" :disabled="localizing === word.id" :class="{ on: selected?.id === word.id }" @click="selectWord(word)">
          <b :lang="word.language">{{ word.term }}</b>
          <i v-if="word.lemma !== word.term" :lang="word.language">{{ word.lemma }}</i>
          <span v-if="current(word)">{{ word.meaning }}</span>
          <small class="pp-num">{{ formatDate(word.created_at) }}</small>
        </button>
      </div>

      <Transition name="entry" mode="out-in">
        <aside v-if="selected" :key="selected.id" class="entry">
          <button type="button" class="shut" :aria-label="t('common.close')" @click="selected = null"><Icon name="close" :size="18" /></button>
          <span class="pp-label">{{ selected.language.toUpperCase() }}</span>
          <div class="head"><h2 :lang="selected.language">{{ selected.term }}</h2><Speak :speech-id="`word-${selected.id}-term`" :text="selected.term" :language-code="selected.language" /></div>
          <p class="meaning">{{ selected.meaning }}</p>
          <div v-if="selected.source_sentence" class="origin"><blockquote :lang="selected.language">{{ selected.source_sentence }}</blockquote><Speak :speech-id="`word-${selected.id}-context`" :text="selected.source_sentence" :language-code="selected.language" compact /></div>
          <section v-if="selected.details?.senses">
            <h3 class="pp-label">{{ t('words.commonUses') }}</h3>
            <article v-for="(sense, senseIndex) in selected.details.senses" :key="sense.meaning + sense.example">
              <em>{{ Number(senseIndex) + 1 }}</em>
              <div>
                <b>{{ sense.meaning }}</b>
                <div class="example"><p :lang="selected.language">{{ sense.example }}</p><Speak :speech-id="`word-${selected.id}-example-${senseIndex}`" :text="sense.example" :language-code="selected.language" compact /></div>
                <small>{{ sense.translation }}</small>
              </div>
            </article>
          </section>
          <button type="button" class="pp-link red" @click="remove(selected.id)">{{ t('words.remove') }}</button>
        </aside>
        <div v-else class="mark" aria-hidden="true">Aa</div>
      </Transition>
    </div>
    <p v-else class="pp-empty">{{ t('words.emptyTitle') }}</p>
  </div>
</template>

<style scoped>
.find{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;margin-top:30px;padding:0 2px;border-bottom:1px solid var(--ink);color:var(--muted)}
.find input{height:46px;padding:0;border:0;background:none;color:var(--ink);font:400 18px/1 var(--serif);outline:0}
.find input::placeholder{color:rgba(25,22,18,.3)}
.find input::-webkit-search-cancel-button{display:none}
.find span{font:400 18px/1 var(--serif)}
.find:focus-within{color:var(--ink)}

.spread{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:0 64px;margin-top:8px;align-items:start}
.index{display:grid}
.index button{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:2px 12px;padding:16px 0 16px 0;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;transition:padding .5s var(--out)}
.index button::before{content:'';position:absolute;left:0;top:50%;width:6px;height:6px;border-radius:50%;background:var(--red);transform:translateY(-50%) scale(0);transition:transform .4s var(--out)}
.index b{font:500 23px/1.25 var(--serif);letter-spacing:-.01em;overflow-wrap:anywhere}
.index i{grid-column:1;color:var(--muted);font:italic 400 13px/1.3 var(--serif)}
.index span{grid-column:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--soft);font-size:13px}
.index small{grid-row:1;grid-column:2;color:var(--muted);font-size:11px}
.index button:hover,.index button.on{padding-left:18px}
.index button:hover::before,.index button.on::before{transform:translateY(-50%) scale(1)}
.index button:disabled{opacity:.45}

.entry{position:sticky;top:calc(var(--mast) + 28px);display:grid;gap:18px;padding:34px 0 10px}
.entry-enter-active{transition:opacity .45s,transform .6s var(--out)}
.entry-leave-active{transition:opacity .15s}
.entry-enter-from{opacity:0;transform:translateY(14px)}
.entry-leave-to{opacity:0}
.shut{display:none}
.head{display:flex;align-items:center;gap:12px}
.head h2{font:500 clamp(48px,5.4vw,76px)/1 var(--serif);letter-spacing:-.04em;overflow-wrap:anywhere}
.meaning{font:400 22px/1.5 var(--serif)}
.origin{display:flex;align-items:flex-start;gap:8px}
.origin blockquote{padding-left:16px;border-left:1px solid var(--red);color:var(--soft);font:italic 400 17px/1.7 var(--serif)}
.entry section{margin-top:10px}
.entry h3{margin-bottom:6px}
.entry article{display:grid;grid-template-columns:24px minmax(0,1fr);padding:13px 0;border-top:1px solid var(--line)}
.entry article em{color:var(--red);font:500 14px/1.7 var(--serif);font-style:normal}
.entry article b{font-size:15px;font-weight:600;line-height:1.6}
.example{display:flex;align-items:flex-start;gap:6px;margin-top:3px}
.example p{font:400 16px/1.65 var(--serif)}
.entry article small{display:block;margin-top:2px;color:var(--muted);font-size:12.5px;line-height:1.7}
.entry>.pp-link{justify-self:start;margin-top:6px;font-size:12px}
.mark{position:sticky;top:calc(var(--mast) + 28px);height:46vh;display:grid;place-items:center;color:var(--ink);opacity:.05;font:italic 400 220px/1 var(--serif);user-select:none}

@media (max-width:900px){
  .spread{grid-template-columns:1fr}
  .mark{display:none}
  .entry{position:fixed;z-index:70;left:0;right:0;bottom:0;top:auto;max-height:84dvh;overflow-y:auto;padding:30px var(--gutter) calc(28px + env(safe-area-inset-bottom));background:var(--sheet);box-shadow:0 0 0 1px var(--line),0 -30px 80px -20px rgba(25,22,18,.4)}
  .entry-enter-from{transform:translateY(40px)}
  .shut{position:absolute;right:14px;top:14px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--muted)}
  .head h2{font-size:44px}
}
</style>
