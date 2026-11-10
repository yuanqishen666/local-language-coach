import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-sc'
import './styles/base.css'
import './styles/mobile-fixes.css'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
