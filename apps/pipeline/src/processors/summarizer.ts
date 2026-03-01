import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ProcessedArticle, RawArticle } from "../types/index.js";

const CATEGORY_CONTEXT: Record<string, string> = {
  tesla: "Tesla 전기차, 에너지 사업, FSD 자율주행, 주가/투자",
  spacex: "SpaceX 로켓 발사, Starship, Starlink 위성, 우주 탐사",
  xai: "xAI, Grok AI, Elon Musk의 AI 사업",
};

async function summarizeOne(article: RawArticle, model: GenerativeModel): Promise<ProcessedArticle> {
  const context = CATEGORY_CONTEXT[article.category];

  const prompt = `당신은 ${context} 분야의 전문 한국어 에디터입니다.
아래 영어 기사를 분석해서 JSON 형식으로 응답해주세요.

기사 제목: ${article.title}
기사 내용: ${article.content}
출처: ${article.source}

다음 형식으로 응답하세요 (JSON만, 다른 텍스트 없이):
{
  "titleKo": "한국어 제목 (자연스럽게 번역)",
  "summaryKo": "핵심 내용을 3줄로 요약. 투자자/팬 관점에서 중요한 포인트 위주.",
  "importance": "high|medium|low"
}

importance 기준:
- high: 주가 영향, 제품 출시, 주요 발표, 사고/리콜
- medium: 일반 업데이트, 파트너십, 인터뷰
- low: 루머, 의견, 반복 내용`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim()
      .replace(/^```json\s*/i, '').replace(/```\s*$/, '')

    const parsed = JSON.parse(text) as {
      titleKo: string;
      summaryKo: string;
      importance: "high" | "medium" | "low";
    };

    return { ...article, titleKo: parsed.titleKo, summaryKo: parsed.summaryKo, importance: parsed.importance };
  } catch {
    return { ...article, titleKo: article.title, summaryKo: article.content.slice(0, 150), importance: "low" };
  }
}

export async function summarizeArticles(
  articles: RawArticle[],
  concurrency = 3,
): Promise<ProcessedArticle[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
  const results: ProcessedArticle[] = [];

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);
    const processed = await Promise.all(batch.map((a) => summarizeOne(a, model)));
    results.push(...processed);
    console.log(`  [AI] ${Math.min(i + concurrency, articles.length)}/${articles.length} 처리 완료`);
  }

  return results;
}
