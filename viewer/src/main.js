import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

import '@fortawesome/fontawesome-free/css/all.min.css'
import '../lib/uplot/dist/uPlot.min.css'
import 'notyf/notyf.min.css'
import './assets/styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

