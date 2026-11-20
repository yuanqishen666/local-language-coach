<script setup lang="ts">
import { useMemoriesPage } from '../logic/MemoriesPage'

const { t, memories, editing, value, error, memoryDirty, groups, coreCount, edit, cancelEdit, save, remove, toggleTier, formatDate } = useMemoriesPage()
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }
</script>

<template>
  <div class="pp-page mm">
    <header class="pp-head">
      <h1 class="pp-title">{{ t('memories.title') }}</h1>
      <div v-if="memories.length" class="quota" :aria-label="t('memories.coreCount', { count: coreCount })" :title="t('memories.coreCount', { count: coreCount })">
        <i v-for="n in 15" :key="n" :class="{ on: n <= coreCount }"></i>
      </div>
    </header>
    <p v-if="error" class="pp-error mm-error" role="alert">{{ error }}</p>

    <section v-for="(items, key) in groups" :key="key" class="part">
      <header :title="t(`memories.${key}Help`)">
        <h2>{{ t(`memory.category.${key}`) }}</h2>
        <span class="pp-num">{{ items.length }}</span>
      </header>
      <TransitionGroup tag="div" name="note" class="notes">
        <article v-for="item in items" :key="item.id" class="note" :class="{ core: item.tier === 'core', editing: editing === item.id }">
          <template v-if="editing === item.id">
            <input v-model="value" v-focus class="pp-input" :aria-label="t('common.edit')" @keydown.enter="save(item)" @keydown.esc="cancelEdit" />
            <div class="acts open">
              <button type="button" class="pp-link red" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button>
              <button type="button" class="pp-link" @click="cancelEdit">{{ t('common.cancel') }}</button>
            </div>
          </template>
          <template v-else>
            <p><em v-if="item.sensitive">{{ t('memories.sensitive') }}</em>{{ item.value }}</p>
            <small class="pp-num">{{ formatDate(item.updatedAt) }}</small>
            <div class="acts">
              <button type="button" class="pp-link" @click="toggleTier(item)">{{ item.tier === 'core' ? t('memories.demote') : t('memories.promote') }}</button>
              <button type="button" class="pp-link" @click="edit(item)">{{ t('common.edit') }}</button>
              <button type="button" class="pp-link red" @click="remove(item.id)">{{ t('common.delete') }}</button>
            </div>
          </template>
        </article>
        <p v-if="!items.length" key="none" class="none" aria-hidden="true">—</p>
      </TransitionGroup>
    </section>
  </div>
</template>

<style scoped>
.quota{display:flex;gap:5px;padding-bottom:12px}
.quota i{width:7px;height:7px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(25,22,18,.3);transition:background .4s,box-shadow .4s}
.quota i.on{background:var(--red);box-shadow:none}
.mm-error{margin-top:18px}

.part{display:grid;grid-template-columns:230px minmax(0,1fr);gap:0 40px;padding:36px 0 40px;border-bottom:1px solid var(--line)}
.part:last-child{border-bottom:0}
.part>header{position:sticky;top:calc(var(--mast) + 24px);align-self:start;display:flex;align-items:baseline;gap:10px}
.part h2{font:500 24px/1.3 var(--serif);letter-spacing:-.01em}
.part>header span{color:var(--muted);font:400 14px/1 var(--serif)}

.notes{position:relative;display:grid}
.note{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:4px 24px;padding:15px 0 15px 22px;border-bottom:1px solid var(--faint)}
.note::before{content:'';position:absolute;left:2px;top:25px;width:7px;height:7px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(25,22,18,.25);transition:background .4s,box-shadow .4s,transform .5s var(--out)}
.note.core::before{background:var(--red);box-shadow:none;animation:dot .5s var(--out)}
@keyframes dot{from{transform:scale(2.4)}}
.note p{font:400 19px/1.6 var(--serif);text-wrap:pretty}
.note em{margin-right:10px;color:var(--red);font:italic 400 13px/1 var(--serif)}
.note small{color:var(--muted);font-size:11.5px;transition:opacity .25s}
.acts{grid-column:1 / -1;display:flex;gap:20px;height:0;overflow:hidden;opacity:0;transition:height .45s var(--out),opacity .3s}
.acts .pp-link{font-size:12px}
.acts.open{height:28px;opacity:1;margin-top:8px}
.note:hover .acts,.note:focus-within .acts{height:28px;opacity:1}
.note.editing{align-items:center}
.note.editing .pp-input{grid-column:1 / -1;font-size:19px}
.none{padding:14px 0 14px 22px;color:var(--line);font:400 19px/1.6 var(--serif)}

.note-move{transition:transform .5s var(--out)}
.note-enter-active{transition:opacity .4s,transform .5s var(--out)}
.note-enter-from{opacity:0;transform:translateY(10px)}
.note-leave-active{position:absolute;left:0;right:0;transition:opacity .45s .25s}
.note-leave-active::after{content:'';position:absolute;left:22px;right:0;top:50%;height:1px;background:var(--red);transform-origin:left;animation:strike .3s var(--out) both}
.note-leave-to{opacity:0}
@keyframes strike{from{transform:scaleX(0)}}

@media (max-width:900px){
  .part{grid-template-columns:1fr;gap:10px;padding:28px 0 30px}
  .part>header{position:static}
}
@media (hover:none){
  .acts{height:28px;opacity:1}
}
@media (prefers-reduced-motion:reduce){.note.core::before,.note-leave-active::after{animation:none}}
</style>
