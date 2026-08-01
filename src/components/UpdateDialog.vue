<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ArrowRight, Download, Check } from "@element-plus/icons-vue";
import { APP_ICON_URL } from "@/constants/assets";

const updateAvailable = ref<boolean>(false);
const updateInfo = ref<any>(null);
const updateProgress = ref<number>(0);
const isDownloading = ref<boolean>(false);
const updateDownloaded = ref<boolean>(false);
const showDialog = ref<boolean>(false);
const currentVersion = ref<string>("1.0.0");

let removeUpdateListener: (() => void) | null = null;

onMounted(async () => {
  try {
    const version = await window.app.getVersion();
    if (version) currentVersion.value = version;
  } catch (error) {
    console.error("获取应用版本失败:", error);
  }

  removeUpdateListener = window.updater.onUpdateStatus((status) => {
    if (status.status === "update-available") {
      updateAvailable.value = true;
      updateInfo.value = status.data;
      if (updateInfo.value) {
        updateInfo.value.currentVersion = currentVersion.value;
      }
      showDialog.value = true;
    } else if (status.status === "update-not-available") {
      updateAvailable.value = false;
    } else if (status.status === "download-progress") {
      isDownloading.value = true;
      updateProgress.value = Math.round(status.data.percent || 0);
    } else if (status.status === "update-downloaded") {
      isDownloading.value = false;
      updateDownloaded.value = true;
    } else if (status.status === "error") {
      isDownloading.value = false;
      ElMessage.error("更新失败: " + (status.data.message?.substring(0, 100) || "未知错误"));
    }
  });
});

onUnmounted(() => {
  if (removeUpdateListener) removeUpdateListener();
});

const downloadUpdate = async () => {
  try {
    isDownloading.value = true;
    await window.updater.downloadUpdate();
  } catch (error) {
    isDownloading.value = false;
    ElMessage.error("下载更新失败: " + error);
  }
};

const installUpdate = async () => {
  try {
    await window.updater.installUpdate();
  } catch (error) {
    ElMessage.error("安装更新失败: " + error);
  }
};

const remindLater = () => {
  showDialog.value = false;
};
</script>

<template>
  <el-dialog
    v-model="showDialog"
    width="420px"
    :close-on-click-modal="false"
    class="update-dialog"
    top="15vh"
  >
    <div class="update-body">
      <div class="update-head">
        <div class="title-block">
          <p class="eyebrow">有可用更新</p>
          <h2 class="main-title">v{{ updateInfo?.version || "–" }} 已发布</h2>
        </div>
        <div class="app-icon">
          <img :src="APP_ICON_URL" alt="App icon" />
        </div>
      </div>

      <div class="version-row">
        <div class="version-cell">
          <span class="v-label">当前版本</span>
          <span class="v-num">v{{ updateInfo?.currentVersion || currentVersion }}</span>
        </div>
        <el-icon class="v-arrow"><ArrowRight /></el-icon>
        <div class="version-cell">
          <span class="v-label">最新版本</span>
          <span class="v-num new">v{{ updateInfo?.version || "–" }}</span>
        </div>
      </div>

      <div v-if="updateInfo?.releaseNotes" class="release-notes">
        <p class="notes-title">更新内容</p>
        <div class="notes-body" v-html="updateInfo.releaseNotes" />
      </div>

      <div v-if="isDownloading" class="progress-area">
        <div class="progress-header">
          <span class="progress-label">正在下载更新</span>
          <span class="progress-pct">{{ updateProgress }}%</span>
        </div>
        <el-progress
          :percentage="updateProgress"
          :show-text="false"
          :stroke-width="6"
          striped
          striped-flow
          :duration="10"
        />
      </div>

      <div class="actions">
        <template v-if="!isDownloading && !updateDownloaded">
          <el-button type="primary" size="large" style="width: 100%" @click="downloadUpdate">
            <el-icon><Download /></el-icon>
            立即下载安装
          </el-button>
          <el-button size="large" style="width: 100%; margin-left: 0" text @click="remindLater">
            稍后提醒
          </el-button>
        </template>

        <template v-if="isDownloading">
          <el-button type="primary" size="large" style="width: 100%" disabled>
            正在下载中…
          </el-button>
        </template>

        <template v-if="updateDownloaded">
          <el-button type="success" size="large" style="width: 100%" @click="installUpdate">
            <el-icon><Check /></el-icon>
            立即安装并重启
          </el-button>
          <el-button size="large" style="width: 100%; margin-left: 0" text @click="remindLater">
            稍后安装
          </el-button>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<style lang="scss" scoped>
.update-body {
  position: relative;
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.update-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.main-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  img {
    width: 50px;
    height: 50px;
    border-radius: 10px;
    object-fit: cover;
  }
}

.version-row {
  display: flex;
  align-items: center;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 12px 16px;
}

.version-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.v-label {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.v-num {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;

  &.new {
    color: var(--text-primary);
    font-weight: 600;
  }
}

.v-arrow {
  color: var(--el-border-color);
  font-size: 16px;
  margin: 0 4px;
}

.release-notes {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 12px 14px;
}

.notes-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.notes-body {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  max-height: 30vh; // 使用视口高度单位
  overflow-y: auto;

  :deep(ul) {
    margin: 0;
    padding-left: 16px;

    li + li {
      margin-top: 4px;
    }
  }

  :deep(p) {
    margin: 0 0 6px;

    &:last-child {
      margin: 0;
    }
  }
}

.progress-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.progress-pct {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}
</style>
