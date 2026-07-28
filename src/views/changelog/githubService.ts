import { Octokit } from "octokit";

const REPO_OWNER = "hnugreycrow";
const REPO_NAME = "MemoPaste";
const octokit = new Octokit({ auth: "" });

export interface ChangelogItem {
  version: string;
  date: string;
  categories: {
    name: string;
    items: string[];
  }[];
}

export class GitHubService {
  static async getReleases(): Promise<any[]> {
    try {
      const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
        owner: REPO_OWNER,
        repo: REPO_NAME,
        per_page: 20,
      });
      return response.data.filter((release: any) => !release.draft);
    } catch (error) {
      console.error("Failed to fetch releases:", error);
      return [];
    }
  }

  /**
   * Release body 没有统一格式：用启发式把标题行当成分类，其余行归入条目。
   * 宁可多收一点正文，也不要丢更新说明。
   */
  static parseReleaseBody(body: string, version: string): { name: string; items: string[] }[] {
    if (!body || !body.trim()) {
      return [{ name: "发布", items: [`版本 ${version} 发布`] }];
    }

    const categories: { name: string; items: string[] }[] = [];
    const lines = body
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line);

    // 版本号/对比链接/日期等噪声行，不当成变更内容
    const skipPatterns = [
      /^##?\s*\[?.+\]?\s*\(.+\)$/,
      /^##?\s*v?\d+\.\d+/,
      /^https?:\/\//,
      /^compare:/i,
      /^\d{4}-\d{2}-\d{2}$/,
      /^[-—=]{3,}$/,
      /^\[.+\]\(.+\)$/,
      /^Released by/i,
      /^Full Changelog/i,
    ];

    const isTitleLine = (line: string): boolean => {
      if (/^#+\s+.+/.test(line)) return true;
      if (/^\*\*[^*]+\*\*[:：]?\s*$/.test(line)) return true;
      if (/^[【[].+[\]】][:：]?\s*$/.test(line)) return true;
      if (/^.{2,20}[:：]\s*$/.test(line)) return true;
      if (
        line.length >= 2 &&
        line.length <= 15 &&
        !/^[-*+•▪]/.test(line) &&
        !/[。！？.!?]$/.test(line) &&
        !/^https?:/.test(line)
      ) {
        return true;
      }
      return false;
    };

    const extractTitle = (line: string): string => {
      let title = line;
      title = title.replace(/^##+\s*/, "");
      title = title.replace(/^\*\*|\*\*$/g, "");
      title = title.replace(/^[【[]|[】]]$/g, "");
      title = title.replace(/[:：]$/, "");
      return title.trim() || "其他";
    };

    let currentCategory: { name: string; items: string[] } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (skipPatterns.some((pattern) => pattern.test(line))) {
        continue;
      }

      if (isTitleLine(line)) {
        const titleName = extractTitle(line);

        if (currentCategory && currentCategory.items.length > 0) {
          categories.push(currentCategory);
        }

        currentCategory = {
          name: titleName,
          items: [],
        };
        continue;
      }

      const itemMatch = line.match(/^[-*+•▪]\s+(.+)$/);
      if (itemMatch && currentCategory) {
        currentCategory.items.push(itemMatch[1].trim());
        continue;
      }

      // 非列表但有意义的正文也收进当前分类（很多 Release 不用 bullet）
      if (currentCategory && line.length > 3 && !line.startsWith("v1.")) {
        currentCategory.items.push(line);
      }
    }

    if (currentCategory && currentCategory.items.length > 0) {
      categories.push(currentCategory);
    }

    if (categories.length === 0) {
      const meaningfulLines = lines.filter(
        (line) => line.length > 3 && !skipPatterns.some((p) => p.test(line)),
      );
      if (meaningfulLines.length > 0) {
        return [{ name: "更新内容", items: meaningfulLines }];
      }
      return [{ name: "其他", items: [`版本 ${version} 发布`] }];
    }

    return categories;
  }

  static convertToChangelogFormat(releases: any[]): ChangelogItem[] {
    return releases.map((release) => ({
      version: release.tag_name.startsWith("v") ? release.tag_name : `v${release.tag_name}`,
      date: new Date(release.published_at || release.created_at).toISOString().split("T")[0],
      categories: this.parseReleaseBody(release.body || "", release.tag_name),
    }));
  }

  static async getChangelogData(): Promise<ChangelogItem[]> {
    try {
      const releases = await this.getReleases();
      return this.convertToChangelogFormat(releases);
    } catch (error) {
      console.error("Failed to get changelog data:", error);
      return [];
    }
  }

  static async generateChangelogDataCode(): Promise<string> {
    const data = await this.getChangelogData();

    const code = `export interface ChangelogItem {
  version: string;
  date: string;
  categories: {
    name: string;
    items: string[];
  }[];
}

export const changelogData: ChangelogItem[] = ${JSON.stringify(data, null, 2)};
`;

    return code;
  }
}
