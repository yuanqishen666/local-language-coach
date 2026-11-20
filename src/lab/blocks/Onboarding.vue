<script setup lang="ts">
import { LOCALE_META, TARGET_LANGUAGES, UI_LOCALES, displayTargetLanguage } from '../../../shared/locales'
import Icon from '../kit/Icon.vue'
import Face from './Face.vue'
import { useOnboardingPage } from '../logic/OnboardingPage'

const { t, step, saving, submitError, levels, draft, chooseLanguage, finish } = useOnboardingPage()

const tones = ['t-sun', 't-mint', 't-lilac', 't-peach']
</script>

<template>
  <main class="ob">
    <aside class="host" :class="`s${step}`" aria-hidden="true">
      <span class="mug"><Face :mood="saving ? 'happy' : step === 1 ? 'calm' : step === 2 ? 'talk' : 'wow'" /></span>
      <i class="shape a"></i><i class="shape b"></i><i class="shape c"></i>
    </aside>

    <div class="desk">
      <header>
        <b>{{ t('product.name') }}</b>
        <span class="steps" :aria-label="`${step} / 3`"><i v-for="n in 3" :key="n" :class="{ on: n <= step, now: n === step }"></i></span>
      </header>

      <Transition name="leaf" mode="out-in">
        <section :key="step" class="leaf">
          <h1 v-if="step === 1">{{ t('onboarding.interfaceTitle') }}</h1>
          <h1 v-else-if="step === 2">{{ t('onboarding.targetTitle') }}</h1>
          <h1 v-else>{{ t('onboarding.levelTitle') }}</h1>

          <div v-if="step === 1" class="picks">
            <button v-for="code in UI_LOCALES" :key="code" type="button" :aria-pressed="draft.uiLocale === code" @click="draft.uiLocale = code">
              <small>{{ LOCALE_META[code].shortCode }}</small><b>{{ LOCALE_META[code].nativeName }}</b>
            </button>
          </div>
          <div v-else-if="step === 2" class="picks">
            <button v-for="item in TARGET_LANGUAGES" :key="item.code" type="button" :aria-pressed="draft.code === item.code" @click="chooseLanguage(item.code, item.name)">
              <small>{{ item.code.toUpperCase() }}</small><b>{{ displayTargetLanguage(item.code, draft.uiLocale) }}</b>
            </button>
          </div>
          <div v-else class="levels">
            <button v-for="(level, at) in levels" :key="level.id" type="button" :class="tones[at % tones.length]" :aria-pressed="draft.level === level.id" @click="draft.level = level.id">
              <span class="tower" aria-hidden="true"><i v-for="n in at + 1" :key="n"></i></span>
              <b>{{ level.id }}</b><span>{{ t(level.key) }}</span>
            </button>
          </div>
        </section>
      </Transition>

      <footer>
        <p class="private"><Icon name="lock" :size="14" :weight="2.2" />{{ t('onboarding.privacy') }}</p>
        <p v-if="submitError" class="bk-error" role="alert">{{ submitError }}</p>
        <div class="nav">
          <button v-if="step > 1" type="button" class="bk-btn line" :disabled="saving" @click="step--">{{ t('common.back') }}</button>
          <button type="button" class="bk-btn next" :disabled="saving" @click="step < 3 ? step++ : finish()">{{ saving ? t('onboarding.saving') : step < 3 ? t('common.continue') : t('onboarding.openWorkspace') }}<Icon v-if="!saving" name="arrow" :size="18" :weight="2.4" /></button>
        </div>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.ob{min-height:100dvh;padding:var(--pad);display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:12px}

/* the host changes colour and face as you go */
.host{position:relative;overflow:hidden;border-radius:38px;background:var(--cobalt);transition:background .5s}
.host.s2{background:var(--tomato)}
.host.s3{background:var(--sun)}
.host.s2,.host.s3{--face-mouth:var(--ink)}
.mug{position:absolute;left:50%;top:50%;font-size:clamp(72px,10vw,150px);transform:translate(-50%,-50%);transition:transform .8s var(--spring)}
.s2 .mug{transform:translate(-50%,-56%) rotate(-5deg)}
.s3 .mug{transform:translate(-50%,-50%) rotate(4deg) scale(1.06)}
.shape{position:absolute;transition:transform .9s var(--spring),background .5s,border-radius .5s}
.shape.a{left:0;top:0;width:clamp(90px,10vw,160px);aspect-ratio:1;border-radius:0 0 100% 0;background:var(--sun)}
.shape.b{right:10%;top:12%;width:clamp(60px,6vw,100px);aspect-ratio:1;border-radius:50%;border:clamp(14px,1.5vw,24px) solid var(--mint)}
.shape.c{left:12%;bottom:12%;width:clamp(90px,9vw,140px);height:clamp(32px,3.2vw,48px);border-radius:999px;background:var(--lilac);transform:rotate(-20deg)}
.s2 .shape.a{background:var(--cobalt);transform:scale(1.2)}
.s2 .shape.b{transform:translate(-30px,40px) scale(1.2)}
.s2 .shape.c{transform:rotate(24deg) translateX(40px)}
.s3 .shape.a{background:var(--tomato);transform:scale(.9)}
.s3 .shape.b{transform:translate(20px,-10px) scale(.8);border-color:var(--cobalt)}
.s3 .shape.c{transform:rotate(-50deg) translateY(-30px);background:var(--ink)}

.desk{display:grid;grid-template-rows:auto 1fr auto;padding:14px 26px 12px 34px}
.desk>header{display:flex;align-items:center;justify-content:space-between;height:56px}
.desk>header b{font-size:16px;font-weight:800;letter-spacing:-.01em}
.steps{display:flex;align-items:center;gap:8px}
.steps i{width:20px;height:20px;border-radius:7px;background:var(--line);transition:background .3s,transform .5s var(--spring),border-radius .3s}
.steps i.on{background:var(--ink)}
.steps i.now{border-radius:50%;transform:scale(1.25);background:var(--tomato)}

.leaf{align-self:center;display:grid;gap:30px;padding:24px 0 34px}
.leaf h1{font-size:clamp(40px,5vw,78px);font-weight:800;line-height:1;letter-spacing:-.05em;text-wrap:balance}

.picks{display:flex;flex-wrap:wrap;gap:10px}
.picks button{display:inline-flex;align-items:center;gap:10px;height:58px;padding:0 24px 0 12px;border:0;border-radius:20px;background:var(--paper);transition:transform .5s var(--spring),background .2s,color .2s,border-radius .3s}
.picks small{min-width:36px;height:36px;padding:0 6px;display:grid;place-items:center;border-radius:12px;background:var(--dent);font-size:11px;font-weight:800;transition:background .2s,color .2s,transform .5s var(--spring)}
.picks b{font-size:17px;font-weight:800;letter-spacing:-.01em}
.picks button:hover{transform:translateY(-4px) rotate(-2deg)}
.picks button:nth-child(even):hover{transform:translateY(-4px) rotate(2deg)}
.picks button:active{transform:scale(.92)}
.picks button[aria-pressed='true']{background:var(--ink);color:var(--paper);border-radius:999px}
.picks button[aria-pressed='true'] small{background:var(--sun);color:var(--ink);transform:rotate(-12deg) scale(1.1)}

/* levels stack up like towers */
.levels{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:10px}
.levels button{display:grid;justify-items:start;align-content:end;gap:6px;min-height:230px;padding:20px;border:0;border-radius:30px;text-align:left;opacity:.5;transition:transform .5s var(--spring),opacity .25s,box-shadow .2s}
.tower{display:flex;flex-direction:column-reverse;gap:4px;margin-bottom:auto}
.tower i{width:34px;height:20px;border-radius:7px;background:var(--ink);transition:transform .5s var(--spring)}
.tower i:last-child{border-radius:999px 999px 7px 7px}
.levels b{font-size:40px;font-weight:800;letter-spacing:-.05em;line-height:1}
.levels button>span:last-child{font-size:13.5px;font-weight:700;line-height:1.5;opacity:.8}
.levels button:hover{opacity:.85;transform:translateY(-6px)}
.levels button:hover .tower i:last-child{transform:translateY(-6px) rotate(-10deg)}
.levels button[aria-pressed='true']{opacity:1;box-shadow:inset 0 0 0 4px var(--ink);transform:translateY(-6px)}

.desk>footer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px 24px;padding-bottom:calc(10px + env(safe-area-inset-bottom))}
.private{display:flex;align-items:center;gap:8px;color:var(--soft);font-size:12.5px;font-weight:600;line-height:1.6}
.private svg{flex:none}
.ob .bk-error{grid-column:1 / -1;grid-row:2}
.nav{display:flex;gap:10px}
.next{height:58px;padding:0 30px;font-size:16px}

.leaf-enter-active{transition:opacity .2s,transform .6s var(--spring)}
.leaf-leave-active{transition:opacity .14s,transform .2s ease-in}
.leaf-enter-from{opacity:0;transform:translateX(50px) rotate(2deg)}
.leaf-leave-to{opacity:0;transform:translateX(-40px)}

@media (max-width:900px){
  .ob{grid-template-columns:1fr;grid-template-rows:210px 1fr}
  .host{border-radius:30px}
  .mug{font-size:72px}
  .desk{padding:6px 8px 4px}
  .leaf{align-self:start;gap:22px;padding:18px 0 26px}
  .picks button{height:50px;padding:0 18px 0 9px;border-radius:17px}
  .picks small{min-width:32px;height:32px}
  .picks b{font-size:15.5px}
  .levels{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr))}
  .levels button{min-height:150px;border-radius:24px}
  .levels b{font-size:30px}
  .desk>footer{grid-template-columns:1fr}
  .nav{justify-content:flex-end}
  .ob .bk-error{grid-row:auto}
}
</style>
