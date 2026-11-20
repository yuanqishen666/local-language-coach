<script setup lang="ts">
import { watch } from 'vue'
import { conversationPreview } from '../../conversation-list'
import Icon from '../kit/Icon.vue'
import { formatWhen } from '../kit/when'
import { vTip } from '../core/tip'
import { useHistoryPage } from '../logic/HistoryPage'
import { usePaged } from './text'

const {
  t, locale, kindFilter, statusFilter, pendingDelete, deleting, loadError, kindCounts, shown, emptyTitle, displayTitle,
  toggleArchive, removeConversation, dateTime,
} = useHistoryPage()

const statuses = [{ id: 'all', key: 'history.all' }, { id: 'active', key: 'history.ongoing' }, { id: 'archived', key: 'history.archived' }] as const

// Presentation only: a long history opens on its latest rows.
const { rows, left, more, reset } = usePaged(shown, 14)
watch([kindFilter, statusFilter], reset)
</script>

<template>
  <div class="y-page y-history">
    <header class="y-head">
      <h1>{{ t('history.titleOpen') }}</h1>
      <div class="y-seg push" role="group" :aria-label="t('history.typeFilterLabel')">
        <button type="button" :aria-pressed="kindFilter === 'direct'" @click="kindFilter = 'direct'">{{ t('history.direct') }}<em>{{ kindCounts.direct }}</em></button>
        <button type="button" :aria-pressed="kindFilter === 'scene'" @click="kindFilter = 'scene'">{{ t('history.scene') }}<em>{{ kindCounts.scene }}</em></button>
      </div>
    </header>

    <div class="y-seg plain y-history-status" role="group" :aria-label="t('history.statusFilterLabel')">
      <button v-for="item in statuses" :key="item.id" type="button" :aria-pressed="statusFilter === item.id" @click="statusFilter = item.id">{{ t(item.key) }}</button>
    </div>

    <p v-if="loadError" class="y-error">{{ loadError }}</p>
    <template v-else-if="shown.length">
      <TransitionGroup tag="ul" name="y-line" class="y-rows">
        <li v-for="item in rows" :key="item.id" class="y-row y-talk" :class="item.status">
          <RouterLink :to="`/conversation/${item.id}`" class="y-talk-main" :aria-label="t('history.open', { title: displayTitle(item) })">
            <b>{{ displayTitle(item) }}</b>
            <span v-if="conversationPreview(item)">{{ conversationPreview(item) }}</span>
          </RouterLink>
          <em v-if="item.status === 'archived'" class="y-tag">{{ t('history.archived') }}</em>
          <time :title="dateTime(item.updatedAt)">{{ formatWhen(item.updatedAt, String(locale)) }}</time>
          <div class="y-acts">
            <button v-tip="item.status === 'archived' ? t('history.restore') : t('history.archive')" type="button" class="y-ic" :aria-label="item.status === 'archived' ? t('history.restore') : t('history.archive')" @click="toggleArchive(item)"><Icon :name="item.status === 'archived' ? 'restore' : 'archive'" :size="15" :weight="1.9" /></button>
            <button v-tip="t('common.delete')" type="button" class="y-ic danger" :aria-label="t('history.deleteLabel', { title: displayTitle(item) })" @click="pendingDelete = item"><Icon name="trash" :size="15" :weight="1.9" /></button>
          </div>
        </li>
      </TransitionGroup>
      <div v-if="left" class="y-more-row"><button type="button" class="y-btn sm" @click="more">{{ t('nav.more') }}<em class="y-count">{{ left }}</em></button></div>
    </template>
    <div v-else class="y-empty"><p>{{ emptyTitle }}</p></div>

    <Transition name="y-veil">
      <div v-if="pendingDelete" class="y-veil" @click.self="pendingDelete = null">
        <section class="y-dialog" role="alertdialog" aria-modal="true" :aria-label="t('history.deleteTitle')">
          <h2>{{ t('history.deleteTitle') }}</h2>
          <div class="what"><strong class="y-clamp2">{{ displayTitle(pendingDelete) }}</strong></div>
          <p>{{ t('history.deleteBody') }}</p>
          <footer>
            <button type="button" class="y-btn" :disabled="deleting" @click="pendingDelete = null">{{ t('common.cancel') }}</button>
            <button type="button" class="y-btn danger" :disabled="deleting" @click="removeConversation">{{ deleting ? t('history.deleting') : t('common.delete') }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </div>
</template>
