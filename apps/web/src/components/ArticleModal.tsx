import { useEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { Article } from '@/types/article'
import { BADGE, IMPORTANCE_BADGE, IMPORTANCE_LABEL } from '@/types/article'

interface ArticleModalProps {
  article: Article
  onClose: () => void
}

export function ArticleModal({ article, onClose }: ArticleModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const date = new Date(article.publishedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const displayTitle = article.titleKo || article.title
  const displaySummary = article.summaryKo || article.content

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full sm:max-w-2xl max-h-[90vh] bg-[var(--background)] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--border)]">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${BADGE[article.category]}`}>
              {article.category.toUpperCase()}
            </span>
            {article.importance && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${IMPORTANCE_BADGE[article.importance]}`}>
                {IMPORTANCE_LABEL[article.importance]}
              </span>
            )}
            <span className="text-xs text-[var(--muted-foreground)] shrink-0">{article.source} · {date}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="text-base font-semibold leading-snug">{displayTitle}</h2>

          {displaySummary && (
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
              {displaySummary}
            </p>
          )}

          {article.contentFull && (
            <div className="text-sm leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
              {article.contentFull}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[var(--border)]">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)] hover:opacity-70 transition-opacity"
          >
            원문 보기
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  )
}
