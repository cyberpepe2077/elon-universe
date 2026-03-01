import { Link, Outlet, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

export function Layout() {
  const { dark, toggle } = useTheme()
  const location = useLocation()

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-bold text-base hover:opacity-70 transition-opacity">
              Elon Universe
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                to="/articles"
                className={`text-sm transition-colors ${
                  location.pathname === '/articles'
                    ? 'text-[var(--foreground)] font-medium'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                뉴스
              </Link>
              <Link
                to="/stock"
                className={`text-sm transition-colors ${
                  location.pathname === '/stock'
                    ? 'text-[var(--foreground)] font-medium'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                주식
              </Link>
              <Link
                to="/market"
                className={`text-sm transition-colors ${
                  location.pathname === '/market'
                    ? 'text-[var(--foreground)] font-medium'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                시장
              </Link>
            </nav>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            title={dark ? '라이트 모드' : '다크 모드'}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
