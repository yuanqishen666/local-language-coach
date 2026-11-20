<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Flap from './Flap.vue'
import { useSceneBuilderPage } from '../logic/SceneBuilderPage'

const {
  t, loading, startingPreset, setups, actionError, customSection, form, domains, instantPresets, anchorPresets,
  anchorPresetId, anchorValue, selectedAnchorPreset, selectedAnchorMultiline, isStarting, openPreset, startAnchor, generate, start,
} = useSceneBuilderPage()
</script>

<template>
  <div class="nf-page sc" :aria-busy="isStarting || loading">
    <header class="nf-head">
      <h1 class="nf-title"><Flap :text="t('home.settingTitle')" /></h1>
    </header>

    <section class="block" aria-labelledby="sc-quick">
      <h2 id="sc-quick" class="nf-label">{{ t('scene.quickEyebrow') }}</h2>
      <div class="gates">
        <button v-for="(preset, index) in instantPresets" :key="preset.id" type="button" class="gate nf-glass" :class="{ going: startingPreset === preset.id }" :disabled="isStarting" @click="openPreset(preset.id)">
          <span class="no nf-mono">A{{ index + 1 }}</span>
          <i class="nf-lamp" :class="{ 'on blink': startingPreset === preset.id }"></i>
          <b>{{ t(preset.titleKey) }}</b>
          <small>{{ t(preset.descriptionKey) }}</small>
          <Icon name="arrow" :size="17" />
        </button>
      </div>
    </section>

    <section class="block" aria-labelledby="sc-anchor">
      <h2 id="sc-anchor" class="nf-label">{{ t('scene.anchorEyebrow') }}</h2>
      <form class="cue nf-glass" autocomplete="off" @submit.prevent="startAnchor">
        <div class="nf-chips" role="group" :aria-label="t('scene.anchorType')">
          <button v-for="preset in anchorPresets" :key="preset.id" type="button" :aria-pressed="anchorPresetId === preset.id" @click="anchorPresetId = preset.id">{{ t(preset.titleKey) }}</button>
        </div>
        <div class="cue-line">
          <textarea v-if="selectedAnchorMultiline" id="anchor-value" v-model="anchorValue" class="nf-input" name="anchor-value" autocomplete="off" :maxlength="selectedAnchorPreset.anchor.maxLength" :aria-label="t(selectedAnchorPreset.anchor.labelKey)" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)"></textarea>
          <input v-else id="anchor-value" v-model="anchorValue" class="nf-input" name="anchor-value" autocomplete="off" :maxlength="selectedAnchorPreset.anchor.maxLength" :aria-label="t(selectedAnchorPreset.anchor.labelKey)" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)" />
          <button class="nf-btn" type="submit" :disabled="isStarting"><i v-if="isStarting && startingPreset === selectedAnchorPreset.id" class="nf-lamp blink dark"></i>{{ t('home.openAction') }}<Icon name="arrow" :size="16" /></button>
        </div>
      </form>
    </section>

    <p v-if="actionError" class="nf-error" role="alert">{{ actionError }}</p>

    <section ref="customSection" class="block" aria-labelledby="sc-custom">
      <h2 id="sc-custom" class="nf-label">{{ t('scene.customEyebrow') }}</h2>
      <form class="own nf-glass" autocomplete="off" @submit.prevent="generate">
        <div class="dials" role="group" :aria-label="t('scene.domainLabel')">
          <button v-for="item in domains" :key="item" type="button" :aria-pressed="form.domain === item" @click="form.domain = item">
            <span>{{ item === 'custom' ? '+' : t(`scene.domain.${item}`).slice(0, 1) }}</span><b>{{ t(`scene.domain.${item}`) }}</b>
          </button>
        </div>
        <div class="own-row">
          <div class="nf-field"><label for="custom-place">{{ t('scene.placeOpenLabel') }}</label><input id="custom-place" v-model="form.place" class="nf-input" name="place" autocomplete="off" /></div>
          <div class="nf-field"><label for="custom-detail">{{ t('scene.topicLabel') }}</label><textarea id="custom-detail" v-model="form.detail" class="nf-input" name="detail" autocomplete="off" rows="1"></textarea></div>
          <button class="nf-btn ghost" type="submit" :disabled="loading || isStarting" :aria-label="loading ? t('scene.generatingOpen') : undefined"><i v-if="loading" class="nf-lamp on blink"></i>{{ t('scene.generateOpen') }}<Icon name="arrow" :size="16" /></button>
        </div>
      </form>

      <div v-if="setups.length" class="people">
        <h3>{{ t('scene.choosePerson') }}</h3>
        <div class="people-grid">
          <article v-for="(setup, index) in setups" :key="setup.title + setup.openingLine" class="ticket" :style="{ '--i': index }">
            <header>
              <i aria-hidden="true">{{ (setup.partnerName || setup.partnerRole).slice(0, 1) }}</i>
              <div><b>{{ setup.partnerName || setup.partnerRole }}</b><span>{{ setup.partnerRole }}</span></div>
            </header>
            <div class="ticket-body">
              <small class="nf-label">{{ setup.category }} · {{ setup.difficulty }}</small>
              <h4>{{ setup.title }}</h4>
              <blockquote>“{{ setup.openingLine }}”</blockquote>
              <button type="button" class="nf-btn small" :disabled="isStarting" @click="start(setup)">{{ t('scene.startOpen') }}<Icon name="arrow" :size="14" /></button>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.block{margin-top:44px}
.block>h2{margin-bottom:16px}

/* departure gates */
.gates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.gate{position:relative;min-height:168px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-content:space-between;gap:10px 12px;padding:20px 22px;border:0;overflow:hidden;text-align:left;transition:transform .55s var(--spring),box-shadow .3s,opacity .3s}
.gate::before{content:'';position:absolute;inset:0;background:radial-gradient(260px 160px at var(--x,80%) -10%,rgba(255,182,72,.2),transparent 70%);opacity:0;transition:opacity .4s}
.no{color:var(--amber);font-size:12px;letter-spacing:.14em}
.gate .nf-lamp{justify-self:end;margin-top:3px}
.gate b{grid-column:1 / -1;align-self:end;font-size:22px;font-weight:400;letter-spacing:-.025em;line-height:1.2;transition:transform .5s var(--out)}
.gate small{color:var(--muted);font-size:12.5px;line-height:1.6}
.gate svg{align-self:end;color:var(--amber);opacity:0;transform:translateX(-10px);transition:opacity .3s,transform .5s var(--out)}
.gate:not(:disabled):hover{transform:translateY(-5px);box-shadow:inset 0 0 0 1px rgba(255,182,72,.6),0 24px 50px -20px rgba(0,0,0,.7)}
.gate:not(:disabled):hover::before,.gate.going::before{opacity:1}
.gate:not(:disabled):hover svg{opacity:1;transform:none}
.gate:not(:disabled):hover .nf-lamp{background:var(--amber)}
.gate:not(:disabled):active{transform:scale(.98)}
.gate:disabled:not(.going){opacity:.35}
.gate.going{box-shadow:inset 0 0 0 1px var(--amber)}

.cue,.own{display:grid;gap:22px;padding:24px}
.cue-line{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:14px}
.cue-line .nf-input{font-size:17px;min-height:50px;border-radius:999px;padding-left:22px}
.cue-line textarea.nf-input{border-radius:22px}
.cue-line .nf-btn{height:50px}
.nf-lamp.dark{background:#1b1204}
.sc>.nf-error{margin-top:16px}

.dials{display:flex;flex-wrap:wrap;gap:10px}
.dials button{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 18px 0 6px;border:0;border-radius:999px;background:none;box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);transition:color .25s,box-shadow .25s,background .25s,transform .4s var(--spring)}
.dials span{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--faint);font-size:15px;font-weight:600;transition:background .3s,color .3s,transform .5s var(--spring)}
.dials b{font-size:13px;font-weight:500}
.dials button:hover{color:var(--text);box-shadow:inset 0 0 0 1px rgba(234,238,246,.3)}
.dials button:hover span{transform:rotate(-12deg)}
.dials button[aria-pressed='true']{color:var(--amber);background:var(--amber-soft);box-shadow:inset 0 0 0 1px var(--amber)}
.dials button[aria-pressed='true'] span{background:var(--amber);color:#1b1204;animation:pop .5s var(--spring)}
@keyframes pop{from{transform:scale(.5) rotate(-40deg)}}
.own-row{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr) auto;align-items:end;gap:14px}

.people{margin-top:34px}
.people h3{margin-bottom:18px;font-size:24px;font-weight:300;letter-spacing:-.03em}
.people-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}
.ticket{display:grid;grid-template-rows:auto 1fr;filter:drop-shadow(0 22px 34px rgba(0,0,0,.45));transition:transform .55s var(--spring);animation:deal .7s var(--out) both;animation-delay:calc(var(--i) * 90ms)}
@keyframes deal{from{opacity:0;transform:translateY(24px) rotate(calc(2deg - var(--i) * 1.5deg))}}
.ticket:hover{transform:translateY(-6px) rotate(-.6deg)}
.ticket header{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;padding:18px 20px 16px;border-radius:20px 20px 0 0;background:var(--amber);color:#1b1204;-webkit-mask:radial-gradient(circle at 0 100%,transparent 9px,#000 9.5px) bottom left/51% 100% no-repeat,radial-gradient(circle at 100% 100%,transparent 9px,#000 9.5px) bottom right/51% 100% no-repeat;mask:radial-gradient(circle at 0 100%,transparent 9px,#000 9.5px) bottom left/51% 100% no-repeat,radial-gradient(circle at 100% 100%,transparent 9px,#000 9.5px) bottom right/51% 100% no-repeat}
.ticket header i{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:#1b1204;color:var(--amber);font-size:17px;font-style:normal;font-weight:700}
.ticket header div{display:grid;gap:1px}
.ticket header b{font-size:18px;font-weight:700;letter-spacing:-.02em;line-height:1.2}
.ticket header span{font-size:12px;opacity:.7}
.ticket-body{display:grid;align-content:start;justify-items:start;gap:12px;padding:18px 20px 20px;border-radius:0 0 20px 20px;background:var(--raise);border-top:2px dashed rgba(234,238,246,.2);-webkit-mask:radial-gradient(circle at 0 0,transparent 9px,#000 9.5px) top left/51% 100% no-repeat,radial-gradient(circle at 100% 0,transparent 9px,#000 9.5px) top right/51% 100% no-repeat;mask:radial-gradient(circle at 0 0,transparent 9px,#000 9.5px) top left/51% 100% no-repeat,radial-gradient(circle at 100% 0,transparent 9px,#000 9.5px) top right/51% 100% no-repeat}
.ticket h4{font-size:15px;font-weight:600;line-height:1.45}
.ticket blockquote{color:var(--soft);font-size:15px;font-weight:300;line-height:1.65}

@media (max-width:900px){
  .gates{grid-template-columns:repeat(2,minmax(0,1fr))}
  .own-row{grid-template-columns:1fr}
  .own-row .nf-btn{justify-self:start}
}
@media (max-width:760px){
  .block{margin-top:32px}
  .gates{grid-template-columns:1fr;gap:10px}
  .gate{min-height:0;padding:16px 18px}
  .gate svg{opacity:.6;transform:none}
  .cue,.own{padding:18px}
  .cue-line{grid-template-columns:1fr}
  .cue-line .nf-btn{justify-self:start}
}
@media (prefers-reduced-motion:reduce){.ticket,.dials button[aria-pressed='true'] span{animation:none}}
</style>
