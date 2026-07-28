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
  /**
   * 获取所有发布的版本
   */
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
   * 通用解析函数：自动识别标题作为分类名
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

    // 跳过这些无关模式
    const skipPatterns = [
      /^##?\s*\[?.+\]?\s*\(.+\)$/, // ## [v1.0.0](link) 版本标题带链接
      /^##?\s*v?\d+\.\d+/, // ## v1.0.0 或 ## 1.0.0 版本号标题
      /^https?:\/\//, // URL
      /^compare:/i, // compare 链接
      /^\d{4}-\d{2}-\d{2}$/, // 单独的日期行
      /^[-—=]{3,}$/, // 分隔线
      /^\[.+\]\(.+\)$/, // 完整 Markdown 链接 [text](url)
      /^Released by/i, // Released by xxx
      /^Full Changelog/i, // Full Changelog
    ];

    // 识别标题行 - 更宽松的规则
    const isTitleLine = (line: string): boolean => {
      // 1. Markdown 标题（任意级别的 #）
      if (/^#+\s+.+/.test(line)) return true;

      // 2. 加粗文本 **标题** 或 **标题：**
      if (/^\*\*[^*]+\*\*[:：]?\s*$/.test(line)) return true;

      // 3. 方括号标题 【标题】 或 [标题]
      if (/^[【[].+[\]】][:：]?\s*$/.test(line)) return true;

      // 4. 短文本后跟冒号（2-20个字符）
      if (/^.{2,20}[:：]\s*$/.test(line)) return true;

      // 5. 看起来像标题的独立短行（非列表项，2-15个字符，不含标点结尾）
      if (
        line.length >= 2 &&
        line.length <= 15 &&
        !/^[-*+•▪]/.test(line) && // 不是列表项
        !/[。！？.!?]$/.test(line) && // 不以句号结尾
        !/^https?:/.test(line) // 不是链接
      ) {
        return true;
      }

      return false;
    };

    // 提取标题名称
    const extractTitle = (line: string): string => {
      let title = line;
      // 移除 Markdown 标题标记
      title = title.replace(/^##+\s*/, "");
      // 移除加粗标记
      title = title.replace(/^\*\*|\*\*$/g, "");
      // 移除方括号/方框
      title = title.replace(/^[【[]|[】]]$/g, "");
      // 移除末尾冒号
      title = title.replace(/[:：]$/, "");
      return title.trim() || "其他";
    };

    let currentCategory: { name: string; items: string[] } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // 跳过无关行
      if (skipPatterns.some((pattern) => pattern.test(line))) {
        continue;
      }

      // 检查是否是标题行
      if (isTitleLine(line)) {
        const titleName = extractTitle(line);

        // 保存上一个分类
        if (currentCategory && currentCategory.items.length > 0) {
          categories.push(currentCategory);
        }

        // 创建新分类
        currentCategory = {
          name: titleName,
          items: [],
        };
        continue;
      }

      // 匹配列表项（支持 - * + • ▪ 等多种符号）
      const itemMatch = line.match(/^[-*+•▪]\s+(.+)$/);
      if (itemMatch && currentCategory) {
        currentCategory.items.push(itemMatch[1].trim());
        continue;
      }

      // 如果不是列表项，但有活动分类且内容有意义，也加入
      if (currentCategory && line.length > 3 && !line.startsWith("v1.")) {
        currentCategory.items.push(line);
      }
    }

    // 保存最后一个分类
    if (currentCategory && currentCategory.items.length > 0) {
      categories.push(currentCategory);
    }

    // 如果没有解析到任何内容，返回默认
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

  /**
   * 转换为新的 ChangelogItem 格式
   */
  static convertToChangelogFormat(releases: any[]): ChangelogItem[] {
    return releases.map((release) => ({
      version: release.tag_name.startsWith("v") ? release.tag_name : `v${release.tag_name}`,
      date: new Date(release.published_at || release.created_at).toISOString().split("T")[0], // 格式化为 YYYY-MM-DD
      categories: this.parseReleaseBody(release.body || "", release.tag_name),
    }));
  }

  /**
   * 获取更新日志数据（新格式）
   */
  static async getChangelogData(): Promise<ChangelogItem[]> {
    try {
      const releases = await this.getReleases();
      return this.convertToChangelogFormat(releases);
    } catch (error) {
      console.error("Failed to get changelog data:", error);
      return [];
    }
  }

  /**
   * 生成 TypeScript 代码字符串
   */
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
