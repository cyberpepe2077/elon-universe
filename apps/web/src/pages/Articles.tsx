import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { Article, Category } from '@/types/article'
import { ArticleCard } from '@/components/ArticleCard'
import { ArticleModal } from '@/components/ArticleModal'

const TABS: { value: Category; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'tesla', label: 'Tesla' },
  { value: 'spacex', label: 'SpaceX' },
  { value: 'xai', label: 'xAI' },
]

export default function Articles() {
  const [category, setCategory] = useState<Category>('all')
  const [allArticles, setAllArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Article | null>(null)

  const articles = category === 'all' ? allArticles : allArticles.filter(a => a.category === category)

  const loadArticles = () => {
    setLoading(true)
    setError(null)
    fetch(`${import.meta.env.BASE_URL}data/articles.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ articles: Article[]; total: number }>
      })
      .then(({ articles: data }) => setAllArticles(data))
      .catch(() => setError('데이터를 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadArticles()
  }, [])

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Category Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                category === value
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={loadArticles}
          className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          title="새로고침"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="py-20 text-center text-sm text-[var(--muted-foreground)]">
          불러오는 중...
        </div>
      )}

      {error && (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
          <div className="text-xs text-[var(--muted-foreground)] space-y-1">
            <p>어드민에서 내보내기를 실행한 후 배포하세요</p>
          </div>
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">기사가 없습니다.</p>
          <div className="text-xs text-[var(--muted-foreground)] space-y-1">
            <p>파이프라인을 먼저 실행하세요</p>
            <code className="bg-[var(--muted)] px-2 py-1 rounded block w-fit mx-auto">
              pnpm pipeline
            </code>
          </div>
        </div>
      )}

      {!loading && !error && articles.length > 0 && (
        <>
          <p className="text-xs text-[var(--muted-foreground)] mb-4">{articles.length}건</p>
          <div>
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} onClick={() => setSelected(a)} />
            ))}
          </div>
        </>
      )}

      {selected && (
        <ArticleModal article={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  )
}
