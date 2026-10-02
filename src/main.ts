import { createApp } from "vue";
import { themeService } from "./utils/theme";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import "element-plus/theme-chalk/dark/css-vars.css";

const app = createApp(App);
const pinia = createPinia();
app.use(router);
app.use(pinia);
async function bootstrap() {
  const role = await window.windowControls.getRole().catch(() => "main");
  if (role === "panel") {
    document.documentElement.classList.add("is-panel");
    document.body.classList.add("is-panel");
  }
  await themeService.initTheme();
  app.mount("#app");
}
void bootstrap();
