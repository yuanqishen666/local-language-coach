<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import LookupBody from '../kit/LookupBody.vue'
import Speak from './Speak.vue'
import { useLookupDrawer } from '../logic/LookupDrawer'

const props = defineProps<{ term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }>()
const emit = defineEmits<{ close: [] }>()
const { loading, data, saved, error, targetLanguageCode, collocations, save, t } = useLookupDrawer(props)

// A habitual double-click must not open the panel and dismiss it in the same gesture.
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
  <Transition name="panel">
    <aside v-if="open" class="panel" :aria-label="t('lookup.title')">
      <header>
        <div class="head">
          <h2 :lang="targetLanguageCode">{{ term }}</h2>
          <Speak speech-id="lookup-term" :text="term" :language-code="targetLanguageCode" />
        </div>
        <button type="button" class="shut" :aria-label="t('common.close')" @click="emit('close')"><Icon name="close" :size="17" /></button>
      </header>
      <div class="body">
        <div v-if="loading" class="scan" aria-busy="true"><i v-for="n in 6" :key="n" :style="{ '--i': n }"></i></div>
        <p v-else-if="error" class="nf-error">{{ error }}</p>
        <LookupBody v-else-if="data" :term="term" :sentence="sentence" :data="data" :collocations="collocations" :target-language-code="targetLanguageCode">
          <template #speak="{ speechId, text }"><Speak :speech-id="speechId" :text="text" :language-code="targetLanguageCode" compact /></template>
        </LookupBody>
      </div>
      <footer>
        <button type="button" class="nf-btn keep" :class="{ saved }" :disabled="loading || saved || !data" @click="save">
          <Icon :name="saved ? 'check' : 'plus'" :size="16" :weight="2" />{{ saved ? t('lookup.saved') : t('lookup.add') }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.veil{position:fixed;inset:0;z-index:60;background:rgba(3,6,12,.5)}
.veil-enter-active,.veil-leave-active{transition:opacity .35s}
.veil-enter-from,.veil-leave-to{opacity:0}

.panel{position:fixed;z-index:61;top:14px;right:14px;bottom:14px;width:min(430px,calc(100vw - 28px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;border-radius:28px;background:rgba(17,27,45,.82);backdrop-filter:blur(30px) saturate(1.5);-webkit-backdrop-filter:blur(30px) saturate(1.5);box-shadow:inset 0 0 0 1px var(--line),inset 0 1px 0 rgba(255,255,255,.08),0 40px 100px rgba(0,0,0,.6)}
.panel-enter-active{transition:transform .65s var(--out),opacity .3s}
.panel-leave-active{transition:transform .3s ease-in,opacity .25s}
.panel-enter-from,.panel-leave-to{transform:translateX(40px) scale(.98);opacity:0}

header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:28px 22px 16px 28px}
.head{display:flex;align-items:center;gap:10px;min-width:0}
h2{font-size:40px;font-weight:300;line-height:1.1;letter-spacing:-.04em;overflow-wrap:anywhere}
.shut{flex:none;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;background:var(--faint);color:var(--soft);transition:color .25s,background .25s,transform .5s var(--spring)}
.shut:hover{color:#1b1204;background:var(--amber);transform:rotate(90deg)}

.body{overflow-y:auto;padding:0 28px 26px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.scan{position:relative;display:grid;gap:16px;padding-top:8px}
.scan i{height:12px;border-radius:99px;background:linear-gradient(90deg,var(--faint),rgba(255,182,72,.22),var(--faint)) 0 0/220% 100%;animation:scan 1.3s linear infinite;animation-delay:calc(var(--i) * -110ms)}
.scan i:nth-child(2n){width:72%}
.scan i:nth-child(3n){width:54%}
@keyframes scan{from{background-position:120% 0}to{background-position:-100% 0}}

.body :deep(.lk){display:grid;gap:24px}
.body :deep(.lk-meta){display:flex;flex-wrap:wrap;gap:6px 8px;font:500 11.5px/1 var(--mono)}
.body :deep(.lk-meta span){height:26px;padding:0 10px;display:inline-flex;align-items:center;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);color:var(--soft)}
.body :deep(.lk-meta b){margin-left:4px;color:var(--text);font-weight:500}
.body :deep(.lk-label){margin-bottom:10px;color:var(--muted);font:500 10.5px/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase}
.body :deep(.lk-here){padding:16px 18px;border-radius:18px;background:var(--amber-soft);box-shadow:inset 0 0 0 1px rgba(255,182,72,.3)}
.body :deep(.lk-here .lk-label){color:var(--amber)}
.body :deep(.lk-here strong){display:block;font-size:20px;font-weight:500;line-height:1.45}
.body :deep(.lk-quote){margin-top:10px;display:flex;align-items:flex-start;gap:8px}
.body :deep(.lk-quote blockquote){color:var(--soft);font-size:14px;line-height:1.7}
.body :deep(.lk-forms div){display:flex;flex-wrap:wrap;gap:8px 16px}
.body :deep(.lk-forms span){display:inline-flex;align-items:baseline;gap:6px}
.body :deep(.lk-forms b){color:var(--muted);font-size:11px;font-weight:500}
.body :deep(.lk-forms i){font-size:15px;font-style:normal}
.body :deep(.lk-senses article){display:grid;grid-template-columns:26px minmax(0,1fr);padding:12px 0;border-top:1px solid var(--line)}
.body :deep(.lk-senses em){color:var(--amber);font:500 12px/1.8 var(--mono);font-style:normal}
.body :deep(.lk-senses b){font-size:14.5px;font-weight:600;line-height:1.6}
.body :deep(.lk-example){display:flex;align-items:flex-start;gap:6px;margin-top:3px}
.body :deep(.lk-example p){font-size:14.5px;line-height:1.65}
.body :deep(.lk-senses small){display:block;margin-top:2px;color:var(--muted);font-size:12.5px;line-height:1.7}
.body :deep(.lk-colls dl){display:grid;gap:10px}
.body :deep(.lk-colls dt){display:flex;align-items:center;gap:6px;font-size:15px;font-weight:500}
.body :deep(.lk-colls dd){color:var(--soft);font-size:13px;line-height:1.7}
.body :deep(.lk-usage p){color:var(--soft);font-size:13.5px;line-height:1.85}

footer{padding:14px 22px 22px}
.keep{width:100%;height:50px;font-size:14.5px}
.keep.saved{background:none;color:var(--green)!important;box-shadow:inset 0 0 0 1px var(--green);opacity:1}
.keep.saved svg{animation:tick .5s var(--spring)}
@keyframes tick{from{transform:scale(0) rotate(-40deg)}}

@media (max-width:760px){
  .panel{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-height:86dvh}
  .panel-enter-from,.panel-leave-to{transform:translateY(40px)}
  header{padding:22px 16px 12px 22px}
  h2{font-size:32px}
  .body{padding:0 22px 20px}
  footer{padding:12px 16px calc(14px + env(safe-area-inset-bottom))}
}
@media (prefers-reduced-motion:reduce){.panel-enter-active,.panel-leave-active{transition:opacity .2s}.panel-enter-from,.panel-leave-to{transform:none}.scan i{animation:none}}
</style>
