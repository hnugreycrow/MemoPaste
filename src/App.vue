<script setup lang="ts">
import PanelView from "./views/panel/index.vue";
</script>

<template>
  <PanelView />
</template>

<style>
@import "./styles/themes.css";
@import "./styles/type-badges.css";

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
  font-family:
    "Segoe UI Variable",
    "Segoe UI",
    -apple-system,
    BlinkMacSystemFont,
    "PingFang SC",
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--text-primary);
}

#app {
  display: flex;
  flex-direction: column;
}

* {
  box-sizing: border-box;
}

::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-medium);
  border-radius: 999px;
  transition: background-color 0.2s ease;
}

button {
  font-family: inherit;
}

button:focus {
  outline: none;
}

button:focus-visible {
  outline: 1.5px solid var(--accent-primary);
  outline-offset: -1px;
}

mark {
  background: var(--search-mark-bg);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
}
</style>
