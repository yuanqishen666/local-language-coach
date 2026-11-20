<script setup lang="ts">
import { inject, onMounted, ref, type Component } from 'vue'
import Icon from '../kit/Icon.vue'
import { vTip } from './tip'
import { useMemoriesPage } from '../logic/MemoriesPage'

const { t, memories, editing, value, error, memoryDirty, groups, coreCount, edit, cancelEdit, save, remove, toggleTier, formatDate } = useMemoriesPage()
const mascot = inject<Component | null>('labMascot', null)
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }

// Presentation only: hold the empty state back until the first load has had a moment to arrive.
const settled = ref(false)
onMounted(() => { window.setTimeout(() => { settled.value = true }, 700) })
</script>

<template>
  <div class="c-page c-memories">
    <header class="c-head">
      <h1 class="c-title">{{ t('memories.title') }}</h1>
      <span v-if="memories.length" class="c-quota" :class="{ full: coreCount >= 15 }">{{ t('memories.coreCount', { count: coreCount }) }}</span>
    </header>
    <p v-if="error" class="c-error" role="alert">{{ error }}</p>

    <div v-if="memories.length" class="c-groups">
      <details v-for="(items, key) in groups" :key="key" class="c-group" :class="{ none: !items.length }" :open="items.length > 0">
        <summary v-tip="items.length ? t(`memories.${key}Help`) : ''">
          <h2>{{ t(`memory.category.${key}`) }}</h2>
          <em>{{ items.length }}</em>
          <span class="c-group-help">{{ t(`memories.${key}Help`) }}</span>
          <Icon name="chevron" :size="16" :weight="2.2" />
        </summary>
        <TransitionGroup tag="ul" name="c-row" class="c-list">
          <li v-for="item in items" :key="item.id" class="c-row c-mem" :class="{ core: item.tier === 'core', editing: editing === item.id }">
            <template v-if="editing === item.id">
              <input v-model="value" v-focus class="c-input" :aria-label="t('common.edit')" @keydown.enter="save(item)" @keydown.esc="cancelEdit" />
              <div class="c-mem-edit">
                <button type="button" class="c-btn small primary" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button>
                <button type="button" class="c-btn small" @click="cancelEdit">{{ t('common.cancel') }}</button>
              </div>
            </template>
            <template v-else>
              <p><em v-if="item.sensitive" class="c-tag">{{ t('memories.sensitive') }}</em>{{ item.value }}</p>
              <time>{{ formatDate(item.updatedAt) }}</time>
              <div class="c-row-acts">
                <button v-tip="item.tier === 'core' ? t('memories.demote') : t('memories.promote')" type="button" class="c-icon" :class="{ on: item.tier === 'core' }" :aria-pressed="item.tier === 'core'" :aria-label="item.tier === 'core' ? t('memories.demote') : t('memories.promote')" @click="toggleTier(item)"><Icon name="pin" :size="16" :weight="1.9" /></button>
                <button v-tip="t('common.edit')" type="button" class="c-icon" :aria-label="t('common.edit')" @click="edit(item)"><Icon name="edit" :size="16" :weight="1.9" /></button>
                <button v-tip="t('common.delete')" type="button" class="c-icon danger" :aria-label="t('common.delete')" @click="remove(item.id)"><Icon name="trash" :size="16" :weight="1.9" /></button>
              </div>
            </template>
          </li>
        </TransitionGroup>
      </details>
    </div>
    <div v-else-if="settled" class="c-empty"><i v-if="mascot" aria-hidden="true"><component :is="mascot" mood="sleepy" /></i><p>{{ t('memories.emptyTitle') }}</p></div>
  </div>
</template>
