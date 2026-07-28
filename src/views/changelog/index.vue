<script setup lang="ts">
import { onMounted, ref } from "vue";
import { GitHubService } from "./githubService";

const changelog = ref();

// 异步获取最新的 changelog 数据
const fetchChangelog = async () => {
  try {
    const data = await GitHubService.getChangelogData();
    if (data && data.length > 0) {
      changelog.value = data;
    }
  } catch (error) {
    console.error("获取更新日志失败:", error);
  }
};

onMounted(() => {
  fetchChangelog();
});
</script>

<template>
  <div class="changelog-container">
    <h1 class="changelog-title">更新日志</h1>
    <el-timeline>
      <el-timeline-item
        v-for="(release, index) in changelog"
        :key="index"
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
            v-for="(category, catIndex) in release.categories"
            :key="catIndex"
            class="category-section"
          >
            <h4 class="category-title">{{ category.name }}</h4>
            <ul class="change-list">
              <li v-for="(item, itemIndex) in category.items" :key="itemIndex">
                {{ item }}
              </li>
            </ul>
          </div>
        </el-card>
      </el-timeline-item>
    </el-timeline>
    <el-skeleton v-if="!changelog" :rows="5" animated />
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

.category-section {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.category-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.change-list {
  margin: 0;
  padding-left: 20px;

  li {
    margin-bottom: 6px;
    color: var(--text-secondary);

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
