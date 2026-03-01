import type { Article } from '@/types/article'
import { BADGE, IMPORTANCE_BADGE, IMPORTANCE_LABEL } from '@/types/article'

interface ArticleCardProps {
  article: Article
  onClick: () => void
}

export function ArticleCard({ article, onClick }: ArticleCardProps) {
  const date = new Date(article.publishedAt).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  })

  const displayTitle = article.titleKo || article.title

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex flex-col gap-1.5 py-4 border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)] -mx-3 px-3 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${BADGE[article.category]}`}>
          {article.category.toUpperCase()}
        </span>
        {article.importance && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${IMPORTANCE_BADGE[article.importance]}`}>
            {IMPORTANCE_LABEL[article.importance]}
          </span>
        )}
        <span className="text-xs text-[var(--muted-foreground)]">{article.source}</span>
        <span className="text-xs text-[var(--muted-foreground)]">· {date}</span>
      </div>
      <h2 className="text-sm font-medium leading-snug group-hover:opacity-70 transition-opacity">
        {displayTitle}
      </h2>
      {article.content && (
        <p className="text-xs text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
          {article.summaryKo || article.content}
        </p>
      )}
    </button>
  )
}
