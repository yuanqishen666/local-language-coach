<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { useReviewPage } from '../logic/ReviewPage'

const { t, queue, index, revealed, mode, done, error, loading, word, rate } = useReviewPage()

// Presentation only: the sentence with its gaps, so the answer can be written into them.
const pieces = computed(() => {
  const sentence = word.value?.source_sentence
  if (!sentence || !word.value) return []
  try {
    return sentence.split(new RegExp(`(${word.value.term})`, 'ig')).map((text: string, at: number) => ({ text, gap: at % 2 === 1 }))
  } catch {
    return [{ text: sentence, gap: false }]
  }
})
const left = computed(() => Math.max(0, queue.value.length - index.value))
const grades = computed(() => [
  { value: 1 as const, label: t('review.again'), due: t('review.tenMinutes'), mark: 'M6 6l12 12M18 6 6 18' },
  { value: 2 as const, label: t('review.hard'), due: t('review.oneDay'), mark: 'M12 5 20 19H4Z' },
  { value: 3 as const, label: t('review.good'), due: t('review.threeDays'), mark: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z' },
  { value: 4 as const, label: t('review.easy'), due: t('review.longer'), mark: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' },
])
</script>

<template>
  <div class="pp-page rv">
    <header class="pp-head">
      <h1 class="pp-title">{{ t('review.title') }}</h1>
      <div class="left"><span class="pp-label">{{ t('review.left') }}</span><b class="pp-num">{{ left }}</b></div>
    </header>
    <p v-if="error" class="pp-error">{{ error }}</p>

    <div v-if="word" class="stage">
      <div class="pp-seg modes">
        <button type="button" :aria-pressed="mode === 'production'" @click="mode = 'production'">{{ t('review.recall') }}</button>
        <button type="button" :aria-pressed="mode === 'recognition'" @click="mode = 'recognition'">{{ t('review.recognize') }}</button>
      </div>

      <div class="pile" :class="{ two: left > 1, three: left > 2 }">
        <Transition name="deal" mode="out-in">
          <section :key="word.id" class="sheet" :class="{ revealed }">
            <span class="pp-label pp-num">{{ word.language.toUpperCase() }} · {{ index + 1 }} / {{ queue.length }}</span>

            <template v-if="mode === 'production'">
              <blockquote v-if="pieces.length" class="ask" :lang="revealed ? word.language : undefined">
                <template v-for="(piece, at) in pieces" :key="at"><span v-if="piece.gap" class="gap"><i v-if="revealed">{{ piece.text }}</i></span><template v-else>{{ piece.text }}</template></template>
              </blockquote>
              <blockquote v-else class="ask">{{ word.meaning }}</blockquote>
              <p class="hint">{{ word.meaning }}</p>
            </template>
            <template v-else>
              <h2 class="term" :lang="word.language">{{ word.term }}</h2>
              <blockquote class="ask small" :lang="word.language">{{ word.source_sentence }}</blockquote>
            </template>

            <button v-if="!revealed" type="button" class="pp-btn reveal" @click="revealed = true">{{ t('review.showAnswer') }}</button>
            <Transition name="ink">
              <div v-if="revealed" class="answer">
                <small class="pp-label">{{ t('review.answer') }}</small>
                <div class="answer-head"><h2>{{ mode === 'production' ? word.term : word.meaning }}</h2><Speak speech-id="review-term" :text="word.term" :language-code="word.language" /></div>
                <div v-if="word.details?.senses?.[0]?.example" class="answer-example"><p :lang="word.language">{{ word.details.senses[0].example }}</p><Speak speech-id="review-example" :text="word.details.senses[0].example" :language-code="word.language" compact /></div>
              </div>
            </Transition>
          </section>
        </Transition>
      </div>

      <Transition name="ink">
        <div v-if="revealed" class="grades">
          <button v-for="grade in grades" :key="grade.value" type="button" @click="rate(grade.value)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="grade.mark" pathLength="1" /></svg>
            <b>{{ grade.label }}</b><span>{{ grade.due }}</span>
          </button>
        </div>
      </Transition>
    </div>

    <div v-else-if="!loading && !error" class="finis">
      <i class="pp-seal" aria-hidden="true"><Icon name="check" :size="30" :weight="2" /></i>
      <h2>{{ done ? t('review.done') : t('review.nothingDue') }}</h2>
      <RouterLink to="/words" class="pp-link on">{{ t('review.back') }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.left{display:flex;align-items:baseline;gap:12px}
.left b{font:400 52px/1 var(--serif);letter-spacing:-.04em}
.stage{max-width:720px;margin:34px auto 0;display:grid;gap:30px}
.modes{justify-content:center}

/* a pile of cards: the edges underneath show how many are left */
.pile{position:relative}
.pile::before,.pile::after{content:'';position:absolute;inset:0;background:var(--sheet);box-shadow:0 0 0 1px var(--line);opacity:0;transition:transform .6s var(--out),opacity .4s}
.pile.two::before{opacity:1;transform:translateY(8px) rotate(.7deg)}
.pile.three::after{opacity:1;transform:translateY(15px) rotate(-.9deg)}
.pile::after{z-index:0}
.pile::before{z-index:1}
.sheet{position:relative;z-index:2;min-height:380px;display:grid;align-content:center;justify-items:center;gap:22px;padding:58px 56px 50px;background:var(--sheet);box-shadow:0 0 0 1px var(--line),0 28px 60px -34px rgba(25,22,18,.45);text-align:center}
.sheet>.pp-label{position:absolute;left:24px;top:20px}
.deal-enter-active{transition:transform .65s var(--out),opacity .35s}
.deal-leave-active{transition:transform .38s ease-in,opacity .3s .08s}
.deal-enter-from{opacity:0;transform:translateY(16px) scale(.98)}
.deal-leave-to{opacity:0;transform:translate(-70px,-10px) rotate(-7deg)}

.ask{font:400 clamp(24px,2.7vw,32px)/1.5 var(--serif);letter-spacing:-.01em;text-wrap:balance}
.ask.small{color:var(--soft);font:italic 400 18px/1.7 var(--serif)}
.gap{position:relative;display:inline-block;min-width:3.2em;margin:0 .12em;border-bottom:1.5px solid var(--ink);line-height:1.15;vertical-align:baseline}
.gap i{display:inline-block;padding:0 .14em;color:var(--red);font-style:italic;animation:write .8s var(--out) both}
.gap:empty::before{content:'\00a0'}
.revealed .gap{border-bottom-color:var(--red)}
@keyframes write{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
.hint{color:var(--muted);font-size:14px}
.term{font:500 clamp(46px,6vw,72px)/1.05 var(--serif);letter-spacing:-.04em}
.reveal{margin-top:8px}

.answer{width:100%;display:grid;justify-items:center;gap:10px;padding-top:24px;border-top:1px solid var(--line)}
.answer-head{display:flex;align-items:center;gap:10px}
.answer-head h2{color:var(--red);font:500 34px/1.2 var(--serif);letter-spacing:-.02em}
.answer-example{display:flex;align-items:flex-start;gap:6px;color:var(--soft)}
.answer-example p{font:400 16px/1.65 var(--serif)}
.ink-enter-active{transition:opacity .5s,transform .6s var(--out)}
.ink-enter-from{opacity:0;transform:translateY(10px)}

/* four marks in red pencil */
.grades{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
.grades button{display:grid;justify-items:center;gap:4px;padding:18px 6px 16px;border:0;border-left:1px solid var(--line);background:none;transition:background .3s}
.grades button:first-child{border-left:0}
.grades svg{width:34px;height:34px;margin-bottom:4px;fill:none;stroke:var(--muted);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;transition:stroke .3s,transform .5s var(--out)}
.grades path{stroke-dasharray:1;stroke-dashoffset:0}
.grades b{font:500 17px/1.3 var(--serif)}
.grades span{color:var(--muted);font-size:11.5px}
.grades button:hover{background:var(--faint)}
.grades button:hover svg{stroke:var(--red);transform:scale(1.12) rotate(-4deg)}
.grades button:hover path{animation:draw .6s var(--out)}
.grades button:active svg{transform:scale(.9)}
@keyframes draw{from{stroke-dashoffset:1}}

.finis{min-height:52vh;display:grid;align-content:center;justify-items:center;gap:22px;text-align:center}
.finis .pp-seal{font-size:34px;transform:rotate(-6deg);animation:stamp .7s var(--out) both}
.finis h2{font:500 clamp(28px,3.2vw,40px)/1.25 var(--serif);letter-spacing:-.02em}
@keyframes stamp{0%{opacity:0;transform:scale(1.8) rotate(-18deg)}55%{opacity:1;transform:scale(.94) rotate(-6deg)}}

@media (max-width:760px){
  .left b{font-size:38px}
  .stage{margin-top:24px;gap:24px}
  .sheet{min-height:320px;padding:54px 22px 34px}
  .grades b{font-size:15px}
  .grades svg{width:28px;height:28px}
}
@media (prefers-reduced-motion:reduce){.gap i{animation:none}.finis .pp-seal{animation:none}.grades button:hover path{animation:none}}
</style>
