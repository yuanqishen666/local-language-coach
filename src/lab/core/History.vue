<script setup lang="ts">
import { inject, type Component } from 'vue'
import { conversationPreview } from '../../conversation-list'
import Icon from '../kit/Icon.vue'
import { formatWhen } from '../kit/when'
import { vTip } from './tip'
import { useHistoryPage } from '../logic/HistoryPage'

const {
  t, locale, kindFilter, statusFilter, pendingDelete, deleting, loadError, kindCounts, shown, emptyTitle, kindLabel, displayTitle,
  toggleArchive, removeConversation, dateTime,
} = useHistoryPage()
const mascot = inject<Component | null>('labMascot', null)

const statuses = [{ id: 'all', key: 'history.all' }, { id: 'active', key: 'history.ongoing' }, { id: 'archived', key: 'history.archived' }] as const
</script>

<template>
  <div class="c-page c-history">
    <header class="c-head"><h1 class="c-title">{{ t('history.titleOpen') }}</h1></header>

    <div class="c-toolbar">
      <div class="c-seg" role="group" :aria-label="t('history.typeFilterLabel')">
        <button type="button" :aria-pressed="kindFilter === 'direct'" @click="kindFilter = 'direct'">{{ t('history.direct') }}<em>{{ kindCounts.direct }}</em></button>
        <button type="button" :aria-pressed="kindFilter === 'scene'" @click="kindFilter = 'scene'">{{ t('history.scene') }}<em>{{ kindCounts.scene }}</em></button>
      </div>
      <div class="c-seg quiet" role="group" :aria-label="t('history.statusFilterLabel')">
        <button v-for="item in statuses" :key="item.id" type="button" :aria-pressed="statusFilter === item.id" @click="statusFilter = item.id">{{ t(item.key) }}</button>
      </div>
    </div>

    <p v-if="loadError" class="c-error">{{ loadError }}</p>
    <TransitionGroup v-else-if="shown.length" tag="ul" name="c-row" class="c-list">
      <li v-for="item in shown" :key="item.id" class="c-row c-talk" :class="item.status">
        <RouterLink :to="`/conversation/${item.id}`" class="c-row-main" :aria-label="t('history.open', { title: displayTitle(item) })">
          <b>{{ displayTitle(item) }}</b>
          <span v-if="conversationPreview(item)">{{ conversationPreview(item) }}</span>
        </RouterLink>
        <em v-if="item.status === 'archived'" class="c-tag">{{ t('history.archived') }}</em>
        <time :title="dateTime(item.updatedAt)">{{ formatWhen(item.updatedAt, String(locale)) }}</time>
        <div class="c-row-acts">
          <button v-tip="item.status === 'archived' ? t('history.restore') : t('history.archive')" type="button" class="c-icon" :aria-label="item.status === 'archived' ? t('history.restore') : t('history.archive')" @click="toggleArchive(item)"><Icon :name="item.status === 'archived' ? 'restore' : 'archive'" :size="17" :weight="1.9" /></button>
          <button v-tip="t('common.delete')" type="button" class="c-icon danger" :aria-label="t('history.deleteLabel', { title: displayTitle(item) })" @click="pendingDelete = item"><Icon name="trash" :size="17" :weight="1.9" /></button>
          <RouterLink :to="`/conversation/${item.id}`" class="c-btn small c-row-go" tabindex="-1" aria-hidden="true">{{ item.status === 'archived' ? t('history.openAgain') : t('history.continue') }}<Icon name="arrow" :size="14" :weight="2.2" /></RouterLink>
        </div>
      </li>
    </TransitionGroup>
    <div v-else class="c-empty"><i v-if="mascot" aria-hidden="true"><component :is="mascot" mood="sleepy" /></i><p>{{ emptyTitle }}</p></div>

    <div v-if="pendingDelete" class="c-veil" @click.self="pendingDelete = null">
      <section class="c-dialog" role="alertdialog" aria-modal="true" :aria-label="t('history.deleteTitle')">
        <i v-if="mascot" class="c-dialog-face" aria-hidden="true"><component :is="mascot" mood="worried" /></i>
        <small class="c-label">{{ kindLabel(pendingDelete.kind) }}</small>
        <h2>{{ t('history.deleteTitle') }}</h2>
        <div class="c-dialog-what"><strong>{{ displayTitle(pendingDelete) }}</strong><span v-if="conversationPreview(pendingDelete)">{{ conversationPreview(pendingDelete) }}</span></div>
        <p>{{ t('history.deleteBody') }}</p>
        <footer>
          <button type="button" class="c-btn" :disabled="deleting" @click="pendingDelete = null">{{ t('common.cancel') }}</button>
          <button type="button" class="c-btn danger solid" :disabled="deleting" @click="removeConversation">{{ deleting ? t('history.deleting') : t('common.delete') }}</button>
        </footer>
      </section>
    </div>
  </div>
</template>
