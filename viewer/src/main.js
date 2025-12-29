import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

import '@fortawesome/fontawesome-free/css/all.min.css'
import './lib/uplot/dist/uPlot.min.css'
import 'notyf/notyf.min.css'
import './assets/styles/main.css'

// Apply theme on mount
const saved = localStorage.getItem('theme')
if (saved) {
  document.documentElement.setAttribute('data-theme', saved)
} else {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
}

// Listen for theme changes from other services
window.addEventListener('storage', (e) => {
  if (e.key === 'theme') {
    document.documentElement.setAttribute('data-theme', e.newValue || 'light')
  }
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

