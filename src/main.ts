import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
// 引入Element Plus的深色主题变量
import 'element-plus/theme-chalk/dark/css-vars.css'


const app = createApp(App)
const pinia = createPinia()
app.use(router)
app.use(pinia)
app.mount('#app')
