<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsForm from '../kit/SettingsForm.vue'

const { t } = useI18n()
</script>

<template>
  <div class="pp-page sp">
    <header class="pp-head"><h1 class="pp-title">{{ t('settings.title') }}</h1></header>
    <SettingsForm />
  </div>
</template>

<style scoped>
.sp :deep(.st){display:grid;grid-template-columns:230px minmax(0,1fr);gap:0 40px;padding-top:40px;align-items:start}

/* the index in the margin */
.sp :deep(.st-nav){position:sticky;top:calc(var(--mast) + 24px);display:grid;gap:2px}
.sp :deep(.st-nav button){position:relative;padding:9px 0 9px 20px;border:0;background:none;color:var(--muted);font:500 19px/1.3 var(--serif);text-align:left;transition:color .3s,padding .5s var(--out)}
.sp :deep(.st-nav svg){display:none}
.sp :deep(.st-nav button::before){content:'';position:absolute;left:2px;top:50%;width:7px;height:7px;border-radius:50%;background:var(--red);transform:translateY(-50%) scale(0);transition:transform .45s var(--out)}
.sp :deep(.st-nav button:hover){color:var(--ink)}
.sp :deep(.st-nav button.on){color:var(--ink)}
.sp :deep(.st-nav button.on::before){transform:translateY(-50%) scale(1)}

.sp :deep(.st-pane){max-width:720px;display:grid;gap:36px}
.sp :deep(.st-pane-enter-active){transition:opacity .45s,transform .6s var(--out)}
.sp :deep(.st-pane-leave-active){transition:opacity .15s}
.sp :deep(.st-pane-enter-from){opacity:0;transform:translateY(12px)}
.sp :deep(.st-pane-leave-to){opacity:0}

.sp :deep(.st-grid){display:grid;grid-template-columns:1fr 1fr;gap:28px 40px}
.sp :deep(.st-field){display:grid;gap:8px;align-content:start}
.sp :deep(.st-field.wide){grid-column:1 / -1}
.sp :deep(.st-field>label),.sp :deep(.st-label),.sp :deep(.st-row label){color:var(--muted);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.sp :deep(.st-field small){color:var(--muted);font-size:12px;line-height:1.7}
.sp :deep(.st-select),.sp :deep(.st-input){width:100%;min-height:42px;padding:8px 0;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none;color:var(--ink);font:400 19px/1.4 var(--serif);outline:0;transition:border-color .3s,box-shadow .3s}
.sp :deep(.st-select){appearance:none;-webkit-appearance:none;padding-right:26px;background:no-repeat right 4px center/10px url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'><path d='m1 1 4 4 4-4' fill='none' stroke='%23191612' stroke-width='1.2'/></svg>")}
.sp :deep(.st-select:hover),.sp :deep(.st-input:hover){border-bottom-color:rgba(25,22,18,.42)}
.sp :deep(.st-select:focus),.sp :deep(.st-input:focus){border-bottom-color:var(--ink);box-shadow:0 1px 0 var(--ink);outline:0}
.sp :deep(.st-select:disabled){opacity:.4}
.sp :deep(.st-input::placeholder){color:rgba(25,22,18,.3);font-family:var(--sans);font-size:14px}
.sp :deep(.st-input[type='number']){font-variant-numeric:tabular-nums}

/* levels as large letters, the chosen one underlined in red */
.sp :deep(.st-choice){display:flex;gap:30px}
.sp :deep(.st-choice button){position:relative;padding:2px 0 8px;border:0;background:none;color:var(--muted);font:400 34px/1 var(--serif);letter-spacing:-.03em;transition:color .3s}
.sp :deep(.st-choice button::after){content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--red);transform:scaleX(0);transform-origin:left;transition:transform .5s var(--out)}
.sp :deep(.st-choice button:hover),.sp :deep(.st-choice button[aria-pressed='true']){color:var(--ink)}
.sp :deep(.st-choice button[aria-pressed='true']::after){transform:scaleX(1)}
.sp :deep(.st-options){display:grid;border-top:1px solid var(--line)}
.sp :deep(.st-options button){display:grid;grid-template-columns:22px minmax(0,1fr);align-items:baseline;padding:13px 0;border:0;border-bottom:1px solid var(--line);background:none;color:var(--soft);font-size:15px;line-height:1.6;text-align:left;transition:color .3s}
.sp :deep(.st-options i){width:9px;height:9px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(25,22,18,.35);transition:background .3s,box-shadow .3s,transform .5s var(--out)}
.sp :deep(.st-options button:hover){color:var(--ink)}
.sp :deep(.st-options button[aria-pressed='true']){color:var(--ink)}
.sp :deep(.st-options button[aria-pressed='true'] i){background:var(--red);box-shadow:none;animation:sp-dot .5s var(--out)}
@keyframes sp-dot{from{transform:scale(2.2)}}

.sp :deep(.st-block){display:grid;gap:16px;justify-items:start;padding-top:30px;border-top:1px solid var(--line)}
.sp :deep(.st-block .st-field){width:100%}
.sp :deep(.st-block h3),.sp :deep(.st-remote h3),.sp :deep(.st-provider h3){font:500 22px/1.3 var(--serif);letter-spacing:-.01em}
.sp :deep(.st-block p),.sp :deep(.st-note),.sp :deep(.st-remote p){color:var(--soft);font-size:14px;line-height:1.85}
.sp :deep(.st-note.quiet){color:var(--muted);font-size:12.5px}
.sp :deep(.st-row){display:flex;align-items:baseline;justify-content:space-between}
.sp :deep(.st-row output){font:400 30px/1 var(--serif);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.sp :deep(.st-range){appearance:none;-webkit-appearance:none;width:100%;height:28px;margin:0;background:linear-gradient(var(--ink),var(--ink)) 0 50%/var(--fill) 2px no-repeat,linear-gradient(var(--line),var(--line)) 0 50%/100% 1px no-repeat;outline-offset:6px}
.sp :deep(.st-range::-webkit-slider-thumb){-webkit-appearance:none;width:20px;height:20px;border:0;border-radius:4px;background:var(--red);transform:rotate(-6deg);transition:transform .4s var(--out);cursor:grab}
.sp :deep(.st-range::-moz-range-thumb){width:20px;height:20px;border:0;border-radius:4px;background:var(--red);cursor:grab}
.sp :deep(.st-range:hover::-webkit-slider-thumb){transform:rotate(-6deg) scale(1.15)}
.sp :deep(.st-range:active::-webkit-slider-thumb){transform:rotate(0) scale(.92);cursor:grabbing}
.sp :deep(.st-scale){display:flex;justify-content:space-between;color:var(--muted);font-size:11.5px}
.sp :deep(.st-foot){padding-top:4px}

.sp :deep(.st-btn){position:relative;height:38px;padding:0 16px;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:3px;background:none;box-shadow:inset 0 0 0 1px rgba(25,22,18,.4);color:var(--ink);font-size:12.5px;font-weight:600;letter-spacing:.03em;transition:background .3s,color .3s,box-shadow .3s,transform .2s}
.sp :deep(.st-btn:hover:not(:disabled)){background:var(--ink);color:var(--paper);box-shadow:inset 0 0 0 1px var(--ink)}
.sp :deep(.st-btn:active:not(:disabled)){transform:translateY(1px)}
.sp :deep(.st-btn.primary){height:44px;padding:0 22px;background:var(--ink);color:var(--paper);box-shadow:none;font-size:13px}
.sp :deep(.st-btn.primary:hover:not(:disabled)){background:var(--red)}
.sp :deep(.st-btn.danger){color:var(--red);box-shadow:inset 0 0 0 1px rgba(197,55,30,.5)}
.sp :deep(.st-btn.danger:hover:not(:disabled)),.sp :deep(.st-btn.danger.solid){background:var(--red);color:#fff;box-shadow:none}
.sp :deep(.st-btn:disabled){opacity:.3}
.sp :deep(.st-actions){display:flex;flex-wrap:wrap;gap:8px}

.sp :deep(.st-alert){padding:4px 0 4px 18px;border-left:2px solid var(--red)}
.sp :deep(.st-alert h2){font:500 22px/1.35 var(--serif)}
.sp :deep(.st-alert p){margin-top:6px;color:var(--soft);font-size:14px;line-height:1.8}

.sp :deep(.st-provider){display:grid;gap:24px;padding-top:28px;border-top:1px solid var(--ink)}
.sp :deep(.st-provider>header){display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}
.sp :deep(.st-logo){width:42px;height:42px;display:grid;place-items:center;border-radius:6px;box-shadow:inset 0 0 0 1px var(--ink);font:500 15px/1 var(--serif);font-style:normal;letter-spacing:.04em;transition:background .4s,color .4s,box-shadow .4s,transform .5s var(--out)}
.sp :deep(.st-provider.ready .st-logo){background:var(--red);color:var(--paper);box-shadow:none;transform:rotate(-4deg)}
.sp :deep(.st-provider>header span){color:var(--muted);font-size:12px}
.sp :deep(.st-state){color:var(--muted);font:italic 400 14px/1.3 var(--serif)}
.sp :deep(.st-state.ready){color:var(--red)}
.sp :deep(.st-provider>footer){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px}
.sp :deep(.st-result){flex:1 1 220px;color:var(--red);font-size:13px;line-height:1.6}
.sp :deep(.st-result.success){color:var(--ink)}

.sp :deep(.st-switch){display:flex;align-items:center;justify-content:space-between;gap:24px;padding:20px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--line);cursor:pointer}
.sp :deep(.st-switch.off){cursor:not-allowed}
.sp :deep(.st-switch b){display:block;font:500 21px/1.35 var(--serif)}
.sp :deep(.st-switch small){display:block;margin-top:4px;color:var(--red);font-size:12.5px;line-height:1.7}
.sp :deep(.st-toggle){position:relative;flex:none;width:54px;height:28px}
.sp :deep(.st-toggle input){position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
.sp :deep(.st-toggle i){position:absolute;inset:0;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(25,22,18,.4);transition:box-shadow .3s,background .3s}
.sp :deep(.st-toggle i::after){content:'';position:absolute;left:4px;top:4px;width:20px;height:20px;border-radius:3px;background:var(--ink);transition:transform .5s var(--out),background .3s}
.sp :deep(.st-toggle input:checked+i){box-shadow:inset 0 0 0 1px var(--red)}
.sp :deep(.st-toggle input:checked+i::after){background:var(--red);transform:translateX(26px) rotate(-6deg)}
.sp :deep(.st-toggle input:disabled+i){opacity:.3}
.sp :deep(.st-toggle input:focus-visible+i){outline:2px solid var(--red);outline-offset:3px}

.sp :deep(.st-facts){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin:0;padding:22px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
.sp :deep(.st-facts dt){color:var(--muted);font-size:11px;font-weight:600;letter-spacing:.12em}
.sp :deep(.st-facts dd){margin:8px 0 0;font:500 21px/1.3 var(--serif);overflow-wrap:anywhere}
.sp :deep(.st-files){display:grid;gap:10px;margin:0}
.sp :deep(.st-files div){display:flex;align-items:baseline;gap:12px}
.sp :deep(.st-files dt){font-size:14px}
.sp :deep(.st-files div::after){content:'';order:1;flex:1;height:2px;background:radial-gradient(circle,rgba(25,22,18,.4) 1px,transparent 1.2px) 0 0/8px 2px repeat-x}
.sp :deep(.st-files dd){order:2;margin:0;color:var(--soft);font:12.5px/1.4 ui-monospace,'SF Mono',Menlo,monospace}
.sp :deep(.st-remote){display:grid;gap:14px;justify-items:start;padding:24px;background:var(--sheet);box-shadow:0 0 0 1px var(--line)}
.sp :deep(.st-remote>header){width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px}
.sp :deep(.st-url){display:inline-flex;align-items:center;gap:8px;max-width:100%;color:var(--ink);font:13px/1.5 ui-monospace,'SF Mono',Menlo,monospace;text-decoration:underline;text-decoration-color:var(--red);text-underline-offset:4px}
.sp :deep(.st-url span){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp :deep(.st-warn){color:var(--red)!important}
.sp :deep(.st-remote code){padding:8px 12px;background:var(--ink);color:var(--paper);font:12.5px/1.5 ui-monospace,'SF Mono',Menlo,monospace;user-select:all}
.sp :deep(.st-block.danger h3){color:var(--red)}

.sp :deep(.st-veil){position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:24px;background:rgba(25,22,18,.32);animation:pp-fade .25s both}
.sp :deep(.st-dialog){width:min(440px,100%);padding:34px 34px 28px;background:var(--sheet);box-shadow:0 30px 80px rgba(25,22,18,.28),0 0 0 1px var(--line);animation:pp-slip .5s var(--out) both}
.sp :deep(.st-dialog h2){font:500 26px/1.25 var(--serif);letter-spacing:-.02em}
.sp :deep(.st-dialog p){margin-top:14px;color:var(--soft);font-size:13px;line-height:1.75}
.sp :deep(.st-dialog footer){margin-top:28px;display:flex;justify-content:flex-end;gap:10px}

@media (max-width:900px){
  .sp :deep(.st){grid-template-columns:1fr;gap:26px;padding-top:22px}
  .sp :deep(.st-nav){position:static;display:flex;gap:22px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
  .sp :deep(.st-nav button){flex:none;padding:6px 0 8px;font-size:17px;white-space:nowrap}
  .sp :deep(.st-nav button::before){left:0;right:0;top:auto;bottom:0;width:auto;height:2px;border-radius:0;transform:scaleX(0);transform-origin:left}
  .sp :deep(.st-nav button.on::before){transform:scaleX(1)}
}
@media (max-width:760px){
  .sp :deep(.st-grid){grid-template-columns:1fr}
  .sp :deep(.st-facts){grid-template-columns:1fr 1fr}
  .sp :deep(.st-choice){gap:24px}
  .sp :deep(.st-choice button){font-size:28px}
}
</style>
