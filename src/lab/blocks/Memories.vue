<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import { useMemoriesPage } from '../logic/MemoriesPage'

const { t, memories, editing, value, error, memoryDirty, groups, coreCount, edit, cancelEdit, save, remove, toggleTier, formatDate } = useMemoriesPage()
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }

const tones = ['t-sun', 't-mint', 't-lilac', 't-peach']
</script>

<template>
  <div class="bk-page mm">
    <header class="bk-head">
      <h1 class="bk-title">{{ t('memories.title') }}</h1>
      <div v-if="memories.length" class="quota" :aria-label="t('memories.coreCount', { count: coreCount })" :title="t('memories.coreCount', { count: coreCount })">
        <i v-for="n in 15" :key="n" :class="{ on: n <= coreCount }" :style="{ '--n': n }"></i>
      </div>
    </header>
    <p v-if="error" class="bk-error mm-error" role="alert">{{ error }}</p>

    <div class="wall">
    <section v-for="(items, key, groupIndex) in groups" :key="key" class="part">
      <header :title="t(`memories.${key}Help`)">
        <h2>{{ t(`memory.category.${key}`) }}</h2>
        <span class="bk-num">{{ items.length }}</span>
      </header>
      <TransitionGroup tag="div" name="note" class="notes">
        <article v-for="(item, itemIndex) in items" :key="item.id" class="note" :class="[item.tier === 'core' ? 't-ink' : tones[(groupIndex + itemIndex) % tones.length], { editing: editing === item.id }]" :style="{ '--tilt': `${((itemIndex * 7 + groupIndex * 3) % 5) - 2}deg` }">
          <template v-if="editing === item.id">
            <input v-model="value" v-focus class="bk-input" :aria-label="t('common.edit')" @keydown.enter="save(item)" @keydown.esc="cancelEdit" />
            <div class="acts open">
              <button type="button" class="bk-btn small sun" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button>
              <button type="button" class="bk-link" @click="cancelEdit">{{ t('common.cancel') }}</button>
            </div>
          </template>
          <template v-else>
            <p><em v-if="item.sensitive">{{ t('memories.sensitive') }}</em>{{ item.value }}</p>
            <small class="bk-num">{{ formatDate(item.updatedAt) }}</small>
            <div class="acts">
              <button type="button" class="pin" :aria-pressed="item.tier === 'core'" :title="item.tier === 'core' ? t('memories.demote') : t('memories.promote')" :aria-label="item.tier === 'core' ? t('memories.demote') : t('memories.promote')" @click="toggleTier(item)"><Icon name="pin" :size="15" :weight="2.2" /></button>
              <button type="button" :title="t('common.edit')" :aria-label="t('common.edit')" @click="edit(item)"><Icon name="edit" :size="15" :weight="2.2" /></button>
              <button type="button" class="red" :title="t('common.delete')" :aria-label="t('common.delete')" @click="remove(item.id)"><Icon name="trash" :size="15" :weight="2.2" /></button>
            </div>
          </template>
        </article>
        <p v-if="!items.length" key="none" class="none" aria-hidden="true">—</p>
      </TransitionGroup>
    </section>
    </div>
  </div>
</template>

<style scoped>
/* fifteen sockets; a peg goes in for every memory kept in the core */
.quota{display:grid;grid-template-columns:repeat(15,auto);gap:5px;padding:10px 12px;border-radius:18px;background:var(--paper)}
.quota i{width:13px;height:22px;border-radius:5px;background:var(--dent);transition:background .3s,transform .5s var(--spring);transition-delay:calc(var(--n) * 20ms)}
.quota i.on{background:var(--ink)}
.quota:hover i.on{transform:translateY(-4px) rotate(-6deg)}
.mm-error{margin-bottom:14px}

.wall{columns:2;column-gap:34px}
.part{break-inside:avoid;margin-bottom:26px}
.part>header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.part h2{font-size:clamp(22px,2.2vw,30px);font-weight:800;letter-spacing:-.04em}
.part>header span{min-width:32px;height:32px;padding:0 10px;display:grid;place-items:center;border-radius:999px;background:var(--ink);color:var(--paper);font-size:13px;font-weight:800}

/* a wall of stickers, each put up a little crooked */
.notes{position:relative;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
.note{position:relative;max-width:min(420px,100%);display:grid;gap:8px;padding:16px 18px 14px;border-radius:6px 24px 24px 24px;transform:rotate(var(--tilt,0deg));transition:transform .5s var(--spring),border-radius .3s}
.note:hover,.note:focus-within{transform:rotate(0deg) translateY(-4px) scale(1.03);z-index:2}
.note p{font-size:16px;font-weight:700;line-height:1.5;overflow-wrap:anywhere}
.note em{margin-right:8px;padding:2px 8px;border-radius:8px;background:var(--tomato);color:var(--ink);font-size:11px;font-style:normal;font-weight:800;vertical-align:1px}
.note small{font-size:11.5px;font-weight:700;opacity:.55}
.acts{display:flex;gap:5px;max-height:0;opacity:0;overflow:hidden;transition:max-height .4s var(--out),opacity .25s}
.note:hover .acts,.note:focus-within .acts{max-height:40px;opacity:1}
.acts button:not(.bk-btn):not(.bk-link){width:32px;height:32px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(21,21,21,.1);transition:transform .45s var(--spring),background .2s,color .2s}
.t-ink .acts button:not(.bk-btn):not(.bk-link){background:rgba(251,250,245,.16)}
.acts button:not(.bk-btn):not(.bk-link):hover{transform:scale(1.18) rotate(-10deg);background:var(--paper);color:var(--ink)}
.acts .pin[aria-pressed='true']{background:var(--sun)!important;color:var(--ink)}
.acts button.red:hover{background:var(--tomato)!important}
.note.editing{width:min(420px,100%);transform:none;background:var(--paper)!important;color:var(--ink)!important;box-shadow:inset 0 0 0 3px var(--ink)}
.note.editing .bk-input{background:var(--dent);min-height:46px}
.acts.open{max-height:none;opacity:1;overflow:visible;align-items:center;gap:12px}
.none{padding:6px 4px;color:var(--muted);font-weight:800}

.note-move,.note-enter-active{transition:transform .55s var(--spring),opacity .25s}
.note-leave-active{position:absolute;transition:transform .35s ease-in,opacity .3s}
.note-enter-from{opacity:0;transform:scale(.6) rotate(-10deg)}
.note-leave-to{opacity:0;transform:translateY(40px) rotate(14deg) scale(.7)}

@media (max-width:1100px){.wall{columns:1}}
@media (max-width:760px){
  .bk-head{flex-direction:column;align-items:flex-start;gap:14px}
  .quota i{width:11px;height:18px}
  .note{max-width:100%}
  .acts{max-height:40px;opacity:1}
}
</style>
