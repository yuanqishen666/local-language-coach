<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Flap from './Flap.vue'
import { useMemoriesPage } from '../logic/MemoriesPage'

const { t, memories, editing, value, error, memoryDirty, groups, coreCount, edit, cancelEdit, save, remove, toggleTier, formatDate } = useMemoriesPage()
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }
</script>

<template>
  <div class="nf-page mm">
    <header class="nf-head">
      <h1 class="nf-title"><Flap :text="t('memories.title')" /></h1>
      <div v-if="memories.length" class="gauge" :aria-label="t('memories.coreCount', { count: coreCount })" :title="t('memories.coreCount', { count: coreCount })">
        <span><i v-for="n in 15" :key="n" :class="{ on: n <= coreCount }" :style="{ '--n': n }"></i></span>
        <b class="nf-mono">{{ String(coreCount).padStart(2, '0') }}<small>/15</small></b>
      </div>
    </header>
    <p v-if="error" class="nf-error mm-error" role="alert">{{ error }}</p>

    <div class="cols">
      <section v-for="(items, key) in groups" :key="key" class="part nf-glass">
        <header :title="t(`memories.${key}Help`)">
          <h2>{{ t(`memory.category.${key}`) }}</h2>
          <span class="nf-mono">{{ String(items.length).padStart(2, '0') }}</span>
        </header>
        <TransitionGroup tag="div" name="note" class="notes">
          <article v-for="item in items" :key="item.id" class="note" :class="{ core: item.tier === 'core', editing: editing === item.id }">
            <template v-if="editing === item.id">
              <input v-model="value" v-focus class="nf-input" :aria-label="t('common.edit')" @keydown.enter="save(item)" @keydown.esc="cancelEdit" />
              <div class="acts open">
                <button type="button" class="nf-btn small" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button>
                <button type="button" class="nf-link" @click="cancelEdit">{{ t('common.cancel') }}</button>
              </div>
            </template>
            <template v-else>
              <button type="button" class="pin" :aria-pressed="item.tier === 'core'" :title="item.tier === 'core' ? t('memories.demote') : t('memories.promote')" :aria-label="item.tier === 'core' ? t('memories.demote') : t('memories.promote')" @click="toggleTier(item)"><i></i></button>
              <p><em v-if="item.sensitive">{{ t('memories.sensitive') }}</em>{{ item.value }}</p>
              <small class="nf-mono">{{ formatDate(item.updatedAt) }}</small>
              <div class="acts">
                <button type="button" :title="t('common.edit')" :aria-label="t('common.edit')" @click="edit(item)"><Icon name="edit" :size="15" /></button>
                <button type="button" class="red" :title="t('common.delete')" :aria-label="t('common.delete')" @click="remove(item.id)"><Icon name="trash" :size="15" /></button>
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
/* fifteen lamps: one lights for every memory kept in the core */
.gauge{display:flex;align-items:center;gap:16px}
.gauge span{display:flex;gap:4px}
.gauge i{width:6px;height:20px;border-radius:3px;background:rgba(234,238,246,.12);transition:background .4s,box-shadow .4s,transform .5s var(--spring);transition-delay:calc(var(--n) * 18ms)}
.gauge i.on{background:var(--amber);box-shadow:0 0 10px rgba(255,182,72,.6)}
.gauge:hover i.on{transform:scaleY(1.25)}
.gauge b{font-size:20px;font-weight:500;color:var(--amber)}
.gauge small{color:var(--muted);font-size:12px}
.mm-error{margin-bottom:16px}

.cols{columns:2;column-gap:18px}
.part{break-inside:avoid;margin-bottom:18px;padding:22px 10px 10px}
.part>header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:0 14px 14px}
.part h2{font-size:19px;font-weight:500;letter-spacing:-.02em}
.part>header span{color:var(--muted);font-size:11.5px;letter-spacing:.1em}

.notes{position:relative;display:grid}
.note{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px 12px;padding:11px 12px 11px 8px;border-radius:14px;transition:background .25s}
.note:hover,.note:focus-within{background:var(--faint)}
.pin{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:none}
.pin i{width:8px;height:8px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--muted);transition:background .3s,box-shadow .3s,transform .45s var(--spring)}
.pin:hover i{transform:scale(1.5);box-shadow:inset 0 0 0 1.5px var(--amber)}
.pin[aria-pressed='true'] i{background:var(--amber);box-shadow:0 0 0 3px var(--amber-soft),0 0 12px var(--amber)}
.note p{font-size:15px;line-height:1.6;overflow-wrap:anywhere}
.note.core p{color:var(--text)}
.note:not(.core) p{color:var(--soft)}
.note em{margin-right:8px;padding:2px 7px;border-radius:6px;background:rgba(255,107,87,.14);color:var(--red);font-size:11px;font-style:normal;vertical-align:1px}
.note small{color:var(--muted);font-size:11px;letter-spacing:.04em;transition:opacity .2s}
.acts{position:absolute;right:8px;top:50%;display:flex;gap:2px;padding:3px;border-radius:999px;background:var(--raise);box-shadow:inset 0 0 0 1px var(--line);opacity:0;transform:translateY(-50%) translateX(8px);pointer-events:none;transition:opacity .25s,transform .4s var(--out)}
.note:hover .acts,.note:focus-within .acts{opacity:1;transform:translateY(-50%);pointer-events:auto}
.note:hover small,.note:focus-within small{opacity:0}
.acts button:not(.nf-btn):not(.nf-link){width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--soft);transition:color .2s,background .2s}
.acts button:not(.nf-btn):not(.nf-link):hover{background:var(--faint);color:var(--amber)}
.acts button.red:hover{color:var(--red)!important}
.note.editing{grid-template-columns:minmax(0,1fr) auto;background:var(--faint)}
.acts.open{position:static;align-items:center;gap:12px;padding:0 6px 0 0;background:none;box-shadow:none;opacity:1;transform:none;pointer-events:auto}
.none{padding:6px 14px 14px;color:var(--muted)}

.note-move,.note-enter-active{transition:transform .5s var(--out),opacity .35s}
.note-leave-active{position:absolute;left:0;right:0;transition:transform .4s var(--out),opacity .3s}
.note-enter-from{opacity:0;transform:translateY(10px)}
.note-leave-to{opacity:0;transform:translateX(40px)}

@media (max-width:860px){.cols{columns:1}}
@media (max-width:760px){
  .nf-head{flex-direction:column;align-items:flex-start;gap:16px}
  .note{grid-template-columns:auto minmax(0,1fr)}
  .note small{grid-column:2}
  .acts{position:static;grid-column:2;justify-self:start;opacity:1;transform:none;pointer-events:auto;background:none;box-shadow:none;padding:0;margin-left:-6px}
  .note:hover .acts,.note:focus-within .acts{transform:none}
  .note:hover small,.note:focus-within small{opacity:1}
  .note.editing{grid-template-columns:1fr}
  .acts.open{margin-left:0}
}
</style>
