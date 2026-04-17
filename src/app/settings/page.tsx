'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Section = 'profile' | 'tone' | 'properties' | 'faqs' | 'boundaries' | 'sources'

type Property = {
  name: string; type: string; location: string; price_range: string
  key_selling_points: string; unit_types: string; available_units: string
}
type FAQ = { question: string; answer: string }

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [agentId, setAgentId] = useState('')
  const [open, setOpen] = useState<Section | null>('profile')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [styleStats, setStyleStats] = useState<{messages_parsed:number, examples_extracted:number} | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Form state
  const [profile, setProfile] = useState<Record<string,string>>({})
  const [tone, setTone] = useState<Record<string,string>>({})
  const [properties, setProperties] = useState<Property[]>([])
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [boundaries, setBoundaries] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])

  // Auth + load
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const { data: agent } = await supabase.from('agents').select('*').eq('email', data.user.email!).single()
      if (!agent) { router.push('/onboarding'); return }
      setAgentId(agent.agent_id)
      const mf = agent.memory_file || {}
      setProfile({ ...((mf.agent as Record<string,string>) || {}), phone: agent.phone || '' })
      setTone((mf.tone as Record<string,string>) || {})
      setProperties(((mf.properties as Property[]) || []).map(p => ({
        ...p,
        key_selling_points: Array.isArray(p.key_selling_points) ? (p.key_selling_points as unknown as string[]).join(', ') : (p.key_selling_points || ''),
        unit_types: Array.isArray(p.unit_types) ? (p.unit_types as unknown as string[]).join(', ') : (p.unit_types || ''),
      })))
      setFaqs((mf.faqs as FAQ[]) || [])
      setBoundaries((mf.boundaries as string[]) || ['Do not engage in conversations outside of property topics'])
      setSources(agent.lead_generator_senders || [])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    const memoryFile = {
      agent: { name: profile.name, title: profile.title, agency: profile.agency, license: profile.license },
      tone,
      properties: properties.slice(0, 100).map(p => ({
        ...p,
        key_selling_points: p.key_selling_points.split(',').map(s => s.trim()).filter(Boolean),
        unit_types: p.unit_types.split(',').map(s => s.trim()).filter(Boolean),
      })),
      faqs: faqs.slice(0, 20),
      boundaries: boundaries.slice(0, 10),
    }
    await supabase.from('agents').update({
      name: profile.name,
      phone: profile.phone,
      memory_file: memoryFile,
      lead_generator_senders: sources,
    }).eq('agent_id', agentId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleStyleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !agentId) return
    setUploading(true); setUploadError('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${BACKEND?.replace(/\/$/, '')}/agents/${agentId}/import-style`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setStyleStats(data)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function addProp() { setProperties(p => [...p, { name:'', type:'', location:'', price_range:'', key_selling_points:'', unit_types:'', available_units:'' }]) }
  function updateProp(i: number, k: keyof Property, v: string) { setProperties(p => p.map((x,j) => j===i ? {...x,[k]:v} : x)) }
  function removeProp(i: number) { setProperties(p => p.filter((_,j) => j!==i)) }

  function addFaq() { setFaqs(f => [...f, { question:'', answer:'' }]) }
  function updateFaq(i: number, k: 'question'|'answer', v: string) { setFaqs(f => f.map((x,j) => j===i ? {...x,[k]:v} : x)) }
  function removeFaq(i: number) { setFaqs(f => f.filter((_,j) => j!==i)) }

  const [sourceDraft, setSourceDraft] = useState('')
  function addSource() { const v = sourceDraft.trim(); if (v && !sources.includes(v)) setSources([...sources, v]); setSourceDraft('') }
  const [bdDraft, setBdDraft] = useState('')
  function addBoundary() { const v = bdDraft.trim(); if (v) setBoundaries([...boundaries, v]); setBdDraft('') }

  function Section({ id, title, children }: { id: Section, title: string, children: React.ReactNode }) {
    const isOpen = open === id
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button onClick={() => setOpen(isOpen ? null : id)}
          className="w-full flex justify-between items-center px-5 py-4 text-left hover:bg-gray-50 transition">
          <span className="font-medium text-gray-800">{title}</span>
          <span className="text-gray-400 text-lg">{isOpen ? '−' : '+'}</span>
        </button>
        {isOpen && <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4">{children}</div>}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-xl">←</Link>
        <h1 className="font-semibold flex-1">Settings</h1>
        <button onClick={save} disabled={saving}
          className="bg-violet-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save all'}
        </button>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-6 space-y-3">

        <Section id="profile" title="Agent Profile">
          {[['name','Name'],['title','Title'],['agency','Agency'],['license','CEA License'],['phone','WhatsApp number (for alerts)']].map(([k,label]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
              <input value={profile[k]||''} onChange={e => setProfile({...profile,[k]:e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          ))}
        </Section>

        <Section id="tone" title="Tone & Style">
          {[['style','Communication style'],['greeting','Greeting template']].map(([k,label]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
              <input value={tone[k]||''} onChange={e => setTone({...tone,[k]:e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Emoji usage</label>
            <select value={tone.emoji_usage||'moderate'} onChange={e => setTone({...tone,emoji_usage:e.target.value})}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              {['none','light','moderate','heavy'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-sm font-medium mb-1">Import WhatsApp conversations</label>
            <p className="text-xs text-gray-400 mb-2">Upload a .txt export to retrain the AI on your style. Previous examples will be replaced.</p>
            <input type="file" accept=".txt" onChange={handleStyleUpload} disabled={uploading}
              className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200" />
            {uploading && <p className="text-xs text-gray-400 mt-1">Processing…</p>}
            {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
            {styleStats && <p className="text-xs text-green-600 mt-1">✓ {styleStats.messages_parsed} messages · {styleStats.examples_extracted} examples</p>}
          </div>
        </Section>

        <Section id="properties" title={`Properties (${properties.length}/100)`}>
          {properties.map((p, i) => (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{p.name || `Property ${i+1}`}</span>
                <button onClick={() => removeProp(i)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
              </div>
              {(['name','type','location','price_range','key_selling_points','unit_types','available_units'] as (keyof Property)[]).map(k => (
                <div key={k}>
                  <label className="block text-[10px] text-gray-400 mb-0.5 capitalize">{k.replace(/_/g,' ')}</label>
                  <input value={p[k]} onChange={e => updateProp(i,k,e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              ))}
            </div>
          ))}
          {properties.length < 100 && (
            <button onClick={addProp} className="w-full border-2 border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm hover:border-violet-400 hover:text-violet-500 transition">
              + Add Property
            </button>
          )}
        </Section>

        <Section id="faqs" title={`FAQs (${faqs.length}/20)`}>
          {faqs.map((f, i) => (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">FAQ {i+1}</span>
                <button onClick={() => removeFaq(i)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
              </div>
              {(['question','answer'] as ('question'|'answer')[]).map(k => (
                <div key={k}>
                  <label className="block text-[10px] text-gray-400 mb-0.5 capitalize">{k}</label>
                  <textarea value={f[k]} onChange={e => updateFaq(i,k,e.target.value)} rows={2}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                </div>
              ))}
            </div>
          ))}
          {faqs.length < 20 && (
            <button onClick={addFaq} className="w-full border-2 border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm hover:border-violet-400 hover:text-violet-500 transition">
              + Add FAQ
            </button>
          )}
        </Section>

        <Section id="boundaries" title={`Boundaries (${boundaries.length}/10)`}>
          {boundaries.map((b, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <span className="flex-1">{b}</span>
              {i > 0 && <button onClick={() => setBoundaries(boundaries.filter((_,j) => j!==i))} className="text-gray-400 hover:text-red-500">✕</button>}
              {i === 0 && <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">locked</span>}
            </div>
          ))}
          {boundaries.length < 10 && (
            <div className="flex gap-2">
              <input value={bdDraft} onChange={e => setBdDraft(e.target.value)} onKeyDown={e => e.key==='Enter' && addBoundary()}
                placeholder="e.g. Never discuss commission"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <button onClick={addBoundary} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
            </div>
          )}
        </Section>

        <Section id="sources" title="Lead Generator Sources">
          <p className="text-xs text-gray-400">Emails from these addresses/domains are automatically classified as leads.</p>
          {sources.map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <span className="flex-1">{s}</span>
              <button onClick={() => setSources(sources.filter((_,j) => j!==i))} className="text-gray-400 hover:text-red-500">✕</button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={sourceDraft} onChange={e => setSourceDraft(e.target.value)} onKeyDown={e => e.key==='Enter' && addSource()}
              placeholder="@propertyguru.com.sg"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            <button onClick={addSource} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
          </div>
        </Section>

      </main>
    </div>
  )
}
