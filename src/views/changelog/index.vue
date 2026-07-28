<script setup lang="ts">
import { onMounted, ref } from "vue";
import { marked } from "marked";
import { fetchChangelog, type ChangelogItem } from "./githubService";

const changelog = ref<ChangelogItem[] | null>(null);

marked.setOptions({
  gfm: true,
  breaks: true,
});

function renderBody(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

/** Markdown 链接在 Electron 里不要走应用内导航 */
function onReleaseBodyClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
  event.preventDefault();
  void window.shell.openExternal(anchor.href);
}

const loadChangelog = async () => {
  try {
    const data = await fetchChangelog();
    changelog.value = data.length > 0 ? data : [];
  } catch (error) {
    console.error("获取更新日志失败:", error);
    changelog.value = [];
  }
};

onMounted(() => {
  void loadChangelog();
});
</script>

<template>
  <div class="changelog-container">
    <h1 class="changelog-title">更新日志</h1>
    <el-skeleton v-if="changelog === null" :rows="5" animated />
    <el-empty v-else-if="changelog.length === 0" description="暂无更新日志" />
    <el-timeline v-else>
      <el-timeline-item
        v-for="(release, index) in changelog"
        :key="release.version"
        :timestamp="release.date"
        placement="top"
        :type="index === 0 ? 'primary' : ''"
      >
        <el-card class="changelog-card">
          <div class="version-header">
            <h3>{{ release.version }}</h3>
            <el-tag v-if="index === 0" type="success" size="small">最新</el-tag>
          </div>
          <div
            class="release-body"
            v-html="renderBody(release.body)"
            @click="onReleaseBodyClick"
          />
        </el-card>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<style lang="scss" scoped>
.changelog-container {
  padding: 10px 20px;
  margin: 0 10px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  flex-direction: column;
}

.changelog-title {
  margin-bottom: 24px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.changelog-card {
  margin-bottom: 10px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-light);
}

.version-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;

  h3 {
    margin: 0;
    margin-right: 10px;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.release-body {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.35;
  }

  :deep(h1) {
    font-size: 1.25em;
  }
  :deep(h2) {
    font-size: 1.15em;
  }
  :deep(h3),
  :deep(h4) {
    font-size: 1.05em;
  }

  :deep(p) {
    margin: 0.5em 0;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.5em 0;
    padding-left: 1.4em;
  }

  :deep(li) {
    margin-bottom: 0.35em;
  }

  :deep(a) {
    color: var(--el-color-primary);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: var(--bg-tertiary);
  }

  :deep(pre) {
    margin: 0.75em 0;
    padding: 10px 12px;
    overflow-x: auto;
    border-radius: 8px;
    background: var(--bg-tertiary);

    code {
      padding: 0;
      background: transparent;
    }
  }

  :deep(hr) {
    margin: 1em 0;
    border: none;
    border-top: 1px solid var(--border-light);
  }

  :deep(blockquote) {
    margin: 0.75em 0;
    padding-left: 0.9em;
    border-left: 3px solid var(--border-light);
    color: var(--text-secondary);
  }
}
</style>
