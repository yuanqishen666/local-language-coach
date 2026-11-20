<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import LookupBody from '../kit/LookupBody.vue'
import Speak from './Speak.vue'
import { useLookupDrawer } from '../logic/LookupDrawer'

const props = defineProps<{ term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }>()
const emit = defineEmits<{ close: [] }>()
const { loading, data, saved, error, targetLanguageCode, collocations, save, t } = useLookupDrawer(props)

// A habitual double-click must not open the slip and dismiss it in the same gesture.
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
  <Transition name="slip">
    <aside v-if="open" class="slip" :aria-label="t('lookup.title')">
      <header>
        <div class="head">
          <h2 :lang="targetLanguageCode">{{ term }}</h2>
          <Speak speech-id="lookup-term" :text="term" :language-code="targetLanguageCode" />
        </div>
        <button type="button" class="shut" :aria-label="t('common.close')" @click="emit('close')"><Icon name="close" :size="18" /></button>
      </header>
      <div class="body">
        <div v-if="loading" class="ruled" aria-busy="true"><i v-for="n in 7" :key="n" :style="{ '--i': n }"></i></div>
        <p v-else-if="error" class="pp-error">{{ error }}</p>
        <LookupBody v-else-if="data" :term="term" :sentence="sentence" :data="data" :collocations="collocations" :target-language-code="targetLanguageCode">
          <template #speak="{ speechId, text }"><Speak :speech-id="speechId" :text="text" :language-code="targetLanguageCode" compact /></template>
        </LookupBody>
      </div>
      <footer>
        <button type="button" class="keep" :class="{ saved }" :disabled="loading || saved || !data" @click="save">
          <span class="stamp" aria-hidden="true"><Icon :name="saved ? 'check' : 'plus'" :size="15" :weight="2" /></span>
          {{ saved ? t('lookup.saved') : t('lookup.add') }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.veil{position:fixed;inset:0;z-index:60;background:rgba(25,22,18,.16)}
.veil-enter-active,.veil-leave-active{transition:opacity .4s}
.veil-enter-from,.veil-leave-to{opacity:0}

.slip{position:fixed;z-index:61;top:18px;right:18px;bottom:18px;width:min(440px,calc(100vw - 36px));display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--sheet);box-shadow:0 0 0 1px var(--line),0 30px 80px -30px rgba(25,22,18,.5);transform-origin:100% 30%}
.slip::before{content:'';position:absolute;top:0;bottom:0;left:36px;width:1px;background:rgba(197,55,30,.28);pointer-events:none}
.slip-enter-active{transition:transform .7s var(--out),opacity .3s}
.slip-leave-active{transition:transform .35s ease-in,opacity .3s .05s}
.slip-enter-from,.slip-leave-to{transform:translateX(60px) rotate(2.5deg);opacity:0}

header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:34px 22px 18px 56px}
.head{display:flex;align-items:center;gap:10px;min-width:0}
h2{font:500 40px/1.1 var(--serif);letter-spacing:-.02em;overflow-wrap:anywhere}
.shut{flex:none;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:50%;background:none;color:var(--muted);transition:color .25s,transform .5s var(--out)}
.shut:hover{color:var(--ink);transform:rotate(90deg)}

.body{overflow-y:auto;padding:0 28px 28px 56px;overscroll-behavior:contain}
.ruled{display:grid;gap:22px;padding-top:10px}
.ruled i{height:1px;background:linear-gradient(90deg,var(--line) 0 50%,transparent 50% 100%) 0 0/200% 100%;animation:rule 1.3s var(--out) infinite;animation-delay:calc(var(--i) * 90ms)}
.ruled i:nth-child(3n){width:62%}
.ruled i:nth-child(4n){width:84%}
@keyframes rule{from{background-position:100% 0}to{background-position:0 0}}

.body :deep(.lk){display:grid;gap:26px}
.body :deep(.lk-meta){display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--soft);font:italic 400 15px/1.5 var(--serif)}
.body :deep(.lk-meta b){font-style:normal;font-weight:500;color:var(--ink)}
.body :deep(.lk-label){margin-bottom:10px;color:var(--muted);font-size:11px;font-weight:600;letter-spacing:.14em}
.body :deep(.lk-here strong){display:block;font:500 22px/1.45 var(--serif)}
.body :deep(.lk-quote){margin-top:12px;display:flex;align-items:flex-start;gap:8px}
.body :deep(.lk-quote blockquote){padding-left:14px;border-left:1px solid var(--red);color:var(--soft);font:italic 400 15px/1.7 var(--serif)}
.body :deep(.lk-forms div){display:flex;flex-wrap:wrap;gap:8px 18px}
.body :deep(.lk-forms span){display:inline-flex;align-items:baseline;gap:6px}
.body :deep(.lk-forms b){color:var(--muted);font-size:11px;font-weight:500}
.body :deep(.lk-forms i){font:400 16px/1.4 var(--serif);font-style:normal}
.body :deep(.lk-senses article){display:grid;grid-template-columns:22px minmax(0,1fr);padding:12px 0;border-top:1px solid var(--line)}
.body :deep(.lk-senses article:last-child){border-bottom:1px solid var(--line)}
.body :deep(.lk-senses em){color:var(--red);font:500 14px/1.7 var(--serif);font-style:normal}
.body :deep(.lk-senses b){font-size:15px;font-weight:600;line-height:1.6}
.body :deep(.lk-example){display:flex;align-items:flex-start;gap:6px;margin-top:4px}
.body :deep(.lk-example p){font:400 15.5px/1.65 var(--serif)}
.body :deep(.lk-senses small){display:block;margin-top:2px;color:var(--muted);font-size:12.5px;line-height:1.7}
.body :deep(.lk-colls dl){display:grid;gap:10px}
.body :deep(.lk-colls dt){display:flex;align-items:center;gap:6px;font:500 16px/1.5 var(--serif)}
.body :deep(.lk-colls dd){color:var(--soft);font-size:13px;line-height:1.7}
.body :deep(.lk-usage p){color:var(--soft);font-size:13.5px;line-height:1.85}

footer{padding:14px 28px 22px 56px;border-top:1px solid var(--line)}
.keep{display:inline-flex;align-items:center;gap:12px;padding:0;border:0;background:none;color:var(--ink);font-size:14px;font-weight:600}
.keep:disabled{color:var(--muted)}
.stamp{width:38px;height:38px;display:grid;place-items:center;border-radius:6px;background:var(--red);color:#fff;transition:transform .5s var(--out),background .3s}
.keep:not(:disabled):hover .stamp{transform:rotate(-8deg) scale(1.06)}
.keep:not(:disabled):active .stamp{transform:scale(.88)}
.keep:disabled:not(.saved) .stamp{background:var(--line);color:var(--muted)}
.keep.saved{color:var(--red)}
.keep.saved .stamp{background:none;color:var(--red);box-shadow:inset 0 0 0 1.5px var(--red);animation:stamped .6s var(--out)}
@keyframes stamped{0%{transform:scale(1.7) rotate(-14deg);opacity:0}55%{transform:scale(.92) rotate(-5deg);opacity:1}100%{transform:rotate(-5deg)}}
.keep.saved .stamp{transform:rotate(-5deg)}

@media (max-width:760px){
  .slip{top:auto;left:0;right:0;bottom:0;width:auto;max-height:86dvh;transform-origin:50% 100%}
  .slip::before{left:22px}
  .slip-enter-from,.slip-leave-to{transform:translateY(40px)}
  header{padding:24px 14px 14px 38px}
  h2{font-size:32px}
  .body{padding:0 20px 22px 38px}
  footer{padding:12px 20px calc(14px + env(safe-area-inset-bottom)) 38px}
}
@media (prefers-reduced-motion:reduce){.slip-enter-active,.slip-leave-active{transition:opacity .2s}.slip-enter-from,.slip-leave-to{transform:none}.ruled i,.keep.saved .stamp{animation:none}}
</style>
