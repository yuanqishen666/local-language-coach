<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsForm from '../kit/SettingsForm.vue'
import Flap from './Flap.vue'

const { t } = useI18n()
</script>

<template>
  <div class="nf-page sn">
    <header class="nf-head"><h1 class="nf-title"><Flap :text="t('settings.title')" /></h1></header>
    <SettingsForm />
  </div>
</template>

<style scoped>
.sn :deep(.st){display:grid;gap:30px}

/* the overhead panel: four keys, the lit one is where you are */
.sn :deep(.st-nav){display:flex;gap:6px;width:max-content;max-width:100%;padding:5px;border-radius:999px;background:var(--faint);box-shadow:inset 0 0 0 1px var(--line);overflow-x:auto;scrollbar-width:none}
.sn :deep(.st-nav button){flex:none;display:inline-flex;align-items:center;gap:9px;height:40px;padding:0 18px;border:0;border-radius:999px;background:none;color:var(--soft);font-size:13.5px;font-weight:600;white-space:nowrap;transition:color .25s,background .3s,transform .4s var(--spring)}
.sn :deep(.st-nav button:hover){color:var(--text)}
.sn :deep(.st-nav button:active){transform:scale(.95)}
.sn :deep(.st-nav button.on){background:var(--amber);color:#1b1204}

.sn :deep(.st-pane){max-width:820px;display:grid;gap:18px}
.sn :deep(.st-pane-enter-active){transition:opacity .4s,transform .55s var(--out)}
.sn :deep(.st-pane-leave-active){transition:opacity .14s}
.sn :deep(.st-pane-enter-from){opacity:0;transform:translateY(12px)}
.sn :deep(.st-pane-leave-to){opacity:0}

.sn :deep(.st-pane>.st-grid),.sn :deep(.st-block),.sn :deep(.st-provider),.sn :deep(.st-switch),.sn :deep(.st-facts),.sn :deep(.st-remote),.sn :deep(.st-alert){padding:26px 28px;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));box-shadow:inset 0 0 0 1px var(--line),inset 0 1px 0 rgba(255,255,255,.06)}

.sn :deep(.st-grid){display:grid;grid-template-columns:1fr 1fr;gap:24px 28px}
.sn :deep(.st-field){display:grid;gap:10px;align-content:start}
.sn :deep(.st-field.wide){grid-column:1 / -1}
.sn :deep(.st-field>label),.sn :deep(.st-label),.sn :deep(.st-row label){color:var(--muted);font:500 11px/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase}
.sn :deep(.st-field small){color:var(--muted);font-size:12px;line-height:1.7}
.sn :deep(.st-select),.sn :deep(.st-input){width:100%;min-height:46px;padding:10px 16px;border:0;border-radius:14px;background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px var(--line);color:var(--text);font-size:15px;line-height:1.5;outline:0;transition:box-shadow .3s,background .3s}
.sn :deep(.st-select){appearance:none;-webkit-appearance:none;padding-right:40px;background:rgba(255,255,255,.045) no-repeat right 16px center/10px url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'><path d='m1 1 4 4 4-4' fill='none' stroke='%23ffb648' stroke-width='1.4'/></svg>")}
.sn :deep(.st-select option){background:#111b2d;color:#eaeef6}
.sn :deep(.st-select:hover),.sn :deep(.st-input:hover){box-shadow:inset 0 0 0 1px rgba(234,238,246,.24)}
.sn :deep(.st-select:focus),.sn :deep(.st-input:focus){box-shadow:inset 0 0 0 1px var(--amber),0 0 0 4px var(--amber-soft);outline:0}
.sn :deep(.st-select:disabled){opacity:.4}
.sn :deep(.st-input::placeholder){color:rgba(234,238,246,.28)}
.sn :deep(.st-input[type='number']),.sn :deep(.st-input[type='password']){font-family:var(--mono);font-size:14px}

/* levels climb like altitude */
.sn :deep(.st-choice){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.sn :deep(.st-choice button){height:58px;border:0;border-radius:16px;background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);font-size:22px;font-weight:300;letter-spacing:-.02em;transition:transform .45s var(--spring),box-shadow .25s,background .25s,color .25s}
.sn :deep(.st-choice button:hover){transform:translateY(-3px);color:var(--text);box-shadow:inset 0 0 0 1px rgba(234,238,246,.3)}
.sn :deep(.st-choice button[aria-pressed='true']){background:var(--amber);box-shadow:0 12px 30px -12px rgba(255,182,72,.8);color:#1b1204;font-weight:600}
.sn :deep(.st-options){display:grid;gap:8px}
.sn :deep(.st-options button){display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;padding:13px 16px;border:0;border-radius:14px;background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px var(--line);color:var(--soft);font-size:14.5px;line-height:1.6;text-align:left;transition:color .25s,box-shadow .25s,background .25s}
.sn :deep(.st-options i){width:8px;height:8px;border-radius:50%;background:var(--muted);transition:background .3s,box-shadow .3s}
.sn :deep(.st-options button:hover){color:var(--text);box-shadow:inset 0 0 0 1px rgba(234,238,246,.3)}
.sn :deep(.st-options button[aria-pressed='true']){background:var(--amber-soft);box-shadow:inset 0 0 0 1px var(--amber);color:var(--text)}
.sn :deep(.st-options button[aria-pressed='true'] i){background:var(--amber);box-shadow:0 0 0 3px var(--amber-soft),0 0 12px var(--amber)}

.sn :deep(.st-block){display:grid;gap:16px;justify-items:start}
.sn :deep(.st-block .st-field){width:100%}
.sn :deep(.st-block h3),.sn :deep(.st-remote h3),.sn :deep(.st-provider h3){font-size:19px;font-weight:500;letter-spacing:-.02em;line-height:1.3}
.sn :deep(.st-block p),.sn :deep(.st-note),.sn :deep(.st-remote p){color:var(--soft);font-size:13.5px;line-height:1.8}
.sn :deep(.st-note.quiet){color:var(--muted);font-size:12.5px}
.sn :deep(.st-row){display:flex;align-items:baseline;justify-content:space-between}
.sn :deep(.st-row output){color:var(--amber);font:500 26px/1 var(--mono);letter-spacing:-.02em}
.sn :deep(.st-range){appearance:none;-webkit-appearance:none;width:100%;height:30px;margin:0;background:linear-gradient(var(--amber),var(--amber)) 0 50%/var(--fill) 3px no-repeat,linear-gradient(rgba(234,238,246,.16),rgba(234,238,246,.16)) 0 50%/100% 3px no-repeat;outline-offset:6px}
.sn :deep(.st-range::-webkit-slider-thumb){-webkit-appearance:none;width:22px;height:22px;border:0;border-radius:50%;background:var(--amber);box-shadow:0 0 0 5px var(--amber-soft),0 0 16px rgba(255,182,72,.7);transition:transform .4s var(--spring);cursor:grab}
.sn :deep(.st-range::-moz-range-thumb){width:22px;height:22px;border:0;border-radius:50%;background:var(--amber);cursor:grab}
.sn :deep(.st-range:hover::-webkit-slider-thumb){transform:scale(1.15)}
.sn :deep(.st-range:active::-webkit-slider-thumb){transform:scale(.9);cursor:grabbing}
.sn :deep(.st-scale){display:flex;justify-content:space-between;color:var(--muted);font:11px/1.4 var(--mono);letter-spacing:.04em}
.sn :deep(.st-foot){padding-top:6px}

.sn :deep(.st-btn){position:relative;height:38px;padding:0 17px;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;background:none;box-shadow:inset 0 0 0 1px rgba(234,238,246,.24);color:var(--text);font-size:12.5px;font-weight:600;white-space:nowrap;transition:box-shadow .25s,color .25s,background .25s,transform .4s var(--spring)}
.sn :deep(.st-btn:hover:not(:disabled)){box-shadow:inset 0 0 0 1px var(--amber);color:var(--amber)}
.sn :deep(.st-btn:active:not(:disabled)){transform:scale(.96)}
.sn :deep(.st-btn.primary){height:46px;padding:0 26px;background:var(--amber);box-shadow:none;color:#1b1204;font-size:13.5px;font-weight:700}
.sn :deep(.st-btn.primary:hover:not(:disabled)){transform:translateY(-2px);box-shadow:0 10px 30px -8px rgba(255,182,72,.7);color:#1b1204}
.sn :deep(.st-btn.danger){color:var(--red);box-shadow:inset 0 0 0 1px rgba(255,107,87,.5)}
.sn :deep(.st-btn.danger:hover:not(:disabled)),.sn :deep(.st-btn.danger.solid){background:var(--red);box-shadow:none;color:#230500}
.sn :deep(.st-btn:disabled){opacity:.3}
.sn :deep(.st-actions){display:flex;flex-wrap:wrap;gap:8px}

.sn :deep(.st-alert){box-shadow:inset 0 0 0 1px rgba(255,107,87,.4)}
.sn :deep(.st-alert h2){font-size:19px;font-weight:500;line-height:1.35}
.sn :deep(.st-alert p){margin-top:6px;color:var(--soft);font-size:13.5px;line-height:1.8}

.sn :deep(.st-provider){display:grid;gap:22px;transition:box-shadow .4s}
.sn :deep(.st-provider.ready){box-shadow:inset 0 0 0 1px rgba(98,214,162,.34),inset 0 1px 0 rgba(255,255,255,.06)}
.sn :deep(.st-provider>header){display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}
.sn :deep(.st-logo){width:44px;height:44px;display:grid;place-items:center;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(234,238,246,.24);font:600 13px/1 var(--mono);font-style:normal;letter-spacing:.04em;transition:background .4s,color .4s,box-shadow .4s}
.sn :deep(.st-provider.ready .st-logo){background:var(--green);box-shadow:none;color:#04180f}
.sn :deep(.st-provider>header span){color:var(--muted);font-size:12px}
.sn :deep(.st-state){display:inline-flex;align-items:center;gap:9px;color:var(--muted);font:500 11px/1.2 var(--mono);font-style:normal;letter-spacing:.1em;text-transform:uppercase}
.sn :deep(.st-state::before){content:'';width:7px;height:7px;border-radius:50%;background:var(--muted)}
.sn :deep(.st-state.ready){color:var(--green)}
.sn :deep(.st-state.ready::before){background:var(--green);box-shadow:0 0 0 3px rgba(98,214,162,.14),0 0 12px var(--green)}
.sn :deep(.st-provider>footer){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px}
.sn :deep(.st-result){flex:1 1 220px;color:var(--red);font-size:13px;line-height:1.6}
.sn :deep(.st-result.success){color:var(--green)}

/* a cockpit switch */
.sn :deep(.st-switch){display:flex;align-items:center;justify-content:space-between;gap:24px;cursor:pointer}
.sn :deep(.st-switch.off){cursor:not-allowed}
.sn :deep(.st-switch b){display:block;font-size:19px;font-weight:500;letter-spacing:-.02em;line-height:1.35}
.sn :deep(.st-switch small){display:block;margin-top:4px;color:var(--red);font-size:12.5px;line-height:1.7}
.sn :deep(.st-toggle){position:relative;flex:none;width:62px;height:34px}
.sn :deep(.st-toggle input){position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
.sn :deep(.st-toggle i){position:absolute;inset:0;border-radius:999px;background:rgba(0,0,0,.4);box-shadow:inset 0 0 0 1px rgba(234,238,246,.2);transition:box-shadow .3s,background .3s}
.sn :deep(.st-toggle i::after){content:'';position:absolute;left:4px;top:4px;width:26px;height:26px;border-radius:50%;background:var(--muted);transition:transform .5s var(--spring),background .3s,box-shadow .3s}
.sn :deep(.st-toggle input:checked+i){background:var(--amber-soft);box-shadow:inset 0 0 0 1px var(--amber)}
.sn :deep(.st-toggle input:checked+i::after){background:var(--amber);box-shadow:0 0 16px rgba(255,182,72,.8);transform:translateX(28px)}
.sn :deep(.st-toggle input:disabled+i){opacity:.3}
.sn :deep(.st-toggle input:focus-visible+i){outline:2px solid var(--amber);outline-offset:3px}

.sn :deep(.st-facts){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin:0}
.sn :deep(.st-facts dt){color:var(--muted);font:500 11px/1.2 var(--mono);letter-spacing:.12em;text-transform:uppercase}
.sn :deep(.st-facts dd){margin:10px 0 0;font-size:19px;font-weight:400;letter-spacing:-.01em;line-height:1.3;overflow-wrap:anywhere}
.sn :deep(.st-files){display:grid;gap:10px;margin:0;width:100%}
.sn :deep(.st-files div){display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:12px;background:var(--faint)}
.sn :deep(.st-files dt){font-size:13.5px}
.sn :deep(.st-files dd){margin:0;color:var(--soft);font:12px/1.4 var(--mono)}
.sn :deep(.st-remote){display:grid;gap:14px;justify-items:start}
.sn :deep(.st-remote.active){box-shadow:inset 0 0 0 1px rgba(98,214,162,.34)}
.sn :deep(.st-remote>header){width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px}
.sn :deep(.st-url){display:inline-flex;align-items:center;gap:8px;max-width:100%;color:var(--amber);font:13px/1.5 var(--mono)}
.sn :deep(.st-url span){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sn :deep(.st-warn){color:var(--red)!important}
.sn :deep(.st-remote code){max-width:100%;padding:9px 14px;border-radius:10px;background:rgba(0,0,0,.4);color:var(--amber);font:12.5px/1.5 var(--mono);overflow-wrap:anywhere;user-select:all}
.sn :deep(.st-block.danger){box-shadow:inset 0 0 0 1px rgba(255,107,87,.3)}
.sn :deep(.st-block.danger h3){color:var(--red)}

.sn :deep(.st-veil){position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:24px;background:rgba(3,6,12,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:nf-fade .25s both}
.sn :deep(.st-dialog){width:min(440px,100%);padding:30px;border-radius:26px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line),0 40px 100px rgba(0,0,0,.6);animation:nf-rise .5s var(--out) both}
.sn :deep(.st-dialog h2){font-size:24px;font-weight:500;letter-spacing:-.02em;line-height:1.25}
.sn :deep(.st-dialog p){margin-top:12px;color:var(--soft);font-size:13.5px;line-height:1.75}
.sn :deep(.st-dialog footer){margin-top:26px;display:flex;justify-content:flex-end;gap:10px}

@media (max-width:760px){
  .sn :deep(.st){gap:22px}
  .sn :deep(.st-nav){width:auto;margin:0 calc(var(--gutter) * -1);padding:0 var(--gutter);border-radius:0;background:none;box-shadow:none}
  .sn :deep(.st-nav button){box-shadow:inset 0 0 0 1px var(--line)}
  .sn :deep(.st-nav button.on){box-shadow:none}
  .sn :deep(.st-pane>.st-grid),.sn :deep(.st-block),.sn :deep(.st-provider),.sn :deep(.st-switch),.sn :deep(.st-facts),.sn :deep(.st-remote),.sn :deep(.st-alert){padding:20px 18px}
  .sn :deep(.st-grid){grid-template-columns:1fr}
  .sn :deep(.st-provider>header){grid-template-columns:auto minmax(0,1fr)}
  .sn :deep(.st-provider .st-state){grid-column:2}
  .sn :deep(.st-facts){grid-template-columns:1fr 1fr}
}
</style>
