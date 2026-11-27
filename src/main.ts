import { createApp } from "vue";
import { createPinia } from "pinia";
import { themeService } from "./utils/theme";
import App from "./App.vue";

const app = createApp(App);
app.use(createPinia());

async function bootstrap() {
  await themeService.initTheme();
  app.mount("#app");
}

void bootstrap();
