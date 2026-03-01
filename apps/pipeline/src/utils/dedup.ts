import type { RawArticle } from "../types/index.js";

// 제목 기반 중복 제거 (같은 뉴스가 여러 소스에서 들어올 수 있음)
export function deduplicateArticles(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    // id 기준 중복 제거
    if (seen.has(article.id)) return false;
    seen.add(article.id);

    // 제목 유사도 기반 중복 제거 (앞 30자 기준)
    const titleKey = article.title.toLowerCase().slice(0, 30);
    if (seen.has(titleKey)) return false;
    seen.add(titleKey);

    return true;
  });
}

// 최근 N일 이내 기사만 필터
export function filterRecent(articles: RawArticle[], days = 7): RawArticle[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return articles.filter((a) => a.publishedAt >= cutoff);
}
