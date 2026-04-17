'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import ConversationView from '@/components/ConversationView'
import ScoreBadge from '@/components/ScoreBadge'
import ManagedByBadge from '@/components/ManagedByBadge'
import { Lead, Message } from '@/types'

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>()
  const leadId = params.id
  const router = useRouter()
  const supabase = createClient()

  const [lead, setLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [agentId, setAgentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/'); return }
      supabase.from('agents').select('agent_id').eq('email', data.user.email!).single()
        .then(({ data: agent }) => agent && setAgentId(agent.agent_id))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLead = useCallback(async () => {
    const { data } = await supabase.from('leads').select('*').eq('lead_id', leadId).single()
    if (data) setLead(data)
  }, [leadId, supabase])

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*')
      .eq('lead_id', leadId).order('timestamp')
    setMessages(data || [])
    setLoading(false)
  }, [leadId, supabase])

  useEffect(() => {
    loadLead()
    loadMessages()
  }, [loadLead, loadMessages])

  // Real-time: new messages
  useEffect(() => {
    const sub = supabase.channel('msgs-rt')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${leadId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message])
      ).subscribe()
    const leadSub = supabase.channel('lead-rt')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: `lead_id=eq.${leadId}` },
        (payload) => setLead(payload.new as Lead)
      ).subscribe()
    return () => {
      supabase.removeChannel(sub)
      supabase.removeChannel(leadSub)
    }
  }, [leadId, supabase])

  async function handleTakeOver() {
    if (!lead || !agentId) return
    setActionLoading(true)
    await supabase.from('leads').update({
      ai_paused: true,
      managed_by: 'human',
      status: 'Handed Off',
    }).eq('lead_id', leadId)

    await supabase.from('notifications').insert({
      agent_id: agentId,
      lead_id: leadId,
      type: 'status_change',
      title: `${lead.name} — you took over`,
      detail: 'You took over from dashboard',
    })
    setActionLoading(false)
  }

  async function handleResumeAI() {
    if (!lead) return
    setActionLoading(true)
    await supabase.from('leads').update({
      ai_paused: false,
      managed_by: 'ai',
      status: 'In Conversation',
    }).eq('lead_id', leadId)
    setActionLoading(false)
  }

  async function handleClose() {
    if (!confirm('Mark this lead as Cold and stop AI engagement?')) return
    setActionLoading(true)
    await supabase.from('leads').update({ score: 'Cold', ai_paused: true, managed_by: 'human' })
      .eq('lead_id', leadId)
    setActionLoading(false)
  }

  if (!lead && !loading) return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
      Lead not found. <Link href="/dashboard" className="ml-2 text-violet-600 underline">Back</Link>
    </div>
  )

  const isAIPaused = lead?.ai_paused

  return (
    <div className="min-h-screen flex flex-col max-w-6xl mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 transition text-xl">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">{lead?.name ?? '…'}</h1>
          <p className="text-xs text-gray-400">{lead?.phone}</p>
        </div>
        <div className="flex gap-2 items-center">
          {lead && <ScoreBadge score={lead.score} />}
          {lead && <ManagedByBadge managedBy={lead.managed_by} />}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Conversation */}
        <div className="flex flex-col flex-1 bg-white overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : (
            <ConversationView messages={messages} />
          )}

          {/* Mobile action bar */}
          <div className="lg:hidden border-t border-gray-200 px-4 py-3 bg-white flex gap-2">
            {isAIPaused ? (
              <button onClick={handleResumeAI} disabled={actionLoading}
                className="flex-1 bg-violet-600 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50">
                Resume AI
              </button>
            ) : (
              <button onClick={handleTakeOver} disabled={actionLoading}
                className="flex-1 bg-orange-500 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50">
                Take Over
              </button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 p-5 space-y-5 overflow-y-auto">
          {/* Lead info */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lead Info</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y text-sm">
              {[
                ['Name', lead?.name],
                ['Phone', lead?.phone],
                ['Email', lead?.email || '—'],
                ['Property', lead?.property_interest || 'General enquiry'],
                ['Status', lead?.status],
                ['Channel', lead?.channel?.toUpperCase()],
                ['Added', lead?.created_at ? formatDate(lead.created_at) : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-2 gap-2">
                  <span className="text-gray-400 shrink-0">{k}</span>
                  <span className="text-gray-800 text-right truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Score */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Heat Score</h2>
            <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 flex items-center gap-3">
              {lead && <ScoreBadge score={lead.score} />}
              <span className="text-sm text-gray-500">Follow-ups: {lead?.follow_up_count ?? 0}/3</span>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="hidden lg:block space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</h2>
            {isAIPaused ? (
              <button onClick={handleResumeAI} disabled={actionLoading}
                className="w-full bg-violet-600 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50">
                Resume AI
              </button>
            ) : (
              <button onClick={handleTakeOver} disabled={actionLoading}
                className="w-full bg-orange-500 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50">
                Take Over
              </button>
            )}
            <button onClick={handleClose} disabled={actionLoading}
              className="w-full bg-gray-100 text-gray-600 text-sm py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-gray-200 transition">
              Close Lead
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
