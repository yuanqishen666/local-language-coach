<script setup lang="ts">
import { conversationPreview } from '../../conversation-list'
import Icon from '../kit/Icon.vue'
import Face from './Face.vue'
import { useHistoryPage } from '../logic/HistoryPage'

const {
  t, kindFilter, statusFilter, pendingDelete, deleting, loadError, kindCounts, shown, emptyTitle, kindLabel, displayTitle,
  toggleArchive, removeConversation, day, month, dateTime,
} = useHistoryPage()

const tones = ['t-sun', 't-mint', 't-lilac', 't-peach', 't-cobalt']
</script>

<template>
  <div class="bk-page hs">
    <header class="bk-head">
      <h1 class="bk-title">{{ t('history.titleOpen') }}</h1>
      <div class="bk-chips" role="group" :aria-label="t('history.statusFilterLabel')">
        <button v-for="item in [{ id: 'all', key: 'history.all' }, { id: 'active', key: 'history.ongoing' }, { id: 'archived', key: 'history.archived' }]" :key="item.id" type="button" :aria-pressed="statusFilter === item.id" @click="statusFilter = item.id as typeof statusFilter">{{ t(item.key) }}</button>
      </div>
    </header>

    <div class="kinds" role="group" :aria-label="t('history.typeFilterLabel')">
      <button type="button" class="t-sun" :aria-pressed="kindFilter === 'direct'" @click="kindFilter = 'direct'"><b>{{ t('history.direct') }}</b><span class="bk-num">{{ kindCounts.direct }}</span></button>
      <button type="button" class="t-tomato" :aria-pressed="kindFilter === 'scene'" @click="kindFilter = 'scene'"><b>{{ t('history.scene') }}</b><span class="bk-num">{{ kindCounts.scene }}</span></button>
    </div>

    <p v-if="loadError" class="bk-error">{{ loadError }}</p>
    <TransitionGroup v-else-if="shown.length" tag="div" name="card" class="wall">
      <article v-for="(item, index) in shown" :key="item.id" class="card" :class="item.status">
        <RouterLink :to="`/conversation/${item.id}`" class="open" :aria-label="t('history.open', { title: displayTitle(item) })">
          <div class="date" :class="item.status === 'archived' ? 't-paper' : tones[index % tones.length]"><b class="bk-num">{{ day(item.updatedAt) }}</b><span>{{ month(item.updatedAt) }}</span></div>
          <div class="what">
            <h2>{{ displayTitle(item) }}</h2>
            <p v-if="conversationPreview(item)">{{ conversationPreview(item) }}</p>
            <small class="bk-num">{{ dateTime(item.updatedAt) }}<em v-if="item.status === 'archived'">{{ t('history.archived') }}</em></small>
          </div>
          <span class="go">{{ item.status === 'archived' ? t('history.openAgain') : t('history.continue') }}<Icon name="arrow" :size="16" :weight="2.4" /></span>
        </RouterLink>
        <div class="acts">
          <button type="button" class="bk-round" :title="item.status === 'archived' ? t('history.restore') : t('history.archive')" :aria-label="item.status === 'archived' ? t('history.restore') : t('history.archive')" @click="toggleArchive(item)"><Icon :name="item.status === 'archived' ? 'restore' : 'archive'" :size="17" :weight="2" /></button>
          <button type="button" class="bk-round red" :title="t('common.delete')" :aria-label="t('history.deleteLabel', { title: displayTitle(item) })" @click="pendingDelete = item"><Icon name="trash" :size="17" :weight="2" /></button>
        </div>
      </article>
    </TransitionGroup>
    <div v-else class="none"><i aria-hidden="true"><Face mood="sleepy" /></i><p>{{ emptyTitle }}</p></div>

    <div v-if="pendingDelete" class="bk-veil" @click.self="pendingDelete = null">
      <section class="bk-dialog" role="alertdialog" aria-modal="true" :aria-label="t('history.deleteTitle')">
        <i class="fret" aria-hidden="true"><Face mood="worried" /></i>
        <span class="bk-label">{{ kindLabel(pendingDelete.kind) }}</span>
        <h2>{{ t('history.deleteTitle') }}</h2>
        <div class="gone"><strong>{{ displayTitle(pendingDelete) }}</strong><span v-if="conversationPreview(pendingDelete)">{{ conversationPreview(pendingDelete) }}</span></div>
        <p>{{ t('history.deleteBody') }}</p>
        <footer>
          <button type="button" class="bk-btn line dent" :disabled="deleting" @click="pendingDelete = null">{{ t('common.cancel') }}</button>
          <button type="button" class="bk-btn danger" :disabled="deleting" @click="removeConversation">{{ deleting ? t('history.deleting') : t('common.delete') }}</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* two big keys; the pressed one stays down */
.kinds{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.kinds button{display:flex;align-items:center;justify-content:space-between;gap:14px;height:76px;padding:0 26px;border:0;border-radius:28px;text-align:left;opacity:.42;transition:transform .5s var(--spring),opacity .25s,border-radius .3s}
.kinds b{font-size:clamp(20px,2vw,28px);font-weight:800;letter-spacing:-.035em}
.kinds span{min-width:38px;height:38px;padding:0 10px;display:grid;place-items:center;border-radius:999px;background:var(--ink);color:var(--paper);font-size:14px;font-weight:800}
.kinds button:hover{opacity:.8;transform:translateY(-3px)}
.kinds button[aria-pressed='true']{opacity:1}
.kinds button[aria-pressed='true'] span{animation:bk-pop .5s var(--spring)}
.kinds button:active{transform:scale(.97)}

.wall{position:relative;display:grid;gap:10px}
.card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border-radius:28px;background:var(--paper);transition:transform .5s var(--spring)}
.card:hover{transform:translateX(6px)}
.open{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:18px;min-height:96px;padding:12px 8px 12px 12px;border-radius:inherit}
.date{width:72px;height:72px;display:grid;place-items:center;align-content:center;gap:2px;border-radius:20px;transition:transform .55s var(--spring),border-radius .3s}
.date.t-paper{background:var(--dent)}
.date b{font-size:24px;font-weight:800;line-height:1;letter-spacing:-.04em}
.date span{font-size:11px;font-weight:800;opacity:.7}
.card:hover .date{transform:rotate(-8deg) scale(1.06);border-radius:50%}
.what{min-width:0;display:grid;gap:4px}
.what h2{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:19px;font-weight:800;letter-spacing:-.025em}
.what p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--soft);font-size:13.5px;font-weight:600}
.what small{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;font-weight:700}
.what em{height:22px;padding:0 9px;display:inline-flex;align-items:center;border-radius:999px;background:var(--ink);color:var(--paper);font-size:11px;font-style:normal}
.go{height:40px;padding:0 16px;display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:var(--ink);color:var(--paper);font-size:12.5px;font-weight:800;opacity:0;transform:scale(.7);transition:opacity .2s,transform .5s var(--spring)}
.card:hover .go,.open:focus-visible .go{opacity:1;transform:none}
.card.archived .what h2{color:var(--muted)}
.acts{display:flex;gap:6px;padding:0 18px 0 8px}
.acts .bk-round{background:var(--dent)}
.acts .bk-round:hover{background:var(--sun)}
.acts .bk-round.red:hover{background:var(--tomato)}

.card-move,.card-enter-active{transition:transform .6s var(--spring),opacity .3s}
.card-leave-active{position:absolute;left:0;right:0;transition:transform .4s ease-in,opacity .3s}
.card-enter-from{opacity:0;transform:translateY(16px) scale(.96)}
.card-leave-to{opacity:0;transform:translateX(80px) rotate(6deg) scale(.8)}

.none{display:grid;justify-items:center;gap:22px;padding:60px 0}
.none i{width:130px;height:130px;display:grid;place-items:center;border-radius:50%;background:var(--lilac);font-size:30px;--face-mouth:var(--ink)}
.none p{color:var(--soft);font-size:clamp(22px,2.6vw,32px);font-weight:800;letter-spacing:-.03em;text-align:center}

.fret{width:84px;height:84px;margin-bottom:16px;display:grid;place-items:center;border-radius:28px;background:var(--tomato);font-size:19px;font-style:normal;--face-mouth:var(--ink);animation:shiver .5s ease-in-out infinite alternate}
@keyframes shiver{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
.bk-dialog .bk-label{display:block;margin-bottom:8px;opacity:.5}
.gone{margin-top:16px;padding:14px 16px;display:grid;gap:4px;border-radius:18px;background:var(--dent)}
.gone strong{font-size:15px;font-weight:800}
.gone span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--soft);font-size:12.5px;font-weight:600}
.bk-btn.dent{background:var(--dent)}

@media (max-width:980px){.go{display:none}}
@media (max-width:760px){
  .bk-head{flex-direction:column;align-items:flex-start;gap:14px}
  .kinds{gap:8px}
  .kinds button{height:62px;padding:0 16px;border-radius:22px}
  .kinds b{font-size:17px}
  .kinds span{min-width:30px;height:30px;font-size:12px}
  .card{grid-template-columns:1fr;border-radius:24px}
  .card:hover{transform:none}
  .open{gap:12px;min-height:0;padding:12px 12px 4px}
  .date{width:58px;height:58px;border-radius:17px}
  .date b{font-size:20px}
  .what h2{font-size:16.5px}
  .acts{justify-content:flex-end;padding:0 12px 10px}
}
@media (prefers-reduced-motion:reduce){.fret{animation:none}}
</style>
