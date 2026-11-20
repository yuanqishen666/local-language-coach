<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import LookupBody from '../kit/LookupBody.vue'
import Speak from './Speak.vue'
import { useLookupDrawer } from '../logic/LookupDrawer'

const props = defineProps<{ term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }>()
const emit = defineEmits<{ close: [] }>()
const { loading, data, saved, error, targetLanguageCode, collocations, save, t } = useLookupDrawer(props)

// A habitual double-click must not open the sheet and dismiss it in the same gesture.
let openedAt = 0
watch(() => props.open, (open) => { if (open) openedAt = performance.now() })
function dismiss() {
  if (performance.now() - openedAt > 450) emit('close')
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="veil"><div v-if="open" class="veil" @click="dismiss"></div></Transition>
  <Transition name="sheet">
    <aside v-if="open" class="sheet" :aria-label="t('lookup.title')">
      <header>
        <h2 :lang="targetLanguageCode">{{ term }}</h2>
        <Speak speech-id="lookup-term" :text="term" :language-code="targetLanguageCode" />
        <button type="button" class="bk-round shut" :aria-label="t('common.close')" @click="emit('close')"><Icon name="close" :size="18" :weight="2.4" /></button>
      </header>
      <div class="body">
        <div v-if="loading" class="juggle" aria-busy="true"><i></i><i></i><i></i></div>
        <p v-else-if="error" class="bk-error">{{ error }}</p>
        <LookupBody v-else-if="data" :term="term" :sentence="sentence" :data="data" :collocations="collocations" :target-language-code="targetLanguageCode">
          <template #speak="{ speechId, text }"><Speak :speech-id="speechId" :text="text" :language-code="targetLanguageCode" compact /></template>
        </LookupBody>
      </div>
      <footer>
        <button type="button" class="bk-btn keep" :class="{ saved }" :disabled="loading || saved || !data" @click="save">
          <Icon :name="saved ? 'check' : 'plus'" :size="18" :weight="2.4" />{{ saved ? t('lookup.saved') : t('lookup.add') }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.veil{position:fixed;inset:0;z-index:100;background:rgba(21,21,21,.42)}
.veil-enter-active,.veil-leave-active{transition:opacity .25s}
.veil-enter-from,.veil-leave-to{opacity:0}

.sheet{position:fixed;top:14px;right:14px;bottom:14px;z-index:101;width:min(430px,calc(100vw - 28px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;border-radius:36px;background:var(--paper)}
.sheet-enter-active{transition:transform .7s var(--spring),opacity .2s}
.sheet-leave-active{transition:transform .28s ease-in,opacity .28s}
.sheet-enter-from{opacity:0;transform:translateX(60%) rotate(8deg)}
.sheet-leave-to{opacity:0;transform:translateX(40%) rotate(4deg)}

.sheet header{display:flex;align-items:center;gap:12px;padding:26px 20px 24px 26px;background:var(--sun);--speak-bg:rgba(21,21,21,.12)}
.sheet h2{min-width:0;font-size:clamp(34px,4vw,46px);font-weight:800;line-height:1.02;letter-spacing:-.045em;overflow-wrap:anywhere}
.shut{margin-left:auto;background:var(--ink);color:var(--paper)}
.body{padding:22px 26px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.sheet footer{padding:12px 16px 16px}
.keep{width:100%;height:56px;font-size:15.5px}
.keep.saved{background:var(--mint);color:var(--ink)!important;opacity:1}
.keep.saved svg{animation:tick .6s var(--spring)}
@keyframes tick{from{transform:scale(0) rotate(-90deg)}}

/* three shapes take turns jumping while the entry is on its way */
.juggle{height:180px;display:flex;align-items:center;justify-content:center;gap:14px}
.juggle i{width:26px;height:26px;background:var(--cobalt);animation:hop .9s var(--out) infinite alternate}
.juggle i:nth-child(1){border-radius:8px}
.juggle i:nth-child(2){border-radius:50%;background:var(--tomato);animation-delay:.15s}
.juggle i:nth-child(3){border-radius:999px 999px 0 0;background:var(--sun);animation-delay:.3s}
@keyframes hop{0%,30%{transform:translateY(0) scale(1.1,.86)}100%{transform:translateY(-34px) rotate(40deg)}}

:deep(.lk){display:grid;gap:22px}
:deep(.lk-meta){display:flex;flex-wrap:wrap;gap:6px;font-size:12px;font-weight:700}
:deep(.lk-meta span){height:28px;padding:0 12px;display:inline-flex;align-items:center;border-radius:999px;background:var(--dent)}
:deep(.lk-meta b){margin-left:4px;font-weight:800}
:deep(.lk-label){margin-bottom:10px;font-size:12px;font-weight:800;letter-spacing:.02em;opacity:.5}
:deep(.lk-here){padding:18px 20px;border-radius:24px;background:var(--cobalt);color:#fff;--speak-bg:rgba(255,255,255,.2)}
:deep(.lk-here .lk-label){opacity:.7}
:deep(.lk-here strong){display:block;font-size:22px;font-weight:800;line-height:1.35;letter-spacing:-.02em}
:deep(.lk-quote){margin-top:10px;display:flex;align-items:flex-start;gap:8px}
:deep(.lk-quote blockquote){font-size:14px;line-height:1.65;opacity:.84}
:deep(.lk-forms div){display:flex;flex-wrap:wrap;gap:8px}
:deep(.lk-forms span){height:34px;padding:0 14px;display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:var(--lilac)}
:deep(.lk-forms b){font-size:11px;font-weight:700;opacity:.6}
:deep(.lk-forms i){font-size:14.5px;font-style:normal;font-weight:800}
:deep(.lk-senses){display:grid;gap:8px}
:deep(.lk-senses .lk-label){margin-bottom:2px}
:deep(.lk-senses article){display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;padding:14px 16px;border-radius:20px;background:var(--dent)}
:deep(.lk-senses em){width:34px;height:34px;display:grid;place-items:center;border-radius:12px;background:var(--ink);color:var(--paper);font-size:14px;font-style:normal;font-weight:800}
:deep(.lk-senses b){font-size:15px;font-weight:800;line-height:1.5}
:deep(.lk-example){display:flex;align-items:flex-start;gap:6px;margin-top:3px}
:deep(.lk-example p){font-size:14.5px;font-weight:600;line-height:1.6}
:deep(.lk-senses small){display:block;margin-top:2px;color:var(--muted);font-size:12.5px;line-height:1.65}
:deep(.lk-colls dl){display:grid;gap:10px}
:deep(.lk-colls dt){display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800}
:deep(.lk-colls dd){color:var(--soft);font-size:13px;line-height:1.65}
:deep(.lk-usage p){color:var(--soft);font-size:13.5px;line-height:1.8}

@media (max-width:760px){
  .sheet{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-height:86dvh;border-radius:32px}
  .sheet-enter-from,.sheet-leave-to{transform:translateY(60%) rotate(0)}
  .sheet header{padding:22px 16px 20px 22px}
  .body{padding:18px 20px}
}
@media (prefers-reduced-motion:reduce){.juggle i{animation:none}}
</style>
