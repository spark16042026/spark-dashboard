'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import ScoreBadge from '@/components/ScoreBadge'
import ManagedByBadge from '@/components/ManagedByBadge'
import { Lead, Score, LeadStatus, Notification } from '@/types'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

const STATUS_COLORS: Record<LeadStatus, string> = {
  'Not Started':    'border-l-gray-300',
  'In Conversation':'border-l-green-400',
  'Handed Off':     'border-l-violet-400',
}

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const NOTIF_ICONS: Record<string, string> = {
  score_change:    '📊',
  status_change:   '🔄',
  leads_extracted: '📥',
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [leads, setLeads] = useState<Lead[]>([])
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('')
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [search, setSearch] = useState('')
  const [filterScore, setFilterScore] = useState<Score | ''>('')
  const [filterStatus, setFilterStatus] = useState<LeadStatus | ''>('')
  const [loading, setLoading] = useState(true)

  // Auth + load agent
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/'); return }

      supabase.from('agents').select('agent_id, name, last_polled_at').eq('email', data.user.email!).maybeSingle()
        .then(({ data: agent }) => {
          if (!agent) { router.push('/onboarding'); return }
          setAgentId(agent.agent_id)
          setAgentName(agent.name)
          setLastPolledAt(agent.last_polled_at || null)
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load leads
  const loadLeads = useCallback(async () => {
    if (!agentId) return
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('agent_id', agentId)
      .order('last_activity', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }, [agentId, supabase])

  // Load notifications
  const loadNotifs = useCallback(async () => {
    if (!agentId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs(data || [])
    setUnread((data || []).filter((n: Notification) => !n.is_read).length)
  }, [agentId, supabase])

  useEffect(() => {
    loadLeads()
    loadNotifs()
  }, [loadLeads, loadNotifs])

  // Real-time subscriptions
  useEffect(() => {
    if (!agentId) return

    const leadsSub = supabase.channel('leads-rt')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `agent_id=eq.${agentId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLeads(prev => [payload.new as Lead, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setLeads(prev => prev.map(l =>
              l.lead_id === (payload.new as Lead).lead_id ? payload.new as Lead : l
            ))
          }
        }
      ).subscribe()

    const notifsSub = supabase.channel('notifs-rt')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `agent_id=eq.${agentId}` },
        (payload) => {
          setNotifs(prev => [payload.new as Notification, ...prev])
          setUnread(n => n + 1)
        }
      ).subscribe()

    // Watch for last_polled_at updates from the background scheduler
    // Also reload leads so the dashboard auto-refreshes after a background poll
    const agentSub = supabase.channel('agent-poll-rt')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agents', filter: `agent_id=eq.${agentId}` },
        (payload) => {
          const updated = payload.new as { last_polled_at?: string }
          if (updated.last_polled_at) {
            setLastPolledAt(updated.last_polled_at)
            loadLeads()  // pull fresh leads after every background poll
          }
        }
      ).subscribe()

    return () => {
      supabase.removeChannel(leadsSub)
      supabase.removeChannel(notifsSub)
      supabase.removeChannel(agentSub)
    }
  }, [agentId, supabase])

  async function checkInbox() {
    if (!agentId) return
    setPolling(true)
    try {
      const res = await fetch(`${BACKEND?.replace(/\/$/, '')}/poll`, { method: 'POST' })
      const data = await res.json()
      if (data.polled_at) setLastPolledAt(data.polled_at)
      // Direct fetch — avoids any stale closure on loadLeads
      const { data: fresh } = await supabase
        .from('leads')
        .select('*')
        .eq('agent_id', agentId)
        .order('last_activity', { ascending: false })
      setLeads(fresh || [])
    } catch (e) {
      console.error('Poll failed', e)
    } finally {
      setPolling(false)
    }
  }

  async function markNotifsRead() {
    if (!agentId || unread === 0) return
    await supabase.from('notifications').update({ is_read: true })
      .eq('agent_id', agentId).eq('is_read', false)
    setUnread(0)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function clearAllNotifs() {
    if (!agentId || notifs.length === 0) return
    setNotifs([])
    setUnread(0)
    await supabase.from('notifications').delete().eq('agent_id', agentId)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) ||
      (l.property_interest || '').toLowerCase().includes(q)
    const matchScore = !filterScore || l.score === filterScore
    const matchStatus = !filterStatus || l.status === filterStatus
    return matchSearch && matchScore && matchStatus
  })

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg">✦ Spark</span>
          <span className="text-sm text-gray-500 hidden sm:inline">Hi, {agentName}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markNotifsRead() }}
              className="relative p-2 rounded-full hover:bg-gray-100 transition"
            >
              🔔
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <div className="px-4 py-2 border-b flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Notifications</span>
                  {notifs.length > 0 && (
                    <button
                      onClick={clearAllNotifs}
                      className="text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 && (
                    <p className="text-sm text-gray-400 p-4 text-center">No notifications yet.</p>
                  )}
                  {notifs.map(n => (
                    <div key={n.notification_id}
                      className={`px-4 py-3 border-b last:border-b-0 flex gap-3 ${!n.is_read ? 'bg-blue-50' : ''}`}>
                      <span className="text-lg mt-0.5">{NOTIF_ICONS[n.type] || '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                        {n.detail && <p className="text-xs text-gray-500 mt-0.5">{n.detail}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Polling status + manual trigger */}
          <div className="flex items-center gap-2">
            {polling ? (
              <span className="flex items-center gap-1.5 text-xs text-violet-600 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                Checking inbox…
              </span>
            ) : (
              <button
                onClick={checkInbox}
                className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition"
              >
                📥 Check inbox
              </button>
            )}
            {lastPolledAt && !polling && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Last checked {timeAgo(lastPolledAt)}
              </span>
            )}
          </div>

          <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-800 transition">Settings</Link>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800 transition">Sign out</button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <input
            type="text"
            placeholder="Search name, phone, property…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <select
            value={filterScore}
            onChange={e => setFilterScore(e.target.value as Score | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All scores</option>
            {(['Scorching', 'Hot', 'Warm', 'Cold'] as Score[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as LeadStatus | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">All statuses</option>
            {(['Not Started', 'In Conversation', 'Handed Off'] as LeadStatus[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(['Scorching', 'Hot', 'Warm', 'Cold'] as Score[]).map(score => (
            <div key={score} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500">{score}</p>
              <p className="text-2xl font-bold mt-0.5">
                {leads.filter(l => l.score === score).length}
              </p>
            </div>
          ))}
        </div>

        {/* Lead list */}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading leads…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No leads found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(lead => (
              <Link
                key={lead.lead_id}
                href={`/dashboard/leads/${lead.lead_id}`}
                className={`block bg-white rounded-xl border border-l-4 border-gray-200 ${STATUS_COLORS[lead.status]} px-5 py-4 hover:shadow-sm transition`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{lead.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {lead.phone}
                      {' · '}
                      {lead.property_interest || <span className="italic">General enquiry</span>}
                    </p>
                    {lead.notes && (
                      <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">
                        📝 {lead.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 flex-shrink-0 justify-end">
                    <ScoreBadge score={lead.score} />
                    <ManagedByBadge managedBy={lead.managed_by} />
                    <span className="text-xs text-gray-400 self-center">
                      {lead.last_activity ? timeAgo(lead.last_activity) : '—'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
