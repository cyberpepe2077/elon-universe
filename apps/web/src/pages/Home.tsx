import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Aurora } from '@/components/ui/aurora'
import { BlurText } from '@/components/ui/blur-text'
import { NumberTicker } from '@/components/ui/number-ticker'
import type { Article } from '@/types/article'
import { BADGE } from '@/types/article'

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/articles.json`)
      .then((r) => r.ok ? r.json() as Promise<{ articles: Article[]; total: number }> : Promise.reject())
      .then(({ articles: data }) => setArticles(data))
      .catch(() => {/* API 미연결 시 조용히 무시 */})
  }, [])

  const preview = articles.slice(0, 3)
  const total = articles.length

  return (
    <>
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center min-h-[80vh] text-center px-4 overflow-hidden">
        <Aurora />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl">
          {/* Live tag */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--background)]/60 backdrop-blur-sm text-xs text-[var(--muted-foreground)]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            실시간 업데이트
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
            <BlurText text="Elon Universe" delay={0.08} />
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed">
            Tesla · SpaceX · xAI 최신 뉴스를 한국어로
          </p>

          {/* CTA */}
          <Link
            to="/articles"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--foreground)] text-[var(--background)] text-sm font-medium hover:opacity-80 transition-opacity"
          >
            뉴스 보기
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* Stats Section */}
      <section className="max-w-2xl mx-auto px-4 py-16">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col gap-1">
            <span className="text-2xl sm:text-3xl font-bold">
              <NumberTicker target={total > 0 ? total : 200} suffix="+" />
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">총 기사</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl sm:text-3xl font-bold">
              <NumberTicker target={3} />
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">카테고리</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl sm:text-3xl font-bold">
              <NumberTicker target={24} suffix="h" />
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">업데이트 주기</span>
          </div>
        </div>
      </section>

      {/* Latest Preview */}
      {preview.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">최신 뉴스</h2>
            <Link
              to="/articles"
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
            >
              전체 보기
              <ArrowRight size={12} />
            </Link>
          </div>
          <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
            {preview.map((a) => (
              <Link
                key={a.id}
                to="/articles"
                className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--accent)] transition-colors"
              >
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${BADGE[a.category]}`}>
                  {a.category.toUpperCase()}
                </span>
                <span className="text-sm font-medium leading-snug line-clamp-2">
                  {a.titleKo || a.title}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted-foreground)]">
        Elon Universe · Tesla · SpaceX · xAI 뉴스 집계 플랫폼
      </footer>
    </>
  )
}
