export type Category = 'all' | 'tesla' | 'spacex' | 'xai'

export interface Article {
  id: string
  title: string
  content: string
  contentFull?: string
  url: string
  source: string
  category: 'tesla' | 'spacex' | 'xai'
  publishedAt: string
  titleKo?: string
  summaryKo?: string
  importance?: 'high' | 'medium' | 'low'
}

export const BADGE: Record<string, string> = {
  tesla: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  spacex: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  xai: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
}

export const IMPORTANCE_BADGE: Record<string, string> = {
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export const IMPORTANCE_LABEL: Record<string, string> = {
  high: '중요',
  medium: '보통',
  low: '낮음',
}
