<script setup lang="ts">
import { computed } from 'vue'
import Face from './Face.vue'
import Speak from './Speak.vue'
import { useReviewPage } from '../logic/ReviewPage'

const { t, queue, index, revealed, mode, done, error, loading, word, rate } = useReviewPage()

// Presentation only: the sentence with its gaps, so the answer can drop into them.
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
  { value: 1 as const, label: t('review.again'), due: t('review.tenMinutes'), mood: 'worried' as const, tone: 't-tomato' },
  { value: 2 as const, label: t('review.hard'), due: t('review.oneDay'), mood: 'flat' as const, tone: 't-peach' },
  { value: 3 as const, label: t('review.good'), due: t('review.threeDays'), mood: 'calm' as const, tone: 't-sun' },
  { value: 4 as const, label: t('review.easy'), due: t('review.longer'), mood: 'happy' as const, tone: 't-mint' },
])
</script>

<template>
  <div class="bk-page rv">
    <header class="bk-head">
      <h1 class="bk-title">{{ t('review.title') }}</h1>
      <div class="left"><span class="bk-label">{{ t('review.left') }}</span><b class="bk-num">{{ left }}</b></div>
    </header>
    <p v-if="error" class="bk-error">{{ error }}</p>

    <div v-if="word" class="table">
    <div class="stage">
      <div class="top">
        <div class="bk-chips">
          <button type="button" :aria-pressed="mode === 'production'" @click="mode = 'production'">{{ t('review.recall') }}</button>
          <button type="button" :aria-pressed="mode === 'recognition'" @click="mode = 'recognition'">{{ t('review.recognize') }}</button>
        </div>
        <div class="stack" aria-hidden="true"><i v-for="n in queue.length" :key="n" :class="{ done: n <= index, now: n === index + 1 }"></i></div>
      </div>

      <Transition name="deal" mode="out-in">
        <section :key="word.id" class="sheet" :class="{ revealed }">
          <span class="bk-label">{{ word.language.toUpperCase() }} · {{ index + 1 }} / {{ queue.length }}</span>

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

          <button v-if="!revealed" type="button" class="bk-btn sun reveal" @click="revealed = true">{{ t('review.showAnswer') }}</button>
          <Transition name="pop">
            <div v-if="revealed" class="answer">
              <small class="bk-label">{{ t('review.answer') }}</small>
              <div class="answer-head"><h2>{{ mode === 'production' ? word.term : word.meaning }}</h2><Speak speech-id="review-term" :text="word.term" :language-code="word.language" /></div>
              <div v-if="word.details?.senses?.[0]?.example" class="answer-example"><p :lang="word.language">{{ word.details.senses[0].example }}</p><Speak speech-id="review-example" :text="word.details.senses[0].example" :language-code="word.language" compact /></div>
            </div>
          </Transition>
        </section>
      </Transition>

      <Transition name="pop">
        <div v-if="revealed" class="grades">
          <button v-for="grade in grades" :key="grade.value" type="button" :class="grade.tone" @click="rate(grade.value)">
            <i aria-hidden="true"><Face :mood="grade.mood" /></i>
            <b>{{ grade.label }}</b><small>{{ grade.due }}</small>
          </button>
        </div>
      </Transition>
    </div>
    <aside class="buddy" :class="{ revealed }" aria-hidden="true"><span><Face :mood="revealed ? 'wow' : 'calm'" /></span><i></i><i></i></aside>
    </div>

    <div v-else-if="!loading && !error" class="finis">
      <i aria-hidden="true"><Face :mood="done ? 'happy' : 'sleepy'" /></i>
      <h2>{{ done ? t('review.done') : t('review.nothingDue') }}</h2>
      <RouterLink to="/words" class="bk-btn">{{ t('review.back') }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.left{display:flex;align-items:center;gap:12px}
.left .bk-label{opacity:.6}
.left b{min-width:60px;height:60px;padding:0 14px;display:grid;place-items:center;border-radius:20px;background:var(--tomato);font-size:28px;font-weight:800;letter-spacing:-.03em;transform:rotate(4deg)}

.table{display:grid;grid-template-columns:minmax(0,760px) minmax(0,1fr);align-items:stretch;gap:12px}
.stage{display:grid;align-content:start;gap:12px}
/* someone watches from the side and is surprised by every answer */
.buddy{position:relative;min-height:300px;overflow:hidden;border-radius:36px;background:var(--cobalt);transition:background .4s}
.buddy.revealed{background:var(--lilac);--face-mouth:var(--ink)}
.buddy span{position:absolute;left:50%;top:50%;font-size:clamp(46px,6vw,92px);transform:translate(-50%,-50%);transition:transform .7s var(--spring)}
.buddy.revealed span{transform:translate(-50%,-58%) rotate(-6deg) scale(1.08)}
.buddy i{position:absolute;transition:transform .8s var(--spring)}
.buddy i:nth-of-type(1){left:0;top:0;width:clamp(70px,7vw,110px);aspect-ratio:1;border-radius:0 0 100% 0;background:var(--sun)}
.buddy i:nth-of-type(2){right:12%;bottom:10%;width:clamp(70px,7vw,110px);height:clamp(26px,2.6vw,40px);border-radius:999px;background:var(--tomato);transform:rotate(-22deg)}
.buddy.revealed i:nth-of-type(1){transform:scale(1.3)}
.buddy.revealed i:nth-of-type(2){transform:rotate(30deg) translateY(-20px)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px}
/* one brick per card; they fill in as you go */
.stack{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}
.stack i{width:18px;height:18px;border-radius:6px;background:var(--dent);transition:background .3s,transform .5s var(--spring),border-radius .3s}
.stack i.done{background:var(--ink)}
.stack i.now{background:var(--cobalt);border-radius:50%;transform:scale(1.25)}

.sheet{display:grid;justify-items:start;align-content:start;gap:16px;min-height:300px;padding:30px 34px;border-radius:36px;background:var(--paper)}
.sheet .bk-label{opacity:.5}
.ask{font-size:clamp(26px,3vw,38px);font-weight:800;line-height:1.35;letter-spacing:-.035em}
.ask.small{color:var(--soft);font-size:18px;font-weight:600;line-height:1.65;letter-spacing:0}
.gap{display:inline-block;min-width:3.2em;min-height:1.25em;margin:0 .1em;padding:0 .28em;border-radius:.34em;background:var(--dent);text-align:center;vertical-align:baseline;transition:background .3s}
.gap:empty::before{content:'\00a0'}
.revealed .gap{background:var(--sun)}
.gap i{display:inline-block;font-style:normal;animation:drop .6s var(--spring) both}
@keyframes drop{from{opacity:0;transform:translateY(-26px) rotate(-8deg)}}
.hint{color:var(--soft);font-size:16px;font-weight:600;line-height:1.6}
.term{font-size:clamp(50px,6.4vw,88px);font-weight:800;line-height:1;letter-spacing:-.055em;overflow-wrap:anywhere}
.reveal{margin-top:auto;height:56px;padding:0 30px;font-size:16px}
.answer{width:100%;display:grid;gap:8px;margin-top:auto;padding:18px 20px;border-radius:24px;background:var(--cobalt);color:#fff;--speak-bg:rgba(255,255,255,.2)}
.answer .bk-label{opacity:.7}
.answer-head{display:flex;align-items:center;gap:14px}
.answer-head h2{font-size:32px;font-weight:800;letter-spacing:-.04em;line-height:1.15}
.answer-example{display:flex;align-items:flex-start;gap:8px}
.answer-example p{font-size:15px;font-weight:600;line-height:1.6;opacity:.9}

/* four faces: pick the one that looks like how it went */
.grades{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.grades button{display:grid;justify-items:center;gap:6px;padding:18px 10px 16px;border:0;border-radius:28px;--face-mouth:var(--ink);transition:transform .5s var(--spring),border-radius .3s}
.grades i{height:44px;display:grid;place-items:center;margin-bottom:4px;font-size:19px;transition:transform .5s var(--spring)}
.grades b{font-size:16px;font-weight:800;letter-spacing:-.02em}
.grades small{font-size:12px;font-weight:700;opacity:.6}
.grades button:hover{transform:translateY(-8px) rotate(-3deg)}
.grades button:nth-child(even):hover{transform:translateY(-8px) rotate(3deg)}
.grades button:hover i{transform:scale(1.25)}
.grades button:active{transform:scale(.9,.84)}

.deal-enter-active{transition:opacity .2s,transform .65s var(--spring)}
.deal-leave-active{transition:opacity .2s,transform .28s ease-in}
.deal-enter-from{opacity:0;transform:translateX(70px) rotate(6deg)}
.deal-leave-to{opacity:0;transform:translateX(-70px) rotate(-6deg)}
.pop-enter-active{transition:opacity .2s,transform .6s var(--spring)}
.pop-enter-from{opacity:0;transform:translateY(16px) scale(.9)}

.finis{display:grid;justify-items:center;gap:22px;padding:30px 0 60px;text-align:center}
.finis i{width:190px;height:190px;display:grid;place-items:center;border-radius:50%;background:var(--sun);font-size:44px;--face-mouth:var(--ink);animation:bk-pop .8s var(--spring) both}
.finis h2{font-size:clamp(30px,3.8vw,52px);font-weight:800;letter-spacing:-.045em}

@media (max-width:1100px){
  .table{grid-template-columns:minmax(0,760px)}
  .buddy{display:none}
}
@media (max-width:760px){
  .left b{min-width:48px;height:48px;font-size:22px;border-radius:16px}
  .top{flex-direction:column;align-items:flex-start;gap:10px}
  .stack{justify-content:flex-start}
  .sheet{min-height:270px;padding:24px 22px;border-radius:30px}
  .grades{grid-template-columns:repeat(2,minmax(0,1fr))}
  .grades button{padding:14px 10px 12px;border-radius:24px}
}
@media (prefers-reduced-motion:reduce){.gap i,.finis i{animation:none}}
</style>
