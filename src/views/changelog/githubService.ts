import { Octokit } from "octokit";

const REPO_OWNER = "hnugreycrow";
const REPO_NAME = "MemoPaste";

/** 公开仓库；空 token 受未认证 API 限额约束，对本应用 changelog 够用 */
const octokit = new Octokit({ auth: "" });

export interface ChangelogItem {
  version: string;
  date: string;
  /** GitHub Release body（Markdown），页面直接渲染 */
  body: string;
}

function normalizeVersion(tag: string): string {
  return tag.startsWith("v") ? tag : `v${tag}`;
}

export async function fetchChangelog(): Promise<ChangelogItem[]> {
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      per_page: 20,
    });

    return response.data
      .filter((release) => !release.draft)
      .map((release) => {
        const version = normalizeVersion(release.tag_name);
        const rawDate = release.published_at || release.created_at;
        return {
          version,
          date: new Date(rawDate).toISOString().split("T")[0],
          body: (release.body || "").trim() || `_版本 ${version} 发布_`,
        };
      });
  } catch (error) {
    console.error("Failed to fetch releases:", error);
    return [];
  }
}
