<script setup lang="ts">
import { computed } from 'vue'
import Flap from './Flap.vue'
import Speak from './Speak.vue'
import { useReviewPage } from '../logic/ReviewPage'

const { t, queue, index, revealed, mode, done, error, loading, word, rate } = useReviewPage()

// Presentation only: the sentence with its gaps, and where the plane sits on its route.
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
const flown = computed(() => (word.value ? index.value / Math.max(1, queue.value.length) : done.value ? 1 : 0))
const plane = computed(() => {
  const k = flown.value
  const a = { x: 24, y: 78 }, b = { x: 300, y: -42 }, c = { x: 576, y: 78 }
  const x = (1 - k) ** 2 * a.x + 2 * (1 - k) * k * b.x + k ** 2 * c.x
  const y = (1 - k) ** 2 * a.y + 2 * (1 - k) * k * b.y + k ** 2 * c.y
  const dx = 2 * (1 - k) * (b.x - a.x) + 2 * k * (c.x - b.x)
  const dy = 2 * (1 - k) * (b.y - a.y) + 2 * k * (c.y - b.y)
  return `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`
})
const grades = computed(() => [
  { value: 1 as const, label: t('review.again'), due: t('review.tenMinutes') },
  { value: 2 as const, label: t('review.hard'), due: t('review.oneDay') },
  { value: 3 as const, label: t('review.good'), due: t('review.threeDays') },
  { value: 4 as const, label: t('review.easy'), due: t('review.longer') },
])
</script>

<template>
  <div class="nf-page rv">
    <header class="nf-head">
      <h1 class="nf-title"><Flap :text="t('review.title')" /></h1>
      <div class="left"><span class="nf-label">{{ t('review.left') }}</span><b class="nf-mono">{{ String(left).padStart(2, '0') }}</b></div>
    </header>
    <p v-if="error" class="nf-error">{{ error }}</p>

    <svg v-if="word || (!loading && !error)" class="route" viewBox="0 0 600 96" aria-hidden="true">
      <path class="way" d="M24 78 Q300 -42 576 78" pathLength="1" />
      <path class="flown" d="M24 78 Q300 -42 576 78" pathLength="1" :style="{ strokeDashoffset: 1 - flown }" />
      <circle cx="24" cy="78" r="4" class="from" /><circle cx="576" cy="78" r="4" :class="{ from: flown === 1 }" />
      <g class="plane" :style="{ transform: plane }"><path d="M-9-8 10 0-9 8-5 0Z" /></g>
    </svg>

    <div v-if="word" class="stage">
      <div class="nf-chips modes">
        <button type="button" :aria-pressed="mode === 'production'" @click="mode = 'production'">{{ t('review.recall') }}</button>
        <button type="button" :aria-pressed="mode === 'recognition'" @click="mode = 'recognition'">{{ t('review.recognize') }}</button>
      </div>

      <Transition name="deal" mode="out-in">
        <section :key="word.id" class="sheet nf-glass" :class="{ revealed }">
          <span class="nf-label">{{ word.language.toUpperCase() }} · {{ String(index + 1).padStart(2, '0') }} / {{ String(queue.length).padStart(2, '0') }}</span>

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

          <button v-if="!revealed" type="button" class="nf-btn reveal" @click="revealed = true">{{ t('review.showAnswer') }}</button>
          <Transition name="lit">
            <div v-if="revealed" class="answer">
              <small class="nf-label">{{ t('review.answer') }}</small>
              <div class="answer-head"><h2>{{ mode === 'production' ? word.term : word.meaning }}</h2><Speak speech-id="review-term" :text="word.term" :language-code="word.language" /></div>
              <div v-if="word.details?.senses?.[0]?.example" class="answer-example"><p :lang="word.language">{{ word.details.senses[0].example }}</p><Speak speech-id="review-example" :text="word.details.senses[0].example" :language-code="word.language" compact /></div>
            </div>
          </Transition>
        </section>
      </Transition>

      <Transition name="lit">
        <div v-if="revealed" class="grades">
          <button v-for="grade in grades" :key="grade.value" type="button" :class="`g${grade.value}`" @click="rate(grade.value)">
            <span class="bars" aria-hidden="true"><i v-for="n in 4" :key="n" :class="{ on: n <= grade.value }"></i></span>
            <b>{{ grade.label }}</b><small class="nf-mono">{{ grade.due }}</small>
          </button>
        </div>
      </Transition>
    </div>

    <div v-else-if="!loading && !error" class="landed">
      <h2>{{ done ? t('review.done') : t('review.nothingDue') }}</h2>
      <RouterLink to="/words" class="nf-btn ghost">{{ t('review.back') }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.left{display:flex;align-items:baseline;gap:12px}
.left b{font-size:34px;font-weight:400;letter-spacing:-.02em;color:var(--amber)}

.rv .nf-head{margin-bottom:10px}
.route{display:block;width:min(560px,100%);margin:-30px auto 0;overflow:visible}
.route path{fill:none}
.way{stroke:rgba(234,238,246,.2);stroke-width:1.2;stroke-dasharray:.01 .012}
.flown{stroke:var(--amber);stroke-width:1.6;stroke-dasharray:1;transition:stroke-dashoffset .9s var(--out)}
.route circle{fill:var(--sky);stroke:rgba(234,238,246,.34);stroke-width:1.4;transition:stroke .4s,fill .4s}
.route circle.from{fill:var(--amber);stroke:var(--amber)}
.plane{transition:transform .9s var(--out)}
.plane path{fill:var(--amber);filter:drop-shadow(0 0 6px rgba(255,182,72,.8))}

.stage{max-width:680px;margin:2px auto 0;display:grid;gap:14px}
.modes{justify-content:center}

.sheet{display:grid;justify-items:start;gap:16px;min-height:290px;padding:28px 34px;align-content:start}
.ask{font-size:clamp(24px,2.9vw,34px);font-weight:300;line-height:1.5;letter-spacing:-.02em}
.ask.small{color:var(--soft);font-size:18px;line-height:1.75;letter-spacing:0}
.gap{display:inline-block;min-width:3.4em;margin:0 .12em;border-bottom:2px solid var(--amber);text-align:center;vertical-align:baseline}
.gap:empty::before{content:'\00a0'}
.gap i{display:inline-block;color:var(--amber);font-style:normal;font-weight:500;animation:land .6s var(--out) both}
@keyframes land{from{opacity:0;transform:translateY(-14px)}}
.hint{color:var(--muted);font-size:15px;line-height:1.6}
.term{font-size:clamp(46px,6vw,76px);font-weight:300;line-height:1.02;letter-spacing:-.05em;overflow-wrap:anywhere}
.reveal{margin-top:auto}
.answer{width:100%;display:grid;gap:8px;margin-top:auto;padding-top:18px;border-top:1px dashed var(--line)}
.answer-head{display:flex;align-items:center;gap:14px}
.answer-head h2{color:var(--amber);font-size:32px;font-weight:400;letter-spacing:-.03em;line-height:1.2}
.answer-example{display:flex;align-items:flex-start;gap:8px}
.answer-example p{color:var(--soft);font-size:15px;line-height:1.7}

/* four keys; the bars on each say how well it went */
.grades{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.grades button{--c:var(--amber);display:grid;justify-items:start;gap:7px;padding:16px 16px 14px;border:0;border-radius:18px;background:var(--faint);box-shadow:inset 0 0 0 1px var(--line);text-align:left;transition:transform .45s var(--spring),box-shadow .3s,background .3s}
.grades .g1{--c:var(--red)}.grades .g3{--c:var(--text)}.grades .g4{--c:var(--green)}
.bars{display:flex;align-items:flex-end;gap:3px;height:18px;margin-bottom:4px}
.bars i{width:5px;border-radius:2px;background:rgba(234,238,246,.16);transition:background .3s,transform .4s var(--spring);transform-origin:bottom}
.bars i:nth-child(1){height:6px}.bars i:nth-child(2){height:10px}.bars i:nth-child(3){height:14px}.bars i:nth-child(4){height:18px}
.bars i.on{background:var(--c)}
.grades b{font-size:15px;font-weight:600}
.grades small{color:var(--muted);font-size:11px;letter-spacing:.04em}
.grades button:hover{transform:translateY(-5px);background:color-mix(in srgb,var(--c) 10%,transparent);box-shadow:inset 0 0 0 1px var(--c)}
.grades button:hover .bars i.on{transform:scaleY(1.2)}
.grades button:hover b{color:var(--c)}
.grades button:active{transform:scale(.95)}

.deal-enter-active{transition:opacity .4s,transform .7s var(--out)}
.deal-leave-active{transition:opacity .2s,transform .3s ease-in}
.deal-enter-from{opacity:0;transform:translateX(50px)}
.deal-leave-to{opacity:0;transform:translateX(-50px)}
.lit-enter-active{transition:opacity .4s,transform .6s var(--out)}
.lit-enter-from{opacity:0;transform:translateY(12px)}

.landed{display:grid;justify-items:center;gap:26px;padding:40px 0 60px;text-align:center}
.landed h2{font-size:clamp(30px,3.6vw,46px);font-weight:300;letter-spacing:-.04em}

@media (max-width:760px){
  .left b{font-size:26px}
  .route{margin-top:0}
  .sheet{min-height:280px;padding:26px 22px}
  .grades{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (prefers-reduced-motion:reduce){.gap i{animation:none}.plane,.flown{transition:none}}
</style>
