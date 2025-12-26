import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import DataViewer from '../views/DataViewer.vue'
import DeviceConfig from '../views/DeviceConfig.vue'

const routes = [
  { path: '/', name: 'viewer', component: DataViewer },
  { path: '/config', name: 'config', component: DeviceConfig }
]

const single = import.meta.env.MODE === 'single'

const router = createRouter({
  history: single
    ? createWebHashHistory()
    : createWebHistory(),
  routes
})

export default router
