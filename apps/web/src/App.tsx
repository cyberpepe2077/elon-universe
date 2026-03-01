import { HashRouter, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Layout } from '@/components/Layout'

const Home = lazy(() => import('@/pages/Home'))
const Articles = lazy(() => import('@/pages/Articles'))
const Stock = lazy(() => import('@/pages/Stock'))
const Market = lazy(() => import('@/pages/Market'))

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <Suspense fallback={null}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path="/articles"
            element={
              <Suspense fallback={null}>
                <Articles />
              </Suspense>
            }
          />
          <Route
            path="/stock"
            element={
              <Suspense fallback={null}>
                <Stock />
              </Suspense>
            }
          />
          <Route
            path="/market"
            element={
              <Suspense fallback={null}>
                <Market />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  )
}
