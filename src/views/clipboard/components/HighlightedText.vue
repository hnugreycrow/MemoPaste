<template>
  <div ref="rootRef" class="highlighted-text">
    <pre
      v-if="isCode && chunked"
      class="hljs code-block"
    ><code><span
        v-for="(html, i) in chunkHtml"
        :key="i"
        :data-idx="i"
        :ref="(el) => setChunkRef(el, i)"
        class="hl-chunk"
        v-html="html"
      ></span></code></pre>
    <pre
      v-else-if="isCode"
      class="hljs code-block"
    ><code v-html="highlightedCode"></code></pre>
    <div v-else class="plain-text" v-html="highlightedText"></div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import {
  hljs,
  acquireHljsTheme,
  releaseHljsTheme,
} from "@/utils/hljsSetup";

const props = defineProps<{
  content: string;
  type?: string; // 'text' | 'code' | ...
  search?: string | null; // optional search term to highlight in plain text
  language?: string | null; // optional language hint for code
}>();

const isCode = computed(() => props.type === "code");

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== 短内容：单次高亮（保留原行为） =====
const highlightedCode = computed(() => {
  const txt = props.content || "";
  try {
    if (!txt) return "";
    if (props.language) {
      return hljs.highlight(txt, {
        language: props.language,
        ignoreIllegals: true,
      }).value;
    }
    return hljs.highlightAuto(txt).value;
  } catch {
    return escapeHtml(txt);
  }
});

const highlightedText = computed(() => {
  const txt = props.content || "";
  if (!props.search) return escapeHtml(txt).replace(/\n/g, "<br/>");
  const escaped = escapeHtml(txt);
  const term = props.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(term, "gi");
  return escaped
    .replace(re, (m) => `<mark>${m}</mark>`)
    .replace(/\n/g, "<br/>");
});

// ===== 长内容：按视口分块高亮 =====
const CHUNK_THRESHOLD = 4000; // 超过此长度才启用切块
const CHUNK_LINES = 80; // 每块行数
const PER_CHUNK_MAX = 8000; // 单块字符数硬上限，超过则该块不高亮
const ROOT_MARGIN = "400px 400px"; // 视口外预热范围

const rootRef = ref<HTMLElement | null>(null);
const chunks = shallowRef<string[]>([]);
const chunkHtml = shallowRef<string[]>([]);
const chunkEls = new Map<number, HTMLElement>();
const highlighted = new Set<number>();
let observer: IntersectionObserver | null = null;

const chunked = computed(
  () => isCode.value && (props.content?.length ?? 0) > CHUNK_THRESHOLD,
);

function splitChunks(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    let chunk = lines.slice(i, i + CHUNK_LINES).join("\n");
    // 在块之间补回原始的换行，保证 <pre> 内拼接后行号不丢
    if (i + CHUNK_LINES < lines.length) chunk += "\n";
    out.push(chunk);
  }
  return out;
}

function highlightChunk(i: number) {
  if (highlighted.has(i)) return;
  const text = chunks.value[i];
  if (text == null) return;
  highlighted.add(i);

  let html: string;
  if (text.length > PER_CHUNK_MAX) {
    html = escapeHtml(text);
  } else {
    try {
      html = hljs.highlightAuto(text).value;
    } catch {
      html = escapeHtml(text);
    }
  }

  const next = chunkHtml.value.slice();
  next[i] = html;
  chunkHtml.value = next;
}

function findScrollRoot(start: HTMLElement | null): Element | null {
  let el: HTMLElement | null = start?.parentElement ?? null;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

function setChunkRef(el: unknown, i: number) {
  const node = el as HTMLElement | null;
  if (node) {
    chunkEls.set(i, node);
    if (observer) observer.observe(node);
  } else {
    const prev = chunkEls.get(i);
    if (prev && observer) observer.unobserve(prev);
    chunkEls.delete(i);
  }
}

function teardownObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

async function setupObserver() {
  teardownObserver();
  if (typeof IntersectionObserver === "undefined") {
    // 兜底：没有 IO 时一次性高亮全部块
    for (let i = 0; i < chunks.value.length; i++) highlightChunk(i);
    return;
  }
  // el-dialog 使用 destroy-on-close 重新挂载；等过渡走一帧再绑 observer，
  // 避免 scroll root 布局尚未稳定。
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  if (!chunked.value) return;
  const root = findScrollRoot(rootRef.value);
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const idxAttr = (e.target as HTMLElement).dataset.idx;
        if (idxAttr == null) continue;
        const i = Number(idxAttr);
        highlightChunk(i);
        observer?.unobserve(e.target);
      }
    },
    { root, rootMargin: ROOT_MARGIN, threshold: 0 },
  );
  for (const node of chunkEls.values()) observer.observe(node);
}

function rebuild() {
  teardownObserver();
  chunkEls.clear();
  highlighted.clear();
  if (!chunked.value) {
    chunks.value = [];
    chunkHtml.value = [];
    return;
  }
  const split = splitChunks(props.content || "");
  chunks.value = split;
  chunkHtml.value = split.map(escapeHtml);
  setupObserver();
}

onMounted(() => {
  acquireHljsTheme();
  rebuild();
});

watch(
  () => [props.content, props.language, props.type],
  () => rebuild(),
  { flush: "post" },
);

onUnmounted(() => {
  releaseHljsTheme();
  teardownObserver();
  chunkEls.clear();
  highlighted.clear();
});
</script>

<style scoped>
.plain-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
}
.code-block {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  border-radius: 6px;
  background: transparent;
  overflow: auto;
}
.hl-chunk {
  display: inline;
}
mark {
  background: rgba(255, 229, 100, 0.25);
  padding: 0 2px;
  border-radius: 2px;
}
</style>
