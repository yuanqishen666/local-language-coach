<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Face from './Face.vue'
import { useSceneBuilderPage } from '../logic/SceneBuilderPage'

const {
  t, loading, startingPreset, setups, actionError, customSection, form, domains, instantPresets, anchorPresets,
  anchorPresetId, anchorValue, selectedAnchorPreset, selectedAnchorMultiline, isStarting, openPreset, startAnchor, generate, start,
} = useSceneBuilderPage()

const tones = ['t-cobalt', 't-sun', 't-mint', 't-lilac', 't-peach', 't-paper']
</script>

<template>
  <div class="bk-page sc" :aria-busy="isStarting || loading">
    <header class="bk-head"><h1 class="bk-title">{{ t('home.settingTitle') }}</h1></header>

    <section class="bento" :aria-label="t('scene.quickEyebrow')">
      <button v-for="(preset, index) in instantPresets" :key="preset.id" type="button" class="cell" :class="[tones[index % tones.length], { going: startingPreset === preset.id }]" :disabled="isStarting" :aria-label="startingPreset === preset.id ? t('scene.presetStarting') : undefined" @click="openPreset(preset.id)">
        <i class="pic" :class="`p${index % 6}`" aria-hidden="true"><i></i><i></i><i></i></i>
        <b>{{ t(preset.titleKey) }}</b>
        <small>{{ t(preset.descriptionKey) }}</small>
        <span class="go" aria-hidden="true"><Icon name="arrow" :size="18" :weight="2.4" /></span>
      </button>
    </section>

    <section class="cue t-ink" aria-labelledby="sc-anchor">
      <h2 id="sc-anchor">{{ t('scene.anchorEyebrow') }}</h2>
      <form autocomplete="off" @submit.prevent="startAnchor">
        <div class="bk-chips" role="group" :aria-label="t('scene.anchorType')">
          <button v-for="preset in anchorPresets" :key="preset.id" type="button" :aria-pressed="anchorPresetId === preset.id" @click="anchorPresetId = preset.id">{{ t(preset.titleKey) }}</button>
        </div>
        <div class="cue-line">
          <textarea v-if="selectedAnchorMultiline" id="anchor-value" v-model="anchorValue" class="bk-input" name="anchor-value" autocomplete="off" :maxlength="selectedAnchorPreset.anchor.maxLength" :aria-label="t(selectedAnchorPreset.anchor.labelKey)" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)"></textarea>
          <input v-else id="anchor-value" v-model="anchorValue" class="bk-input" name="anchor-value" autocomplete="off" :maxlength="selectedAnchorPreset.anchor.maxLength" :aria-label="t(selectedAnchorPreset.anchor.labelKey)" :placeholder="t(selectedAnchorPreset.anchor.placeholderKey)" />
          <button class="bk-btn sun" type="submit" :disabled="isStarting" :class="{ wait: isStarting && startingPreset === selectedAnchorPreset.id }">{{ t('home.openAction') }}<Icon name="arrow" :size="17" :weight="2.4" /></button>
        </div>
      </form>
    </section>

    <p v-if="actionError" class="bk-error" role="alert">{{ actionError }}</p>

    <section ref="customSection" class="own bk-block" aria-labelledby="sc-custom">
      <h2 id="sc-custom">{{ t('scene.customEyebrow') }}</h2>
      <form autocomplete="off" @submit.prevent="generate">
        <div class="dials" role="group" :aria-label="t('scene.domainLabel')">
          <button v-for="(item, index) in domains" :key="item" type="button" :class="tones[(index + 1) % tones.length]" :aria-pressed="form.domain === item" @click="form.domain = item">{{ t(`scene.domain.${item}`) }}</button>
        </div>
        <div class="own-row">
          <div class="bk-field"><label for="custom-place">{{ t('scene.placeOpenLabel') }}</label><input id="custom-place" v-model="form.place" class="bk-input dent" name="place" autocomplete="off" /></div>
          <div class="bk-field"><label for="custom-detail">{{ t('scene.topicLabel') }}</label><textarea id="custom-detail" v-model="form.detail" class="bk-input dent" name="detail" autocomplete="off" rows="1"></textarea></div>
          <button class="bk-btn" type="submit" :disabled="loading || isStarting" :class="{ wait: loading }" :aria-label="loading ? t('scene.generatingOpen') : undefined">{{ t('scene.generateOpen') }}<Icon name="arrow" :size="17" :weight="2.4" /></button>
        </div>
      </form>
    </section>

    <section v-if="setups.length" class="people">
      <h2>{{ t('scene.choosePerson') }}</h2>
      <div class="people-grid">
        <article v-for="(setup, index) in setups" :key="setup.title + setup.openingLine" class="card" :class="tones[(index + 2) % tones.length]" :style="{ '--i': index }">
          <header>
            <i class="mug" aria-hidden="true"><Face /></i>
            <div><b>{{ setup.partnerName || setup.partnerRole }}</b><span>{{ setup.partnerRole }}</span></div>
          </header>
          <small>{{ setup.category }} · {{ setup.difficulty }}</small>
          <h3>{{ setup.title }}</h3>
          <blockquote>{{ setup.openingLine }}</blockquote>
          <button type="button" class="bk-btn small" :disabled="isStarting" @click="start(setup)">{{ t('scene.startOpen') }}<Icon name="arrow" :size="15" :weight="2.4" /></button>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sc{display:grid;gap:12px}
.sc .bk-head{margin-bottom:14px}

/* the bento: six ways in, each with its own little picture */
.bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));grid-auto-rows:minmax(190px,auto);gap:12px}
.cell{position:relative;grid-column:span 2;display:grid;align-content:end;gap:6px;padding:98px 76px 22px 24px;border:0;border-radius:32px;overflow:hidden;text-align:left;animation:bk-drop .8s var(--spring) both;transition:transform .55s var(--spring),opacity .3s}
.cell:nth-child(2){animation-delay:.05s}.cell:nth-child(3){animation-delay:.1s}.cell:nth-child(4){animation-delay:.15s}.cell:nth-child(5){animation-delay:.2s}.cell:nth-child(6){animation-delay:.25s}
.cell b{font-size:clamp(22px,2.1vw,30px);font-weight:800;line-height:1.08;letter-spacing:-.04em}
.cell small{font-size:13px;font-weight:600;line-height:1.5;opacity:.72}
.cell .go{position:absolute;right:20px;bottom:20px;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:var(--paper);transition:transform .6s var(--spring)}
.cell.t-cobalt .go{background:var(--sun);color:var(--ink)}
.cell:not(:disabled):hover{transform:translateY(-6px) rotate(-1deg)}
.cell:nth-child(even):not(:disabled):hover{transform:translateY(-6px) rotate(1deg)}
.cell:not(:disabled):hover .go{transform:rotate(-45deg) scale(1.12)}
.cell:not(:disabled):active{transform:scale(.96)}
.cell:disabled:not(.going){opacity:.4}
.cell.going .pic{animation:jig .5s var(--out) infinite alternate}
@keyframes jig{to{transform:translateY(-12px) rotate(10deg)}}

.pic{position:absolute;left:24px;top:22px;width:64px;height:64px;transition:transform .6s var(--spring)}
.cell:hover .pic{transform:rotate(-10deg) scale(1.1)}
.pic i{position:absolute;display:block}
/* a cup */
.p0 i:nth-child(1){left:6px;bottom:4px;width:40px;height:34px;border-radius:6px 6px 18px 18px;background:#fff}
.p0 i:nth-child(2){left:42px;bottom:14px;width:20px;height:20px;border-radius:50%;border:6px solid #fff}
.p0 i:nth-child(3){left:14px;top:2px;width:8px;height:18px;border-radius:999px;background:var(--sun)}
/* a door with a key hole */
.p1 i:nth-child(1){left:10px;bottom:0;width:40px;height:60px;border-radius:20px 20px 4px 4px;background:var(--ink)}
.p1 i:nth-child(2){left:36px;bottom:24px;width:8px;height:8px;border-radius:50%;background:var(--sun)}
.p1 i:nth-child(3){left:0;bottom:0;width:64px;height:6px;border-radius:999px;background:var(--ink)}
/* two people side by side */
.p2 i:nth-child(1){left:2px;bottom:0;width:30px;height:30px;border-radius:999px 999px 0 0;background:var(--ink)}
.p2 i:nth-child(2){left:32px;bottom:0;width:30px;height:30px;border-radius:999px 999px 0 0;background:var(--cobalt)}
.p2 i:nth-child(3){left:8px;top:6px;width:18px;height:18px;border-radius:50%;background:var(--ink);box-shadow:30px 0 0 var(--cobalt)}
/* two speech blocks */
.p3 i:nth-child(1){left:0;top:4px;width:44px;height:30px;border-radius:14px 14px 14px 4px;background:var(--ink)}
.p3 i:nth-child(2){right:0;bottom:2px;width:40px;height:28px;border-radius:14px 14px 4px 14px;background:var(--paper)}
.p3 i:nth-child(3){left:10px;top:16px;width:22px;height:6px;border-radius:999px;background:var(--lilac)}
/* a house under the sun */
.p4 i:nth-child(1){left:6px;bottom:0;width:40px;height:30px;border-radius:4px;background:var(--ink)}
.p4 i:nth-child(2){left:0;bottom:28px;width:52px;height:26px;background:var(--tomato);clip-path:polygon(50% 0,100% 100%,0 100%)}
.p4 i:nth-child(3){right:0;top:0;width:18px;height:18px;border-radius:50%;background:var(--paper)}
/* a ball over a net */
.p5 i:nth-child(1){left:4px;top:2px;width:30px;height:30px;border-radius:50%;background:var(--tomato)}
.p5 i:nth-child(2){left:0;bottom:2px;width:64px;height:8px;border-radius:999px;background:var(--ink)}
.p5 i:nth-child(3){left:38px;bottom:10px;width:8px;height:30px;border-radius:999px 999px 0 0;background:var(--cobalt)}

.cue,.own{display:grid;gap:18px;padding:26px;border-radius:32px}
.cue h2,.own h2,.people h2{font-size:clamp(24px,2.4vw,34px);font-weight:800;letter-spacing:-.04em;line-height:1.1}
.cue form,.own form{display:grid;gap:16px}
.cue .bk-chips button{background:rgba(251,250,245,.12);color:var(--paper)}
.cue .bk-chips button[aria-pressed='true']{background:var(--sun);color:var(--ink)}
.cue-line{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px}
.cue-line .bk-input{min-height:56px;border-radius:28px;padding-left:24px;color:var(--ink)}
.cue-line textarea.bk-input{border-radius:24px}
.cue-line .bk-btn{height:56px}
.bk-btn.wait{animation:wait .5s var(--out) infinite alternate}
@keyframes wait{to{transform:scale(1.06,.9)}}
.sc>.bk-error{justify-self:start}

.dials{display:flex;flex-wrap:wrap;gap:8px}
.dials button{height:46px;padding:0 20px;border:0;border-radius:16px;font-size:14px;font-weight:800;box-shadow:inset 0 0 0 0 var(--ink);transition:transform .5s var(--spring),border-radius .3s,box-shadow .2s}
.dials button.t-paper{background:var(--dent)}
.dials button:hover{transform:translateY(-3px) rotate(-3deg)}
.dials button[aria-pressed='true']{border-radius:999px;box-shadow:inset 0 0 0 3px var(--ink);transform:scale(1.06)}
.own-row{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr) auto;align-items:end;gap:12px}
.bk-input.dent{background:var(--dent)}
.own-row .bk-btn{height:52px}

.people{display:grid;gap:16px;margin-top:20px}
.people-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}
.card{display:grid;align-content:start;justify-items:start;gap:10px;padding:22px;border-radius:32px;animation:bk-pop .7s var(--spring) both;animation-delay:calc(var(--i) * 90ms);transition:transform .55s var(--spring)}
.card:hover{transform:translateY(-6px) rotate(-1.2deg)}
.card:nth-child(even):hover{transform:translateY(-6px) rotate(1.2deg)}
.card header{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;margin-bottom:4px}
.mug{width:52px;height:52px;display:grid;place-items:center;border-radius:18px;background:var(--ink);font-size:12px;font-style:normal;transition:transform .5s var(--spring),border-radius .3s}
.card:hover .mug{transform:rotate(-10deg);border-radius:50%}
.card header div{display:grid;gap:1px}
.card header b{font-size:21px;font-weight:800;letter-spacing:-.03em;line-height:1.15}
.card header span{font-size:12.5px;font-weight:700;opacity:.7}
.card small{font-size:11.5px;font-weight:800;opacity:.6}
.card h3{font-size:16px;font-weight:800;line-height:1.4}
.card blockquote{padding:12px 16px;border-radius:4px 18px 18px 18px;background:rgba(251,250,245,.9);color:var(--ink);font-size:14.5px;font-weight:600;line-height:1.6}
.card.t-paper blockquote{background:var(--dent)}
.card.t-cobalt .bk-btn{background:var(--sun);color:var(--ink)!important}
.card .bk-btn{margin-top:4px}

@media (max-width:980px){
  .bento{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cell{grid-column:span 1}
  .own-row{grid-template-columns:1fr}
  .own-row .bk-btn{justify-self:start}
}
@media (max-width:760px){
  .bento{grid-auto-rows:minmax(160px,auto);gap:10px}
  .cell{padding:78px 18px 18px 18px;border-radius:26px}
  .cell .go{display:none}
  .cell b{font-size:20px}
  .pic{left:18px;top:16px;transform:scale(.8);transform-origin:top left}
  .cue,.own{padding:20px;border-radius:26px}
  .cue-line{grid-template-columns:1fr}
  .cue-line .bk-btn{justify-self:start}
}
@media (prefers-reduced-motion:reduce){.cell,.card,.cell.going .pic,.bk-btn.wait{animation:none}}
</style>
