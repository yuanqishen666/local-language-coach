<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsForm from '../kit/SettingsForm.vue'

const { t } = useI18n()
</script>

<template>
  <div class="bk-page sb">
    <header class="bk-head"><h1 class="bk-title">{{ t('settings.title') }}</h1></header>
    <SettingsForm />
  </div>
</template>

<style scoped>
.sb :deep(.st){display:grid;gap:14px}

/* four big keys, one per drawer */
.sb :deep(.st-nav){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-width:860px}
.sb :deep(.st-nav button){display:grid;justify-items:start;align-content:space-between;gap:16px;min-height:104px;padding:16px 18px;border:0;border-radius:26px;background:var(--paper);font-size:15px;font-weight:800;letter-spacing:-.02em;text-align:left;opacity:.55;transition:transform .5s var(--spring),opacity .2s,border-radius .3s}
.sb :deep(.st-nav button:nth-child(1)){background:var(--sun)}
.sb :deep(.st-nav button:nth-child(2)){background:var(--mint)}
.sb :deep(.st-nav button:nth-child(3)){background:var(--lilac)}
.sb :deep(.st-nav button:nth-child(4)){background:var(--peach)}
.sb :deep(.st-nav svg){width:24px;height:24px;transition:transform .5s var(--spring)}
.sb :deep(.st-nav button:hover){opacity:.85;transform:translateY(-4px) rotate(-1.5deg)}
.sb :deep(.st-nav button:hover svg){transform:rotate(-14deg) scale(1.15)}
.sb :deep(.st-nav button:active){transform:scale(.95)}
.sb :deep(.st-nav button.on){opacity:1;box-shadow:inset 0 0 0 4px var(--ink)}

.sb :deep(.st-pane){max-width:860px;display:grid;gap:12px}
.sb :deep(.st-pane-enter-active){transition:opacity .2s,transform .6s var(--spring)}
.sb :deep(.st-pane-leave-active){transition:opacity .12s}
.sb :deep(.st-pane-enter-from){opacity:0;transform:translateY(18px) scale(.98)}
.sb :deep(.st-pane-leave-to){opacity:0}

.sb :deep(.st-pane>.st-grid),.sb :deep(.st-pane>.st-field),.sb :deep(.st-block),.sb :deep(.st-provider),.sb :deep(.st-switch),.sb :deep(.st-facts),.sb :deep(.st-remote),.sb :deep(.st-alert){padding:24px 26px;border-radius:30px;background:var(--paper)}

.sb :deep(.st-grid){display:grid;grid-template-columns:1fr 1fr;gap:20px 22px}
.sb :deep(.st-field){display:grid;gap:10px;align-content:start}
.sb :deep(.st-field.wide){grid-column:1 / -1}
.sb :deep(.st-field>label),.sb :deep(.st-label),.sb :deep(.st-row label){font-size:12.5px;font-weight:800;letter-spacing:.01em}
.sb :deep(.st-field small){color:var(--soft);font-size:12px;font-weight:600;line-height:1.65}
.sb :deep(.st-select),.sb :deep(.st-input){width:100%;min-height:52px;padding:12px 18px;border:0;border-radius:18px;background:var(--dent);box-shadow:inset 0 0 0 2.5px transparent;color:var(--ink);font-size:15.5px;font-weight:700;line-height:1.5;outline:0;transition:box-shadow .2s}
.sb :deep(.st-select){appearance:none;-webkit-appearance:none;padding-right:44px;background:var(--dent) no-repeat right 18px center/12px url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'><path d='m1 1 4 4 4-4' fill='none' stroke='%23151515' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>")}
.sb :deep(.st-select:hover),.sb :deep(.st-input:hover){box-shadow:inset 0 0 0 2.5px var(--line)}
.sb :deep(.st-select:focus),.sb :deep(.st-input:focus){box-shadow:inset 0 0 0 2.5px var(--ink);outline:0}
.sb :deep(.st-select:disabled){opacity:.4}
.sb :deep(.st-input::placeholder){color:rgba(21,21,21,.32);font-weight:600}
.sb :deep(.st-input[type='number']){font-variant-numeric:tabular-nums}

/* levels are four blocks; the chosen one turns blue and stands up */
.sb :deep(.st-choice){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.sb :deep(.st-choice button){height:68px;border:0;border-radius:20px;background:var(--dent);font-size:24px;font-weight:800;letter-spacing:-.03em;transition:transform .5s var(--spring),background .2s,color .2s,border-radius .3s}
.sb :deep(.st-choice button:hover){transform:translateY(-4px) rotate(-3deg)}
.sb :deep(.st-choice button:active){transform:scale(.92)}
.sb :deep(.st-choice button[aria-pressed='true']){background:var(--cobalt);color:#fff;border-radius:999px;transform:translateY(-4px)}
.sb :deep(.st-options){display:grid;gap:8px}
.sb :deep(.st-options button){display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;padding:14px 18px;border:0;border-radius:18px;background:var(--dent);font-size:14.5px;font-weight:700;line-height:1.55;text-align:left;transition:transform .5s var(--spring),background .2s,color .2s}
.sb :deep(.st-options i){width:16px;height:16px;border-radius:5px;background:rgba(21,21,21,.18);transition:background .2s,border-radius .3s,transform .5s var(--spring)}
.sb :deep(.st-options button:hover){transform:translateX(5px)}
.sb :deep(.st-options button[aria-pressed='true']){background:var(--ink);color:var(--paper)}
.sb :deep(.st-options button[aria-pressed='true'] i){background:var(--sun);border-radius:50%;transform:scale(1.2)}

.sb :deep(.st-block){display:grid;gap:16px;justify-items:start}
.sb :deep(.st-block .st-field){width:100%}
.sb :deep(.st-block h3),.sb :deep(.st-remote h3),.sb :deep(.st-provider h3){font-size:22px;font-weight:800;letter-spacing:-.035em;line-height:1.2}
.sb :deep(.st-block p),.sb :deep(.st-note),.sb :deep(.st-remote p){color:var(--soft);font-size:13.5px;font-weight:600;line-height:1.75}
.sb :deep(.st-note.quiet){color:var(--muted);font-size:12.5px}
.sb :deep(.st-row){display:flex;align-items:center;justify-content:space-between}
.sb :deep(.st-row output){height:44px;padding:0 16px;display:inline-grid;place-items:center;border-radius:16px;background:var(--sun);font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em;transform:rotate(3deg)}
.sb :deep(.st-range){appearance:none;-webkit-appearance:none;width:100%;height:40px;margin:0;border-radius:999px;background:linear-gradient(var(--ink),var(--ink)) 0 50%/var(--fill) 14px no-repeat,linear-gradient(var(--dent),var(--dent)) 0 50%/100% 14px no-repeat;outline-offset:6px}
.sb :deep(.st-range::-webkit-slider-runnable-track){height:14px;border-radius:999px}
.sb :deep(.st-range::-webkit-slider-thumb){-webkit-appearance:none;width:34px;height:34px;margin-top:-10px;border:0;border-radius:12px;background:var(--tomato);transition:transform .45s var(--spring),border-radius .3s;cursor:grab}
.sb :deep(.st-range::-moz-range-thumb){width:34px;height:34px;border:0;border-radius:12px;background:var(--tomato);cursor:grab}
.sb :deep(.st-range:hover::-webkit-slider-thumb){transform:scale(1.15) rotate(-10deg)}
.sb :deep(.st-range:active::-webkit-slider-thumb){transform:scale(.9);border-radius:50%;cursor:grabbing}
.sb :deep(.st-scale){display:flex;justify-content:space-between;color:var(--muted);font-size:12px;font-weight:700}
.sb :deep(.st-foot){padding-top:4px}

.sb :deep(.st-btn){position:relative;height:42px;padding:0 18px;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;background:var(--dent);color:var(--ink);font-size:13px;font-weight:800;white-space:nowrap;transition:transform .5s var(--spring),background .2s,color .2s}
.sb :deep(.st-btn:hover:not(:disabled)){transform:scale(1.06) rotate(-2deg);background:var(--sun)}
.sb :deep(.st-btn:active:not(:disabled)){transform:scale(.92,.86)}
.sb :deep(.st-btn.primary){height:54px;padding:0 28px;background:var(--ink);color:var(--paper);font-size:15px}
.sb :deep(.st-btn.primary:hover:not(:disabled)){background:var(--cobalt);color:#fff}
.sb :deep(.st-btn.danger){background:rgba(255,90,54,.16)}
.sb :deep(.st-btn.danger:hover:not(:disabled)),.sb :deep(.st-btn.danger.solid){background:var(--tomato);color:var(--ink)}
.sb :deep(.st-btn:disabled){opacity:.3}
.sb :deep(.st-actions){display:flex;flex-wrap:wrap;gap:8px}

.sb :deep(.st-alert){background:var(--tomato)}
.sb :deep(.st-alert h2){font-size:22px;font-weight:800;letter-spacing:-.03em;line-height:1.25}
.sb :deep(.st-alert p){margin-top:6px;font-size:13.5px;font-weight:600;line-height:1.7}

.sb :deep(.st-provider){display:grid;gap:20px}
.sb :deep(.st-provider>header){display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}
.sb :deep(.st-logo){width:52px;height:52px;display:grid;place-items:center;border-radius:18px;background:var(--dent);font-size:14px;font-style:normal;font-weight:800;letter-spacing:.02em;transition:background .3s,transform .6s var(--spring),border-radius .3s}
.sb :deep(.st-provider.ready .st-logo){background:var(--mint);border-radius:50%;transform:rotate(-8deg)}
.sb :deep(.st-provider>header span){color:var(--soft);font-size:12.5px;font-weight:600}
.sb :deep(.st-state){height:32px;padding:0 14px;display:inline-flex;align-items:center;border-radius:999px;background:var(--dent);font-size:12px;font-style:normal;font-weight:800}
.sb :deep(.st-state.ready){background:var(--mint)}
.sb :deep(.st-provider>footer){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px}
.sb :deep(.st-result){flex:1 1 220px;color:#c7300f;font-size:13px;font-weight:700;line-height:1.6}
.sb :deep(.st-result.success){color:var(--ink)}

/* a chunky switch: the knob rolls across and changes shape */
.sb :deep(.st-switch){display:flex;align-items:center;justify-content:space-between;gap:24px;cursor:pointer}
.sb :deep(.st-switch.off){cursor:not-allowed}
.sb :deep(.st-switch b){display:block;font-size:22px;font-weight:800;letter-spacing:-.035em;line-height:1.25}
.sb :deep(.st-switch small){display:block;margin-top:4px;color:#c7300f;font-size:12.5px;font-weight:700;line-height:1.65}
.sb :deep(.st-toggle){position:relative;flex:none;width:84px;height:48px}
.sb :deep(.st-toggle input){position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
.sb :deep(.st-toggle i){position:absolute;inset:0;border-radius:999px;background:var(--dent);transition:background .25s}
.sb :deep(.st-toggle i::after){content:'';position:absolute;left:6px;top:6px;width:36px;height:36px;border-radius:12px;background:var(--ink);transition:transform .6s var(--spring),border-radius .3s,background .25s}
.sb :deep(.st-toggle input:checked+i){background:var(--mint)}
.sb :deep(.st-toggle input:checked+i::after){border-radius:50%;transform:translateX(36px) rotate(180deg)}
.sb :deep(.st-toggle input:disabled+i){opacity:.3}
.sb :deep(.st-toggle input:focus-visible+i){outline:3px solid var(--ink);outline-offset:3px}

.sb :deep(.st-facts){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin:0}
.sb :deep(.st-facts dt){font-size:12px;font-weight:800;opacity:.5}
.sb :deep(.st-facts dd){margin:8px 0 0;font-size:22px;font-weight:800;letter-spacing:-.035em;line-height:1.2;overflow-wrap:anywhere}
.sb :deep(.st-files){display:grid;gap:8px;margin:0;width:100%}
.sb :deep(.st-files div){display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:16px;background:var(--dent)}
.sb :deep(.st-files dt){font-size:13.5px;font-weight:800}
.sb :deep(.st-files dd){margin:0;color:var(--soft);font:600 12px/1.4 ui-monospace,'SF Mono',Menlo,monospace}
.sb :deep(.st-remote){display:grid;gap:14px;justify-items:start}
.sb :deep(.st-remote.active){background:var(--mint)}
.sb :deep(.st-remote>header){width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px}
.sb :deep(.st-url){display:inline-flex;align-items:center;gap:8px;max-width:100%;height:40px;padding:0 16px;border-radius:999px;background:var(--ink);color:var(--paper);font:700 13px/1.5 ui-monospace,'SF Mono',Menlo,monospace}
.sb :deep(.st-url span){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb :deep(.st-warn){color:#c7300f!important}
.sb :deep(.st-remote code){max-width:100%;padding:10px 16px;border-radius:14px;background:var(--ink);color:var(--sun);font:600 12.5px/1.5 ui-monospace,'SF Mono',Menlo,monospace;overflow-wrap:anywhere;user-select:all}
.sb :deep(.st-block.danger){background:var(--peach)}
.sb :deep(.st-block.danger .st-btn.danger){background:var(--ink);color:var(--paper)}
.sb :deep(.st-block.danger .st-btn.danger:hover:not(:disabled)){background:var(--tomato);color:var(--ink)}

.sb :deep(.st-veil){position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:20px;background:rgba(21,21,21,.5);animation:bk-fade .2s both}
.sb :deep(.st-dialog){width:min(440px,100%);padding:30px;border-radius:36px;background:var(--paper);animation:bk-pop .6s var(--spring) both}
.sb :deep(.st-dialog h2){font-size:28px;font-weight:800;letter-spacing:-.035em;line-height:1.15}
.sb :deep(.st-dialog p){margin-top:12px;color:var(--soft);font-size:14px;font-weight:600;line-height:1.7}
.sb :deep(.st-dialog footer){margin-top:24px;display:flex;justify-content:flex-end;gap:10px}

@media (max-width:760px){
  .sb :deep(.st-nav){grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .sb :deep(.st-nav button){min-height:78px;padding:13px 15px;gap:8px;border-radius:22px;font-size:14px}
  .sb :deep(.st-pane>.st-grid),.sb :deep(.st-pane>.st-field),.sb :deep(.st-block),.sb :deep(.st-provider),.sb :deep(.st-switch),.sb :deep(.st-facts),.sb :deep(.st-remote),.sb :deep(.st-alert){padding:20px 18px;border-radius:26px}
  .sb :deep(.st-grid){grid-template-columns:1fr}
  .sb :deep(.st-facts){grid-template-columns:1fr 1fr}
  .sb :deep(.st-provider>header){grid-template-columns:auto minmax(0,1fr)}
  .sb :deep(.st-provider .st-state){grid-column:2;justify-self:start}
}
</style>
