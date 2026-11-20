<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import { useSceneBuilderPage } from '../logic/SceneBuilderPage'

const {
  store, t, loading, startingPreset, setups, actionError, customSection, form, domains, instantPresets, anchorPresets,
  anchorPresetId, anchorValue, selectedAnchorPreset, selectedAnchorMultiline, isStarting, openPreset, startAnchor, generate, start,
} = useSceneBuilderPage()
</script>

<template>
  <div class="pp-page sc" :aria-busy="isStarting || loading">
    <header class="pp-head">
      <h1 class="pp-title">{{ t('home.settingTitle') }}</h1>
      <span class="pp-label pp-num">{{ store.settings?.learning.targetLanguageCode.toUpperCase() }} · {{ store.settings?.learning.proficiency }}</span>
    </header>

    <section class="part" aria-labelledby="sc-quick">
      <header><i>I</i><h2 id="sc-quick">{{ t('scene.quickEyebrow') }}</h2></header>
      <ol class="toc">
        <li v-for="(preset, index) in instantPresets" :key="preset.id">
          <button type="button" :class="{ going: startingPreset === preset.id }" :disabled="isStarting" @click="openPreset(preset.id)">
            <em class="pp-num">{{ String(index + 1).padStart(2, '0') }}</em>
            <b>{{ t(preset.titleKey) }}</b>
            <span class="lead" aria-hidden="true"></span>
            <small>{{ t(preset.descriptionKey) }}</small>
            <Icon name="arrow" :size="16" />
          </button>
        </li>
      </ol>
    </section>

    <section class="part" aria-labelledby="sc-anchor">
      <header><i>II</i><h2 id="sc-anchor">{{ t('scene.anchorEyebrow') }}</h2></header>
      <form class="cue" autocomplete="off" @submit.prevent="startAnchor">
        <div class="pp-seg" role="group" :aria-label="t('scene.anchorType')">
          <button v-for="preset in anchorPresets" :key="preset.id" type="button" :aria-pressed="anchorPresetId === preset.id" @click="anchorPresetId = preset.id">{{ t(preset.titleKey) }}</button>
        </div>
        <div class="cue-line" :class="{ going: isStarting && startingPreset === selectedAnchorPreset.id }">
          <textarea v-if="selectedAnchorMultiline" id="anchor-value" v-model="anchorValue" class="pp-input" name="anchor-value" autocomplete="off" :maxlength="selectedAnchorPreset.anchor.maxLength" :aria-label="t(selectedAnchorPreset.anchor.labelKey)" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)"></textarea>
          <input v-else id="anchor-value" v-model="anchorValue" class="pp-input" name="anchor-value" autocomplete="off" :maxlength="selectedAnchorPreset.anchor.maxLength" :aria-label="t(selectedAnchorPreset.anchor.labelKey)" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)" />
          <button class="pp-btn" type="submit" :disabled="isStarting">{{ t('home.openAction') }}<Icon name="arrow" :size="15" /></button>
        </div>
      </form>
    </section>

    <p v-if="actionError" class="pp-error sc-error" role="alert">{{ actionError }}</p>

    <section ref="customSection" class="part" aria-labelledby="sc-custom">
      <header><i>III</i><h2 id="sc-custom">{{ t('scene.customEyebrow') }}</h2></header>
      <form class="own" autocomplete="off" @submit.prevent="generate">
        <div class="seals" role="group" :aria-label="t('scene.domainLabel')">
          <button v-for="item in domains" :key="item" type="button" :aria-pressed="form.domain === item" @click="form.domain = item">
            <span>{{ item === 'custom' ? '＋' : t(`scene.domain.${item}`).slice(0, 1) }}</span><b>{{ t(`scene.domain.${item}`) }}</b>
          </button>
        </div>
        <div class="own-row">
          <div class="pp-field"><label for="custom-place">{{ t('scene.placeOpenLabel') }}</label><input id="custom-place" v-model="form.place" class="pp-input" name="place" autocomplete="off" /></div>
          <div class="pp-field"><label for="custom-detail">{{ t('scene.topicLabel') }}</label><textarea id="custom-detail" v-model="form.detail" class="pp-input" name="detail" autocomplete="off" rows="1"></textarea></div>
          <button class="pp-btn line" :class="{ going: loading }" type="submit" :disabled="loading || isStarting" :aria-label="loading ? t('scene.generatingOpen') : undefined">{{ t('scene.generateOpen') }}<Icon name="arrow" :size="15" /></button>
        </div>
      </form>

      <div v-if="setups.length" class="people">
        <h3>{{ t('scene.choosePerson') }}</h3>
        <div class="people-grid">
          <article v-for="(setup, index) in setups" :key="setup.title + setup.openingLine" class="person" :style="{ '--i': index }">
            <header>
              <i class="pp-seal" aria-hidden="true">{{ (setup.partnerName || setup.partnerRole).slice(0, 1) }}</i>
              <div><b>{{ setup.partnerName || setup.partnerRole }}</b><span>{{ setup.partnerRole }}</span></div>
              <small class="pp-label">{{ setup.category }} · {{ setup.difficulty }}</small>
            </header>
            <h4>{{ setup.title }}</h4>
            <blockquote>“{{ setup.openingLine }}”</blockquote>
            <button type="button" class="pp-link red" :disabled="isStarting" @click="start(setup)">{{ t('scene.startOpen') }}<Icon name="arrow" :size="14" /></button>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.part{display:grid;grid-template-columns:230px minmax(0,1fr);gap:0 40px;padding:44px 0 50px;border-bottom:1px solid var(--line)}
.part:last-child{border-bottom:0}
.part>header{position:sticky;top:calc(var(--mast) + 24px);align-self:start;display:grid;gap:10px}
.part>header i{color:var(--red);font:italic 400 30px/1 var(--serif)}
.part>header h2{font:500 22px/1.35 var(--serif);letter-spacing:-.01em;text-wrap:balance}

/* I — a table of contents */
.toc{margin:0;padding:0;list-style:none}
.toc li+li{border-top:1px solid var(--faint)}
.toc button{width:100%;display:grid;grid-template-columns:34px auto minmax(24px,1fr) auto 22px;align-items:baseline;gap:0 14px;padding:17px 0;border:0;background:none;text-align:left;transition:opacity .3s}
.toc em{color:var(--muted);font:400 13px/1 var(--serif);font-style:normal;transition:color .3s}
.toc b{font:500 25px/1.25 var(--serif);letter-spacing:-.015em;transition:transform .5s var(--out)}
.lead{align-self:end;height:1px;margin-bottom:7px;background:radial-gradient(circle,rgba(25,22,18,.42) 1px,transparent 1.2px) 0 0/8px 2px repeat-x;height:2px}
.toc small{color:var(--muted);font-size:13px;text-align:right;transition:color .3s}
.toc svg{align-self:center;color:var(--red);opacity:0;transform:translateX(-10px);transition:opacity .3s,transform .5s var(--out)}
.toc button:not(:disabled):hover b{transform:translateX(8px)}
.toc button:not(:disabled):hover em{color:var(--red)}
.toc button:not(:disabled):hover small{color:var(--ink)}
.toc button:not(:disabled):hover svg,.toc .going svg{opacity:1;transform:none}
.toc button:disabled:not(.going){opacity:.32}
.toc .going em{color:var(--red)}
.toc .going .lead{background:linear-gradient(90deg,transparent,var(--red),transparent) 0 0/45% 100% no-repeat;height:1px;animation:run 1.1s linear infinite}
@keyframes run{from{background-position:-80% 0}to{background-position:180% 0}}

/* II — one line to fill in */
.cue{display:grid;gap:26px}
.cue-line{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:22px}
.cue-line .pp-input{font-size:22px}
.cue-line.going::after{content:'';position:absolute;left:0;right:0;bottom:-10px;height:1px;background:linear-gradient(90deg,transparent,var(--red),transparent) 0 0/45% 100% no-repeat;animation:run 1.1s linear infinite}
.sc-error{margin-top:18px;padding-left:270px}

/* III — build it yourself */
.own{display:grid;gap:30px}
.seals{display:flex;flex-wrap:wrap;gap:14px 22px}
.seals button{display:grid;justify-items:center;gap:9px;padding:0;border:0;background:none;color:var(--muted);transition:color .3s}
.seals span{width:58px;height:58px;display:grid;place-items:center;border-radius:8px;box-shadow:inset 0 0 0 1px var(--line);color:var(--ink);font:500 26px/1 var(--serif);transition:transform .5s var(--out),background .3s,color .3s,box-shadow .3s}
.seals b{font-size:12px;font-weight:500}
.seals button:hover span{transform:rotate(-5deg);box-shadow:inset 0 0 0 1px var(--ink)}
.seals button[aria-pressed='true']{color:var(--ink)}
.seals button[aria-pressed='true'] span{background:var(--red);color:var(--paper);transform:rotate(-4deg);box-shadow:inset 0 0 0 1px var(--red),inset 0 0 0 3px var(--red),inset 0 0 0 4px rgba(243,239,230,.6);animation:seal .5s var(--out)}
@keyframes seal{0%{transform:scale(1.35) rotate(-12deg)}60%{transform:scale(.94) rotate(-4deg)}}
.own-row{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr) auto;align-items:end;gap:28px}
.own-row textarea.pp-input{min-height:40px}
.pp-btn.going::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,var(--red),transparent) 0 0/45% 100% no-repeat;animation:run 1.1s linear infinite}

.people{grid-column:2;margin-top:46px}
.people h3{font:500 22px/1.3 var(--serif);margin-bottom:20px}
.people-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.person{display:grid;align-content:start;gap:14px;padding:24px 24px 20px;background:var(--sheet);box-shadow:0 0 0 1px var(--line);transition:transform .6s var(--out),box-shadow .4s;animation:deal .7s var(--out) both;animation-delay:calc(var(--i) * 90ms)}
@keyframes deal{from{opacity:0;transform:translateY(22px) rotate(calc(2deg - var(--i) * 1.6deg))}}
.person:hover{transform:translateY(-5px) rotate(-.5deg);box-shadow:0 0 0 1px var(--ink),0 22px 40px -24px rgba(25,22,18,.4)}
.person header{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px 12px}
.person header div{display:grid;gap:1px}
.person header b{font:500 19px/1.25 var(--serif)}
.person header span{color:var(--muted);font-size:12px}
.person header small{grid-column:1 / -1;margin-top:6px;font-size:10px}
.person h4{margin:0;font-size:14px;font-weight:600;line-height:1.5}
.person blockquote{color:var(--soft);font:italic 400 16px/1.6 var(--serif)}
.person .pp-link{justify-self:start;display:inline-flex;align-items:center;gap:6px;margin-top:4px}

@media (max-width:900px){
  .part{grid-template-columns:1fr;gap:22px;padding:34px 0 38px}
  .part>header{position:static;grid-template-columns:auto 1fr;align-items:baseline;gap:12px}
  .part>header i{font-size:22px}
  .people{grid-column:1}
  .sc-error{padding-left:0}
  .own-row{grid-template-columns:1fr;gap:22px}
  .own-row .pp-btn{justify-self:start}
}
@media (max-width:760px){
  .toc button{grid-template-columns:28px minmax(0,1fr) 20px;padding:14px 0}
  .toc b{font-size:20px}
  .lead{display:none}
  .toc small{grid-column:2;text-align:left;margin-top:3px}
  .toc svg{grid-row:1;grid-column:3;opacity:.5;transform:none}
  .cue-line{grid-template-columns:1fr}
  .cue-line .pp-btn{justify-self:start}
  .cue-line .pp-input{font-size:19px}
  .seals{gap:12px 14px}
  .seals span{width:50px;height:50px;font-size:22px}
}
@media (prefers-reduced-motion:reduce){.person,.seals button[aria-pressed='true'] span{animation:none}}
</style>
