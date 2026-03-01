import type { RawArticle } from "../types/index.js";

// Tesla CIK (SEC 고유 식별자)
const TESLA_CIK = "0001318605";

interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
}

interface SecFilingsResponse {
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

// 중요 공시 유형만 수집
const IMPORTANT_FORMS = ["8-K", "10-Q", "10-K", "DEF 14A"];

export async function collectSecFilings(limit = 5): Promise<RawArticle[]> {
  const articles: RawArticle[] = [];

  try {
    const res = await fetch(
      `https://data.sec.gov/submissions/CIK${TESLA_CIK}.json`,
      {
        headers: {
          "User-Agent": "elon-pipeline contact@example.com",
        },
      }
    );

    if (!res.ok) throw new Error(`SEC API HTTP ${res.status}`);

    const data = (await res.json()) as SecFilingsResponse;
    const recent = data.filings.recent;

    const filings: SecFiling[] = recent.accessionNumber
      .map((acc, i) => ({
        accessionNumber: acc,
        filingDate: recent.filingDate[i] ?? "",
        form: recent.form[i] ?? "",
        primaryDocument: recent.primaryDocument[i] ?? "",
        primaryDocDescription: recent.primaryDocDescription[i] ?? "",
      }))
      .filter((f) => IMPORTANT_FORMS.includes(f.form))
      .slice(0, limit);

    for (const filing of filings) {
      const accNoFormatted = filing.accessionNumber.replace(/-/g, "");
      const edgarUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(TESLA_CIK)}/${accNoFormatted}/${filing.primaryDocument}`;

      articles.push({
        id: `sec-${filing.accessionNumber}`,
        title: `Tesla ${filing.form} 공시 (${filing.filingDate})`,
        content: filing.primaryDocDescription,
        url: edgarUrl,
        source: "SEC EDGAR",
        category: "tesla",
        publishedAt: new Date(filing.filingDate),
      });
    }

    console.log(`[SEC] Tesla 공시 ${articles.length}건 수집`);
  } catch (err) {
    console.error("[SEC] 수집 실패:", err instanceof Error ? err.message : err);
  }

  return articles;
}
