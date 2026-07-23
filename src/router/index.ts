import { createWebHashHistory, createRouter } from "vue-router";
import Layout from "@/layout/index.vue";

const routes = [
  // 快捷面板独立路由（无 Layout），由面板窗口加载 #/panel
  {
    path: "/panel",
    name: "Panel",
    component: () => import("@/views/panel/index.vue"),
    meta: {
      title: "快捷面板",
    },
  },
  {
    path: "/",
    component: Layout,
    children: [
      {
        path: "",
        redirect: "clipboard",
      },
      {
        path: "clipboard",
        name: "Clipboard",
        component: () => import("@/views/clipboard/index.vue"),
        meta: {
          title: "剪贴板",
          keepAlive: true,
        },
      },
      {
        path: "settings",
        name: "Settings",
        component: () => import("@/views/settings/index.vue"),
        meta: {
          title: "设置",
        },
      },
      {
        path: "changelog",
        name: "Changelog",
        component: () => import("@/views/changelog/index.vue"),
        meta: {
          title: "更新日志",
        },
      },
    ],
  },
];

// hash 模式便于 Electron 多窗口通过 URL hash 区分页面
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
