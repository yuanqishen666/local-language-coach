<script setup lang="ts">
import { conversationPreview } from '../../conversation-list'
import Icon from '../kit/Icon.vue'
import Flap from './Flap.vue'
import { useHistoryPage } from '../logic/HistoryPage'

const {
  t, kindFilter, statusFilter, pendingDelete, deleting, loadError, kindCounts, shown, emptyTitle, kindLabel, displayTitle,
  toggleArchive, removeConversation, day, month, dateTime,
} = useHistoryPage()
</script>

<template>
  <div class="nf-page hs">
    <header class="nf-head">
      <h1 class="nf-title"><Flap :text="t('history.titleOpen')" /></h1>
      <div class="nf-chips" role="group" :aria-label="t('history.statusFilterLabel')">
        <button v-for="item in [{ id: 'all', key: 'history.all' }, { id: 'active', key: 'history.ongoing' }, { id: 'archived', key: 'history.archived' }]" :key="item.id" type="button" :aria-pressed="statusFilter === item.id" @click="statusFilter = item.id as typeof statusFilter">{{ t(item.key) }}</button>
      </div>
    </header>

    <div class="kinds" :class="kindFilter" role="group" :aria-label="t('history.typeFilterLabel')">
      <button type="button" :aria-pressed="kindFilter === 'direct'" @click="kindFilter = 'direct'">{{ t('history.direct') }}<span class="nf-mono">{{ kindCounts.direct }}</span></button>
      <button type="button" :aria-pressed="kindFilter === 'scene'" @click="kindFilter = 'scene'">{{ t('history.scene') }}<span class="nf-mono">{{ kindCounts.scene }}</span></button>
    </div>

    <p v-if="loadError" class="nf-error">{{ loadError }}</p>
    <TransitionGroup v-else-if="shown.length" tag="div" name="row" class="board nf-glass">
      <article v-for="item in shown" :key="item.id" class="row" :class="item.status">
        <RouterLink :to="`/conversation/${item.id}`" class="open" :aria-label="t('history.open', { title: displayTitle(item) })">
          <div class="date nf-mono"><b>{{ day(item.updatedAt) }}</b><span>{{ month(item.updatedAt) }}</span></div>
          <div class="what">
            <h2>{{ displayTitle(item) }}</h2>
            <p v-if="conversationPreview(item)">{{ conversationPreview(item) }}</p>
          </div>
          <small class="nf-mono">{{ dateTime(item.updatedAt) }}</small>
          <span class="state"><i class="nf-lamp" :class="{ go: item.status !== 'archived' }"></i>{{ item.status === 'archived' ? t('history.archived') : t('history.ongoing') }}</span>
          <span class="enter">{{ item.status === 'archived' ? t('history.openAgain') : t('history.continue') }}<Icon name="arrow" :size="15" /></span>
        </RouterLink>
        <div class="acts">
          <button type="button" :title="item.status === 'archived' ? t('history.restore') : t('history.archive')" :aria-label="item.status === 'archived' ? t('history.restore') : t('history.archive')" @click="toggleArchive(item)"><Icon :name="item.status === 'archived' ? 'restore' : 'archive'" :size="16" /></button>
          <button type="button" class="red" :title="t('common.delete')" :aria-label="t('history.deleteLabel', { title: displayTitle(item) })" @click="pendingDelete = item"><Icon name="trash" :size="16" /></button>
        </div>
      </article>
    </TransitionGroup>
    <p v-else class="nf-empty">{{ emptyTitle }}</p>

    <div v-if="pendingDelete" class="nf-veil" @click.self="pendingDelete = null">
      <section class="nf-dialog" role="alertdialog" aria-modal="true" :aria-label="t('history.deleteTitle')">
        <span class="nf-label">{{ kindLabel(pendingDelete.kind) }}</span>
        <h2>{{ t('history.deleteTitle') }}</h2>
        <div class="gone"><strong>{{ displayTitle(pendingDelete) }}</strong><span v-if="conversationPreview(pendingDelete)">{{ conversationPreview(pendingDelete) }}</span></div>
        <p>{{ t('history.deleteBody') }}</p>
        <footer>
          <button type="button" class="nf-btn ghost" :disabled="deleting" @click="pendingDelete = null">{{ t('common.cancel') }}</button>
          <button type="button" class="nf-btn danger" :disabled="deleting" @click="removeConversation">{{ deleting ? t('history.deleting') : t('common.delete') }}</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* a two-way switch: the amber plate slides under the chosen side */
.kinds{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;margin-bottom:22px;padding:4px;border-radius:999px;background:var(--faint);box-shadow:inset 0 0 0 1px var(--line)}
.kinds::before{content:'';position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);border-radius:999px;background:var(--amber);transition:transform .55s var(--spring)}
.kinds.scene::before{transform:translateX(100%)}
.kinds button{position:relative;height:38px;min-width:128px;padding:0 20px;display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:999px;background:none;color:var(--soft);font-size:13.5px;font-weight:600;transition:color .3s}
.kinds button span{font-size:11px;opacity:.6}
.kinds button[aria-pressed='true']{color:#1b1204}

.board{position:relative;padding:6px 0;overflow:hidden}
.row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center}
.row+.row::before{content:'';position:absolute;left:26px;right:26px;top:0;height:1px;background:var(--line)}
.open{display:grid;grid-template-columns:74px minmax(0,1fr) auto 104px 96px;align-items:center;gap:20px;min-height:86px;padding:14px 0 14px 26px;transition:background .3s}
.date{display:grid;gap:3px}
.date b{font-size:26px;font-weight:500;line-height:1;letter-spacing:-.03em;transition:color .3s}
.date span{color:var(--muted);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase}
.what{min-width:0;display:grid;gap:5px}
.what h2{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:500;letter-spacing:-.015em;transition:transform .5s var(--out)}
.what p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:13px}
.open small{color:var(--muted);font-size:11.5px;letter-spacing:.04em}
.state{display:inline-flex;align-items:center;gap:9px;color:var(--soft);font-size:12px}
.enter{display:inline-flex;align-items:center;justify-content:flex-end;gap:7px;color:var(--amber);font-size:12.5px;font-weight:600;opacity:0;transform:translateX(-10px);transition:opacity .3s,transform .5s var(--out)}
.row:hover .open,.open:focus-visible{background:linear-gradient(90deg,var(--amber-soft),transparent 70%)}
.row:hover .date b{color:var(--amber)}
.row:hover .what h2{transform:translateX(4px)}
.row:hover .enter,.open:focus-visible .enter{opacity:1;transform:none}
.row.archived .what h2,.row.archived .date b{color:var(--muted)}

.acts{display:flex;gap:4px;padding:0 20px 0 12px}
.acts button{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--muted);transition:color .25s,background .25s,transform .4s var(--spring)}
.acts button:hover{background:var(--faint);color:var(--amber);transform:scale(1.1)}
.acts button.red:hover{color:var(--red)}

.row-move,.row-enter-active{transition:transform .55s var(--out),opacity .4s}
.row-leave-active{position:absolute;left:0;right:0;transition:transform .45s var(--out),opacity .35s}
.row-enter-from{opacity:0;transform:translateY(12px)}
.row-leave-to{opacity:0;transform:translateX(60px)}

.nf-dialog .nf-label{display:block;margin-bottom:12px}
.gone{margin-top:18px;padding:14px 16px;display:grid;gap:5px;border-radius:14px;background:rgba(255,107,87,.08);box-shadow:inset 0 0 0 1px rgba(255,107,87,.3)}
.gone strong{font-size:15px;font-weight:600}
.gone span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12.5px}

@media (max-width:980px){
  .open{grid-template-columns:62px minmax(0,1fr) auto}
  .open small,.enter{display:none}
}
@media (max-width:760px){
  .nf-head{flex-direction:column;align-items:flex-start;gap:16px}
  .kinds{display:grid}
  .kinds button{min-width:0}
  .row{grid-template-columns:1fr}
  .row+.row::before{left:16px;right:16px}
  .open{grid-template-columns:52px minmax(0,1fr);gap:12px;min-height:0;padding:16px 16px 6px}
  .date b{font-size:22px}
  .state{display:none}
  .acts{justify-content:flex-end;padding:0 10px 8px}
}
</style>
