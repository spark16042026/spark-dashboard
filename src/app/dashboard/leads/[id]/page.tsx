'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import ConversationView from '@/components/ConversationView'
import ScoreBadge from '@/components/ScoreBadge'
import ManagedByBadge from '@/components/ManagedByBadge'
import { Lead, Message, Score } from '@/types'

const SCORES: Score[] = ['Cold', 'Warm', 'Hot', 'Scorching']

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
  const [showTakeoverModal, setShowTakeoverModal] = useState(false)

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/'); return }
      supabase.from('agents').select('agent_id').eq('email', data.user.email!).maybeSingle()
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

  async function confirmTakeOver() {
    if (!lead || !agentId) return
    setShowTakeoverModal(false)
    setActionLoading(true)
    setLead({ ...lead, ai_paused: true, managed_by: 'human', status: 'Handed Off' })

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

  async function handleSetScore(newScore: Score) {
    if (!lead || lead.score === newScore) return
    setActionLoading(true)
    const previous = lead.score
    setLead({ ...lead, score: newScore })

    await supabase.from('leads').update({ score: newScore }).eq('lead_id', leadId)
    await supabase.from('score_logs').insert({
      lead_id: leadId,
      previous_score: previous,
      score: newScore,
      reasoning: 'Manually set by agent',
    })
    if (agentId) {
      await supabase.from('notifications').insert({
        agent_id: agentId,
        lead_id: leadId,
        type: 'score_change',
        title: `${lead.name} heat score changed`,
        detail: `${previous} → ${newScore} (manual)`,
      })
    }
    setActionLoading(false)
  }

  if (!lead && !loading) return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
      Lead not found. <Link href="/dashboard" className="ml-2 text-violet-600 underline">Back</Link>
    </div>
  )

  const isHumanManaged = lead?.managed_by === 'human'

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
          {!isHumanManaged && (
            <div className="lg:hidden border-t border-gray-200 px-4 py-3 bg-white flex gap-2">
              <button onClick={() => setShowTakeoverModal(true)} disabled={actionLoading}
                className="flex-1 bg-orange-500 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50">
                Take Over
              </button>
            </div>
          )}
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

          {/* Notes */}
          {lead?.notes && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Enquiry Notes</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-sm text-gray-700 leading-relaxed">
                {lead.notes}
              </div>
            </div>
          )}

          {/* Score */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Heat Score</h2>
            <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 space-y-3">
              <div className="flex items-center gap-3">
                {lead && <ScoreBadge score={lead.score} />}
                {!isHumanManaged && (
                  <span className="text-sm text-gray-500">Follow-ups: {lead?.follow_up_count ?? 0}/3</span>
                )}
              </div>
              {isHumanManaged ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {SCORES.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSetScore(s)}
                      disabled={actionLoading || lead?.score === s}
                      className={`text-xs py-1.5 rounded-lg border font-medium transition disabled:opacity-50 ${
                        lead?.score === s
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">AI is managing — heat score updates automatically.</p>
              )}
            </div>
          </div>

          {/* Desktop actions */}
          {!isHumanManaged && (
            <div className="hidden lg:block space-y-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</h2>
              <button onClick={() => setShowTakeoverModal(true)} disabled={actionLoading}
                className="w-full bg-orange-500 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50">
                Take Over
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Take Over confirmation modal */}
      {showTakeoverModal && lead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setShowTakeoverModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">Take over this conversation?</h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    The AI will stop responding to <span className="font-medium text-gray-900">{lead.name}</span> permanently.
                    This cannot be undone — you&apos;ll need to continue the conversation directly in WhatsApp.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowTakeoverModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmTakeOver}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition shadow-sm"
              >
                Take Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
