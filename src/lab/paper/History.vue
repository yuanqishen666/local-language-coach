<script setup lang="ts">
import { conversationPreview } from '../../conversation-list'
import Icon from '../kit/Icon.vue'
import { useHistoryPage } from '../logic/HistoryPage'

const {
  t, kindFilter, statusFilter, pendingDelete, deleting, loadError, kindCounts, shown, emptyTitle, kindLabel, displayTitle,
  toggleArchive, removeConversation, day, month, dateTime,
} = useHistoryPage()
</script>

<template>
  <div class="pp-page hs">
    <header class="pp-head">
      <h1 class="pp-title">{{ t('history.titleOpen') }}</h1>
      <div class="status" role="group" :aria-label="t('history.statusFilterLabel')">
        <button v-for="item in [{ id: 'all', key: 'history.all' }, { id: 'active', key: 'history.ongoing' }, { id: 'archived', key: 'history.archived' }]" :key="item.id" type="button" class="pp-link" :class="{ on: statusFilter === item.id }" :aria-pressed="statusFilter === item.id" @click="statusFilter = item.id as typeof statusFilter">{{ t(item.key) }}</button>
      </div>
    </header>

    <div class="kinds" role="group" :aria-label="t('history.typeFilterLabel')">
      <button type="button" :aria-pressed="kindFilter === 'direct'" @click="kindFilter = 'direct'">{{ t('history.direct') }}<sup class="pp-num">{{ kindCounts.direct }}</sup></button>
      <button type="button" :aria-pressed="kindFilter === 'scene'" @click="kindFilter = 'scene'">{{ t('history.scene') }}<sup class="pp-num">{{ kindCounts.scene }}</sup></button>
    </div>

    <p v-if="loadError" class="pp-error">{{ loadError }}</p>
    <TransitionGroup v-else-if="shown.length" tag="div" name="row" class="ledger">
      <article v-for="item in shown" :key="item.id" class="row" :class="item.status">
        <RouterLink :to="`/conversation/${item.id}`" class="open" :aria-label="t('history.open', { title: displayTitle(item) })">
          <div class="date"><b class="pp-num">{{ day(item.updatedAt) }}</b><span>{{ month(item.updatedAt) }}</span></div>
          <div class="what">
            <h2>{{ displayTitle(item) }}<em v-if="item.status === 'archived'">{{ t('history.archived') }}</em></h2>
            <p v-if="conversationPreview(item)">{{ conversationPreview(item) }}</p>
          </div>
          <small class="pp-num">{{ dateTime(item.updatedAt) }}</small>
          <span class="go">{{ item.status === 'archived' ? t('history.openAgain') : t('history.continue') }}<Icon name="arrow" :size="15" /></span>
        </RouterLink>
        <div class="acts">
          <button type="button" class="pp-link" @click="toggleArchive(item)">{{ item.status === 'archived' ? t('history.restore') : t('history.archive') }}</button>
          <button type="button" class="pp-link red" :aria-label="t('history.deleteLabel', { title: displayTitle(item) })" @click="pendingDelete = item">{{ t('common.delete') }}</button>
        </div>
      </article>
    </TransitionGroup>
    <p v-else class="pp-empty">{{ emptyTitle }}</p>

    <div v-if="pendingDelete" class="pp-veil" @click.self="pendingDelete = null">
      <section class="pp-slip" role="alertdialog" aria-modal="true" :aria-label="t('history.deleteTitle')">
        <span class="pp-label">{{ kindLabel(pendingDelete.kind) }}</span>
        <h2>{{ t('history.deleteTitle') }}</h2>
        <strong class="gone">{{ displayTitle(pendingDelete) }}</strong>
        <blockquote v-if="conversationPreview(pendingDelete)">{{ conversationPreview(pendingDelete) }}</blockquote>
        <p>{{ t('history.deleteBody') }}</p>
        <footer>
          <button type="button" class="pp-btn line" :disabled="deleting" @click="pendingDelete = null">{{ t('common.cancel') }}</button>
          <button type="button" class="pp-btn danger" :disabled="deleting" @click="removeConversation">{{ deleting ? t('history.deleting') : t('common.delete') }}</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.status{display:flex;gap:22px;padding-bottom:6px}
.kinds{display:flex;gap:38px;margin-top:34px}
.kinds button{position:relative;padding:0 0 10px;border:0;background:none;color:var(--muted);font:500 26px/1.2 var(--serif);letter-spacing:-.015em;transition:color .3s}
.kinds sup{margin-left:6px;font:500 12px/1 var(--sans);vertical-align:super;color:var(--muted)}
.kinds button::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--red);transform:scaleX(0);transform-origin:left;transition:transform .5s var(--out)}
.kinds button:hover{color:var(--ink)}
.kinds button[aria-pressed='true']{color:var(--ink)}
.kinds button[aria-pressed='true']::after{transform:scaleX(1)}
.kinds button[aria-pressed='true'] sup{color:var(--red)}

.ledger{position:relative;margin-top:26px;border-top:1px solid var(--ink)}
.row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border-bottom:1px solid var(--line)}
.open{display:grid;grid-template-columns:92px minmax(0,1fr) auto;align-items:center;gap:0 24px;padding:22px 0;color:inherit;text-decoration:none}
.date{display:grid;justify-items:start;gap:2px}
.date b{font:400 46px/1 var(--serif);letter-spacing:-.04em;transition:color .3s,transform .5s var(--out)}
.date span{color:var(--muted);font-size:11px;letter-spacing:.1em}
.what{min-width:0;display:grid;gap:5px}
.what h2{display:flex;align-items:baseline;gap:12px;font:500 22px/1.3 var(--serif);letter-spacing:-.01em}
.what em{flex:none;color:var(--muted);font:italic 400 13px/1 var(--serif)}
.what p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--soft);font-size:13.5px}
.open small{color:var(--muted);font-size:12px;transition:opacity .25s}
.go{position:absolute;right:0;top:50%;display:inline-flex;align-items:center;gap:8px;color:var(--red);font-size:13px;font-weight:600;opacity:0;transform:translate(-12px,-50%);transition:opacity .25s,transform .5s var(--out);pointer-events:none}
.acts{position:absolute;right:0;bottom:8px;display:flex;gap:18px;opacity:0;transition:opacity .25s}
.acts .pp-link{font-size:12px}
.row.archived .date b,.row.archived .what h2{color:var(--muted)}
@media (hover:hover){
  .row:hover .date b{color:var(--red);transform:translateX(4px)}
  .row:hover .open small{opacity:0}
  .row:hover .go{opacity:1;transform:translate(0,-50%)}
  .row:hover .acts,.acts:focus-within{opacity:1}
  .row:hover .go{top:38%}
}

.row-move{transition:transform .5s var(--out)}
.row-enter-active{transition:opacity .4s,transform .5s var(--out)}
.row-enter-from{opacity:0;transform:translateY(10px)}
.row-leave-active{position:absolute;left:0;right:0;transition:opacity .45s .25s}
.row-leave-active::after{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:var(--red);transform-origin:left;animation:strike .3s var(--out) both}
.row-leave-to{opacity:0}
@keyframes strike{from{transform:scaleX(0)}}

.pp-slip .pp-label{display:block;margin-bottom:10px}
.gone{display:block;margin-top:18px;font:500 19px/1.4 var(--serif);text-decoration:line-through;text-decoration-color:var(--red);text-decoration-thickness:1px}
.pp-slip blockquote{margin-top:8px;padding-left:12px;border-left:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

@media (max-width:760px){
  .pp-head{flex-direction:column;align-items:flex-start;gap:16px}
  .kinds{gap:26px;margin-top:26px}
  .kinds button{font-size:21px}
  .row{grid-template-columns:1fr}
  .open{grid-template-columns:66px minmax(0,1fr);gap:0 12px;padding:18px 0 8px}
  .date b{font-size:28px;white-space:nowrap}
  .what h2{font-size:19px}
  .open small{grid-column:2;margin-top:6px}
  .go{display:none}
}
@media (hover:none){
  .acts{position:static;opacity:1;padding:0 0 14px 78px}
}
@media (prefers-reduced-motion:reduce){.row-leave-active::after{animation:none}}
</style>
