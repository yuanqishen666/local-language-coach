<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import '../daily/daily.css'
import '../daily/pages.css'
import './theme.css'
import Icon from '../kit/Icon.vue'
import LabSwitch from '../kit/Switch.vue'
import Face from '../blocks/Face.vue'
import { shellFoot, shellMain, shellNav, useShell } from '../useShell'

const { store, route, t, locale, focus, plain, reviewDue, languageCode, language, level, navOn, overLimit } = useShell()
provide('labReviewDue', reviewDue)

// Phone: the four things done most, the rest behind “more”.
const front = shellNav.slice(0, 4)
const rest = shellNav.slice(4)
const menu = ref(false)
const restOn = computed(() => rest.some((item) => navOn(item.to)))
watch(() => route.path, () => { menu.value = false })
</script>

<template>
  <div class="y-app bk" :class="{ focus, plain }">
    <aside v-if="!plain" class="y-side">
      <RouterLink to="/" class="y-brand"><i aria-hidden="true"><Face /></i><b>{{ t('product.name') }}</b></RouterLink>
      <nav class="y-nav">
        <RouterLink v-for="item in shellMain" :key="item.to" :to="item.to" class="y-item" :class="{ on: navOn(item.to) }" :aria-current="navOn(item.to) ? 'page' : undefined">
          <Icon :name="item.icon" :size="17" :weight="2.1" /><span>{{ t(item.label) }}</span>
          <em v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</em>
        </RouterLink>
      </nav>
      <nav class="y-nav foot">
        <RouterLink to="/settings" class="bk-lang"><b>{{ languageCode.toUpperCase() }}</b><span>{{ language }}</span><small v-if="level">{{ level }}</small></RouterLink>
        <component :is="item.href ? 'a' : RouterLink" v-for="item in shellFoot" :key="item.to" v-bind="item.href ? { href: item.href(locale) } : { to: overLimit && item.to === '/settings' ? '/settings?tab=usage' : item.to }" class="y-item solo" :class="{ on: navOn(item.to) }" :aria-current="navOn(item.to) ? 'page' : undefined" :data-qs-id="item.to === '/privacy' ? 'qs-privacy-nav' : undefined">
          <Icon :name="item.icon" :size="17" :weight="2.1" /><span :data-content-repeat-ok="item.to === '/privacy' ? 'orientation' : undefined">{{ t(item.label) }}</span><i v-if="overLimit && item.to === '/settings'" class="y-nav-dot" role="img" :aria-label="t('usage.reached')" :title="t('usage.reached')"></i>
        </component>
      </nav>
    </aside>

    <main class="y-main">
      <RouterView v-slot="{ Component }">
        <Transition name="y-view" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <template v-if="!plain && !focus">
      <nav class="y-tabs">
        <RouterLink v-for="item in front" :key="item.to" :to="item.to" :class="{ on: navOn(item.to) }">
          <Icon :name="item.icon" :size="19" :weight="2.1" /><span>{{ t(item.label) }}</span>
          <em v-if="item.to === '/review' && reviewDue">{{ reviewDue }}</em>
        </RouterLink>
        <button type="button" :class="{ on: menu || restOn }" :aria-expanded="menu" @click="menu = !menu"><Icon name="more" :size="19" :weight="2.4" /><span>{{ t('nav.more') }}</span></button>
      </nav>
      <Transition name="y-veil"><div v-if="menu" class="y-veil clear" @click="menu = false"></div></Transition>
      <Transition name="y-more">
        <div v-if="menu" class="y-more-menu" role="menu">
          <component :is="item.href ? 'a' : RouterLink" v-for="item in rest" :key="item.to" v-bind="item.href ? { href: item.href(locale) } : { to: item.to }" role="menuitem" :class="{ on: navOn(item.to) }"><Icon :name="item.icon" :size="17" :weight="2.1" />{{ t(item.label) }}</component>
        </div>
      </Transition>
    </template>

    <Transition name="y-toast"><div v-if="store.toast" class="y-toast" role="status">{{ store.toast }}</div></Transition>
    <LabSwitch :low="!focus" />
  </div>
</template>
