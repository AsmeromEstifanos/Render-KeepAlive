import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, JSX } from 'react'
import './App.css'

type PingState = 'idle' | 'pending' | 'success' | 'error'

type EndpointStatus = {
  state: PingState
  lastPing?: string
  latencyMs?: number
  error?: string
}

type EndpointStatusMap = Record<string, EndpointStatus>

const ENDPOINT_STORAGE_KEY = 'render-keepalive:endpoints'
const INTERVAL_STORAGE_KEY = 'render-keepalive:interval-minutes'
const MIN_INTERVAL_MS = 10_000

const splitEndpoints = (value: string): string[] =>
  value
    .split(/[\s,;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)

const isHttpUrl = (candidate: string): boolean => {
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const presetEndpoints = (() => {
  const raw = import.meta.env.VITE_PRESET_ENDPOINTS
  if (typeof raw !== 'string' || !raw.trim()) {
    return [] as string[]
  }

  const deduped = new Set<string>()
  splitEndpoints(raw).forEach((candidate) => {
    if (isHttpUrl(candidate) && !deduped.has(candidate)) {
      deduped.add(candidate)
    }
  })
  return Array.from(deduped)
})()

const mergeWithPresetEndpoints = (stored: string[]): string[] => {
  if (!presetEndpoints.length) {
    return stored
  }

  const deduped = new Set<string>()
  const merged: string[] = []

  const append = (items: string[]) => {
    items.forEach((item) => {
      if (!deduped.has(item)) {
        deduped.add(item)
        merged.push(item)
      }
    })
  }

  append(presetEndpoints)
  append(stored)

  return merged
}

const loadStoredEndpoints = (): string[] => {
  if (typeof window === 'undefined') {
    return mergeWithPresetEndpoints([])
  }

  try {
    const raw = window.localStorage.getItem(ENDPOINT_STORAGE_KEY)
    if (!raw) {
      return mergeWithPresetEndpoints([])
    }

    const values = JSON.parse(raw)
    const stored = Array.isArray(values)
      ? (values.filter((value) => typeof value === 'string') as string[])
      : []
    return mergeWithPresetEndpoints(stored)
  } catch {
    return mergeWithPresetEndpoints([])
  }
}

const loadStoredInterval = (fallback: number): number => {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(INTERVAL_STORAGE_KEY)
    if (!raw) {
      return fallback
    }

    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  } catch {
    return fallback
  }
}

const formatTimestamp = (iso?: string): string => {
  if (!iso) {
    return 'N/A'
  }

  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

const statusLabel: Record<PingState, string> = {
  idle: 'Idle',
  pending: 'Pinging...',
  success: 'Online',
  error: 'Failed',
}

const statusClass: Record<PingState, string> = {
  idle: 'status-badge idle',
  pending: 'status-badge pending',
  success: 'status-badge success',
  error: 'status-badge error',
}

function App(): JSX.Element {
  const [endpoints, setEndpoints] = useState<string[]>(() => loadStoredEndpoints())
  const [intervalMinutes, setIntervalMinutes] = useState<number>(() => loadStoredInterval(5))
  const [intervalInput, setIntervalInput] = useState<string>(() => loadStoredInterval(5).toString())
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [newEndpointInput, setNewEndpointInput] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<EndpointStatusMap>({})
  const [lastSweepAt, setLastSweepAt] = useState<string | null>(null)
  const hasPresetEndpoints = presetEndpoints.length > 0

  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(ENDPOINT_STORAGE_KEY, JSON.stringify(endpoints))
  }, [endpoints])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(INTERVAL_STORAGE_KEY, String(intervalMinutes))
  }, [intervalMinutes])

  useEffect(() => {
    setStatuses((previous) => {
      if (!isMounted.current) {
        return previous
      }

      const next: EndpointStatusMap = {}
      endpoints.forEach((url) => {
        next[url] = previous[url] ?? { state: 'idle' }
      })
      return next
    })
  }, [endpoints])

  useEffect(() => {
    if (endpoints.length === 0 && isRunning) {
      setIsRunning(false)
    }
  }, [endpoints, isRunning])

  const updateStatus = useCallback((url: string, update: Partial<EndpointStatus>) => {
    setStatuses((previous) => {
      if (!isMounted.current) {
        return previous
      }

      const existing = previous[url] ?? { state: 'idle' as PingState }
      return {
        ...previous,
        [url]: {
          ...existing,
          ...update,
        },
      }
    })
  }, [])

  const pingEndpoint = useCallback(
    async (url: string) => {
      updateStatus(url, { state: 'pending', error: undefined })
      const started = performance.now()

      try {
        await fetch(url, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          keepalive: true,
        })

        const latencyMs = Math.round(performance.now() - started)
        updateStatus(url, {
          state: 'success',
          lastPing: new Date().toISOString(),
          latencyMs,
          error: undefined,
        })
      } catch (error) {
        updateStatus(url, {
          state: 'error',
          lastPing: new Date().toISOString(),
          latencyMs: undefined,
          error: error instanceof Error ? error.message : 'Unable to reach endpoint',
        })
      }
    },
    [updateStatus],
  )

  const pingAll = useCallback(async () => {
    if (!endpoints.length) {
      return
    }

    await Promise.all(endpoints.map((url) => pingEndpoint(url)))
    if (isMounted.current) {
      setLastSweepAt(new Date().toISOString())
    }
  }, [endpoints, pingEndpoint])

  useEffect(() => {
    if (!isRunning || endpoints.length === 0) {
      return
    }

    void pingAll()

    const intervalMs = Math.max(MIN_INTERVAL_MS, Math.round(intervalMinutes * 60_000))
    const intervalId = window.setInterval(() => {
      void pingAll()
    }, intervalMs)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [endpoints, intervalMinutes, isRunning, pingAll])

  const handleAddEndpoints = useCallback(() => {
    const candidates = splitEndpoints(newEndpointInput)
    if (candidates.length === 0) {
      setFormError('Enter at least one URL before adding.')
      return
    }

    const invalid = candidates.filter((candidate) => !isHttpUrl(candidate))
    if (invalid.length > 0) {
      setFormError(`Invalid URL${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`)
      return
    }

    setEndpoints((previous) => {
      const found = new Set(previous)
      candidates.forEach((candidate) => {
        if (!found.has(candidate)) {
          found.add(candidate)
        }
      })
      return Array.from(found)
    })

    setStatuses((previous) => {
      if (!isMounted.current) {
        return previous
      }

      const next = { ...previous }
      candidates.forEach((candidate) => {
        if (!next[candidate]) {
          next[candidate] = { state: 'idle' }
        }
      })
      return next
    })

    setNewEndpointInput('')
    setFormError(null)
  }, [newEndpointInput])

  const handleEndpointInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      handleAddEndpoints()
    }
  }

  const handleIntervalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number.parseFloat(intervalInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setIntervalInput(intervalMinutes.toString())
      return
    }

    setIntervalMinutes(parsed)
    setIntervalInput(parsed.toString())
  }

  const handleRemoveEndpoint = (url: string) => {
    setEndpoints((previous) => previous.filter((candidate) => candidate !== url))
    setStatuses((previous) => {
      if (!isMounted.current) {
        return previous
      }

      const { [url]: _removed, ...rest } = previous
      return rest
    })
  }

  const clearAll = () => {
    setEndpoints(presetEndpoints.slice())
    setStatuses({})
    setLastSweepAt(null)
  }

  const sortedEndpoints = useMemo(() => [...endpoints].sort((a, b) => a.localeCompare(b)), [endpoints])
  const canStart = endpoints.length > 0 && !isRunning
  const canStop = isRunning
  const canPingNow = endpoints.length > 0

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Render Keepalive Monitor</h1>
        <p>
          Paste the Render backend URLs you want to keep awake. The app will periodically send lightweight requests to
          each endpoint so they stay warm.
        </p>
      </header>

      <section className="card">
        <h2>Endpoints</h2>
        <textarea
          value={newEndpointInput}
          onChange={(event) => setNewEndpointInput(event.target.value)}
          onKeyDown={handleEndpointInputKeyDown}
          placeholder="https://service-1.onrender.com/health&#10;https://service-2.onrender.com/ping"
          rows={4}
        />
        {formError ? <p className="form-error">{formError}</p> : null}
        <div className="button-row">
          <button type="button" onClick={handleAddEndpoints}>
            Add Endpoint(s)
          </button>
          <button type="button" onClick={clearAll} disabled={endpoints.length === 0}>
            Clear All
          </button>
        </div>
        <p className="hint">
          You can add multiple URLs at once. Separate them with commas or new lines. Use <kbd>Ctrl</kbd> + <kbd>Enter</kbd>{' '}
          (or <kbd>Cmd</kbd> + <kbd>Enter</kbd>) to add quickly.
        </p>
        <p className="hint">
          Prefer config over the UI? Set <code>VITE_PRESET_ENDPOINTS</code> in a <code>.env</code> file before running the
          app. Separate URLs with commas, spaces, or new lines and they will load automatically each time.
        </p>
        {hasPresetEndpoints ? (
          <p className="hint">
            Pre-configured endpoints from <code>VITE_PRESET_ENDPOINTS</code> are reapplied on refresh so they stay in the
            rotation.
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Schedule</h2>
        <form className="interval-form" onSubmit={handleIntervalSubmit}>
          <label htmlFor="interval-input">
            Ping every
            <input
              id="interval-input"
              type="number"
              min="0.1"
              step="0.1"
              value={intervalInput}
              onChange={(event) => setIntervalInput(event.target.value)}
            />
            minutes
          </label>
          <button type="submit">Apply</button>
        </form>
        <div className="button-row">
          <button type="button" onClick={() => setIsRunning(true)} disabled={!canStart}>
            Start
          </button>
          <button type="button" onClick={() => setIsRunning(false)} disabled={!canStop}>
            Stop
          </button>
          <button type="button" onClick={() => void pingAll()} disabled={!canPingNow}>
            Ping Now
          </button>
        </div>
        <p className="hint">
          Minimum interval enforced is {Math.round(MIN_INTERVAL_MS / 1000)} seconds to avoid accidental request storms.
        </p>
        <p className="hint">
          {lastSweepAt ? `Last sweep finished at ${formatTimestamp(lastSweepAt)}.` : 'No pings sent yet.'}
        </p>
      </section>

      <section className="card">
        <h2>Activity</h2>
        {sortedEndpoints.length === 0 ? (
          <p className="empty-state">Add at least one endpoint to begin monitoring.</p>
        ) : (
          <table className="status-table">
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">Status</th>
                <th scope="col">Latency</th>
                <th scope="col">Last Ping</th>
                <th scope="col">Notes</th>
                <th scope="col" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {sortedEndpoints.map((url) => {
                const status = statuses[url] ?? { state: 'idle' }
                return (
                  <tr key={url}>
                    <td className="endpoint-url" data-label="Endpoint">
                      <a href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    </td>
                    <td data-label="Status">
                      <span className={statusClass[status.state]}>{statusLabel[status.state]}</span>
                    </td>
                    <td data-label="Latency">{status.latencyMs != null ? `${status.latencyMs} ms` : 'N/A'}</td>
                    <td data-label="Last Ping">{formatTimestamp(status.lastPing)}</td>
                    <td className="notes-cell" data-label="Notes">
                      {status.error ?? 'N/A'}
                    </td>
                    <td data-label="Actions">
                      <button className="link-button" type="button" onClick={() => handleRemoveEndpoint(url)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="hint">
          Some backends might block browser requests via CORS. In that case the ping may fail here, but the request will
          still reach the server and help keep it awake.
        </p>
      </section>
    </div>
  )
}

export default App
