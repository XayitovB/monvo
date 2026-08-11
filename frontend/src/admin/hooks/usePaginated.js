import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../api'

/**
 * usePaginated(path, extraParams?, limit?)
 * Supports backend endpoints that accept `offset` + `limit` query params
 * and optional extra filters (e.g. { tx_type: 'earn', search: 'foo' }).
 *
 * Callers should pass a memoized `extraParams` (useMemo) to avoid re-renders.
 * This hook stabilizes via a stringified key so an unmemoized object won't
 * cause infinite loops, but memoizing upstream is still preferred.
 */
export function usePaginated(path, extraParams = {}, limit = 20) {
  const [data, setData]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState(extraParams.search ?? '')

  const paramsKey = useMemo(() => JSON.stringify(extraParams), [extraParams])
  const paramsRef = useRef(extraParams)
  paramsRef.current = extraParams

  const load = useCallback(async (p = page) => {
    setLoading(true)
    const offset = (p - 1) * limit
    const qs = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    })
    if (search) qs.set('search', search)
    Object.entries(paramsRef.current).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && k !== 'search') {
        qs.set(k, String(v))
      }
    })
    try {
      const res = await api.get(`${path}?${qs.toString()}`)
      const items = res.items ?? res
      setData(items)
      setTotal(res.total ?? items.length)
    } finally {
      setLoading(false)
    }
  }, [path, page, search, limit, paramsKey])

  useEffect(() => { load(page) }, [load, page])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return {
    data, total, page, setPage, totalPages, loading,
    search, setSearch, reload: () => load(page),
  }
}
