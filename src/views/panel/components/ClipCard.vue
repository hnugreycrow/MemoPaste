<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { searchParts } from "@shared/search";
import type { ClipboardItem } from "@/utils/type";
import { clipimgUrl, formatCompactTime, formatTime, getTypeLabel } from "@/utils/utils";

const props = defineProps<{
  item: ClipboardItem;
  index: number;
  focused: boolean;
  altActive?: boolean;
  keyword: string;
  editingAlias: boolean;
  now: Date;
}>();

const emit = defineEmits<{
  paste: [item: ClipboardItem];
  focus: [index: number];
  favorite: [item: ClipboardItem, event: Event];
  delete: [item: ClipboardItem, event: Event];
  preview: [item: ClipboardItem, event: Event];
  startEditAlias: [item: ClipboardItem, event: Event];
  commitAlias: [item: ClipboardItem, alias: string];
  cancelAlias: [];
  openMenu: [item: ClipboardItem, event: MouseEvent];
}>();

const aliasDraft = ref("");
const aliasInputRef = ref<HTMLInputElement | null>(null);
let ignoreNextBlur = false;

watch(
  () => props.editingAlias,
  async (editing) => {
    if (editing) {
      ignoreNextBlur = false;
      aliasDraft.value = props.item.alias ?? "";
      await nextTick();
      aliasInputRef.value?.focus();
      aliasInputRef.value?.select();
    }
  },
  { immediate: true },
);

const isImage = computed(() => props.item.type === "image");
const hasAlias = computed(() => !!props.item.alias?.trim());
const shortcutDigit = computed(() => (props.index < 9 ? props.index + 1 : null));
const showTypeBadge = computed(() => props.item.type === "url" || props.item.type === "code");

const previewText = computed(() => {
  const raw = props.item.searchPreview || props.item.content || "";
  return raw.replace(/\s+/g, " ").trim() || "空白内容";
});

const imageDim = computed(() => props.item.content.replace(/^图片\s*/, "").trim());

const imageFormat = computed(() => {
  const path = props.item.file_path || props.item.thumb_path || "";
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toUpperCase() : "PNG";
});

const imagePrimaryText = computed(() => imageDim.value || imageFormat.value);

const imageSubText = computed(() => {
  const parts = hasAlias.value
    ? [imageFormat.value, imageDim.value, props.item.size]
    : [imageDim.value ? imageFormat.value : "", props.item.size];
  return parts.filter(Boolean).join(" · ");
});

const compactTime = computed(() => formatCompactTime(props.item.timestamp, props.now));
const fullTime = computed(() => formatTime(props.item.timestamp));

const aliasParts = computed(() =>
  props.item.alias ? searchParts(props.item.alias, props.keyword) : [],
);

const contentParts = computed(() => searchParts(previewText.value, props.keyword));

const confirmAlias = () => {
  ignoreNextBlur = true;
  emit("commitAlias", props.item, aliasDraft.value);
};

const cancelAliasEdit = () => {
  ignoreNextBlur = true;
  emit("cancelAlias");
};

const handleAliasBlur = () => {
  if (ignoreNextBlur) {
    ignoreNextBlur = false;
    return;
  }
  emit("commitAlias", props.item, aliasDraft.value);
};

const handleAliasKeydown = (e: KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === "Enter") {
    e.preventDefault();
    confirmAlias();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelAliasEdit();
  }
};

const handleCardClick = () => {
  if (props.editingAlias) return;
  emit("paste", props.item);
};

const handleContextMenu = (e: MouseEvent) => {
  if (props.editingAlias) return;
  emit("focus", props.index);
  emit("openMenu", props.item, e);
};
</script>

<template>
  <article
    class="clip-card"
    :class="{
      focused,
      favorite: item.is_favorite,
      'is-image': isImage,
      'is-editing': editingAlias,
    }"
    :data-index="index"
    :data-id="item.id"
    role="option"
    :aria-selected="focused"
    @click="handleCardClick"
    @contextmenu.prevent="handleContextMenu"
    @mouseenter="emit('focus', index)"
  >
    <div class="card-slot">
      <span
        v-if="shortcutDigit !== null"
        class="slot-num"
        :class="{ 'alt-active': altActive }"
        :title="`Alt + ${shortcutDigit} 直接粘贴`"
      >
        {{ shortcutDigit }}
      </span>
      <span v-else class="slot-dot" aria-hidden="true" />
    </div>

    <div v-if="isImage" class="card-thumb">
      <img
        v-if="item.thumb_path"
        class="thumb-img"
        :src="clipimgUrl(item.thumb_path)"
        alt=""
        draggable="false"
      />
      <i-ep-Picture v-else class="thumb-fallback" />
    </div>

    <div class="card-body">
      <div v-if="editingAlias" class="alias-editor" @click.stop>
        <input
          ref="aliasInputRef"
          v-model="aliasDraft"
          class="alias-input"
          type="text"
          maxlength="60"
          placeholder="输入常用备注名，留空可清除…"
          aria-label="编辑备注名"
          @keydown="handleAliasKeydown"
          @blur="handleAliasBlur"
        />
        <button
          type="button"
          class="alias-btn confirm"
          title="保存 (Enter)"
          aria-label="保存备注"
          @mousedown.prevent
          @click.stop="confirmAlias"
        >
          <i-ep-Check />
        </button>
        <button
          type="button"
          class="alias-btn"
          title="取消 (Esc)"
          aria-label="取消编辑"
          @mousedown.prevent
          @click.stop="cancelAliasEdit"
        >
          <i-ep-Close />
        </button>
      </div>

      <template v-else>
        <div v-if="hasAlias" class="card-alias" :title="item.alias ?? undefined">
          <span class="alias-pin" aria-hidden="true" />
          <span class="alias-label">
            <template v-for="(part, idx) in aliasParts" :key="`a-${idx}`">
              <mark v-if="part.match">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </span>
        </div>

        <div v-if="isImage" class="card-image-info">
          <span v-if="!hasAlias" class="image-primary">{{ imagePrimaryText }}</span>
          <span v-if="imageSubText" class="image-sub">{{ imageSubText }}</span>
        </div>

        <p
          v-else
          class="card-text"
          :class="{ 'single-line': hasAlias, 'is-code': item.type === 'code' }"
        >
          <template v-for="(part, idx) in contentParts" :key="`c-${idx}`">
            <mark v-if="part.match">{{ part.text }}</mark>
            <span v-else>{{ part.text }}</span>
          </template>
        </p>
      </template>
    </div>

    <div v-if="!editingAlias" class="card-meta">
      <span v-if="showTypeBadge" class="type-pill" :class="`type-${item.type}`">
        {{ getTypeLabel(item.type) }}
      </span>
      <i-ep-StarFilled v-if="item.is_favorite" class="fav-dot" aria-label="常用收藏" />
      <time class="card-time" :title="fullTime">{{ compactTime }}</time>
    </div>

    <div v-if="!editingAlias" class="card-actions" @click.stop>
      <button
        type="button"
        class="action-icon"
        title="预览全文 (Space)"
        aria-label="预览全文"
        @click="emit('preview', item, $event)"
      >
        <i-ep-View />
      </button>
      <button
        type="button"
        class="action-icon"
        :class="{ active: hasAlias }"
        title="编辑备注 (F2)"
        aria-label="编辑备注"
        @click="emit('startEditAlias', item, $event)"
      >
        <i-ep-EditPen />
      </button>
      <button
        type="button"
        class="action-icon fav"
        :class="{ active: item.is_favorite }"
        :title="item.is_favorite ? '取消常用收藏' : '加入常用收藏'"
        :aria-label="item.is_favorite ? '取消常用收藏' : '加入常用收藏'"
        @click="emit('favorite', item, $event)"
      >
        <i-ep-StarFilled v-if="item.is_favorite" />
        <i-ep-Star v-else />
      </button>
      <button
        type="button"
        class="action-icon danger"
        title="删除 (Shift+Delete)"
        aria-label="删除"
        @click="emit('delete', item, $event)"
      >
        <i-ep-Delete />
      </button>
      <button
        type="button"
        class="action-icon"
        title="更多操作 (右键)"
        aria-label="更多操作"
        @click="emit('openMenu', item, $event)"
      >
        <i-ep-MoreFilled />
      </button>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.clip-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 52px;
  padding: 8px 10px 8px 9px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    transform 0.12s var(--ease-out);

  &::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 999px;
    background: var(--accent-primary);
    box-shadow: var(--focus-bar-glow);
    opacity: 0;
    transform: scaleY(0.25);
    transition:
      opacity 0.14s ease,
      transform 0.22s var(--ease-spring);
  }

  &:hover {
    background: var(--bg-hover);
  }

  &:active:not(.is-editing) {
    transform: scale(0.99);
  }

  &.focused {
    background: var(--bg-active);
    border-color: var(--border-selected);

    &::before {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  &.is-editing {
    cursor: default;
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }
}

.card-slot {
  width: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--bg-secondary);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  line-height: 1;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    transform 0.14s var(--ease-spring),
    box-shadow 0.14s ease;

  .clip-card.focused & {
    background: var(--accent-soft);
    color: var(--accent-primary);
  }

  &.alt-active,
  .clip-card.focused &.alt-active {
    background: var(--accent-primary);
    color: var(--accent-on-primary, #fff);
    font-weight: 600;
    transform: scale(1.08);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--accent-primary) 35%, transparent);
  }
}

.slot-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-medium);
}

.card-thumb {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;

  /* 伪元素覆盖在 img 之上，确保白底截图在浅/深色模式下均有清晰边界 */
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--thumb-ring, var(--border-light));
    pointer-events: none;
  }
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-fallback {
  font-size: 16px;
  color: var(--text-tertiary);
}

.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-alias {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--favorite-text);
  min-width: 0;
}

.alias-pin {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--favorite-border);
  flex-shrink: 0;
}

.alias-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;

  &.single-line {
    -webkit-line-clamp: 1;
    font-size: 12px;
    color: var(--text-secondary);
  }

  &.is-code {
    font-family: "Cascadia Mono", Consolas, ui-monospace, monospace;
    font-size: 12px;
  }
}

.card-image-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.image-primary {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-sub {
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alias-editor {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.alias-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid var(--accent-primary);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
  }
}

.alias-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.confirm {
    background: var(--accent-primary);
    color: var(--accent-on-primary, #fff);
  }
}

.card-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-tertiary);
  font-size: 11px;
  white-space: nowrap;
  transition: opacity 0.12s ease;
}

.type-pill {
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
}

.fav-dot {
  font-size: 12px;
  color: var(--favorite-border);
}

.card-time {
  font-variant-numeric: tabular-nums;
}

/* 悬浮操作胶囊：绝对定位不挤压正文宽度，带轻柔滑入与渐显 */
.card-actions {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translate(5px, -50%);
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-seg-active);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-seg);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.14s var(--ease-out),
    transform 0.18s var(--ease-out);
}

.clip-card:hover .card-meta,
.clip-card.focused .card-meta {
  opacity: 0;
}

.clip-card:hover .card-actions,
.clip-card.focused .card-actions {
  opacity: 1;
  transform: translate(0, -50%);
  pointer-events: auto;
}

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    transform 0.14s var(--ease-spring);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:active {
    transform: scale(0.88);
  }

  &.active {
    color: var(--accent-primary);
  }

  &.fav.active {
    color: var(--favorite-border);
    animation: star-pop 0.3s var(--ease-spring);
  }

  &.fav:hover {
    color: var(--favorite-border);
  }

  &.danger:hover {
    background: color-mix(in srgb, var(--accent-danger) 12%, transparent);
    color: var(--accent-danger);
  }
}

@keyframes star-pop {
  0% {
    transform: scale(0.75);
  }
  55% {
    transform: scale(1.24);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .clip-card,
  .clip-card::before,
  .card-actions,
  .action-icon {
    transition: none;
    animation: none;
  }
}
</style>
