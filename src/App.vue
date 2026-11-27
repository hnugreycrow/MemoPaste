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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
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
  background: var(--border-light);
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-medium);
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
  border-radius: 2px;
  padding: 0 1px;
}
</style>
