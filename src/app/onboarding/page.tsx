'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const STEPS = ['Profile', 'Connect Email', 'Lead Sources', 'Properties', 'Tone & Style', 'Boundaries']
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

// ─────────────────────────────────────────────
// Individual step components
// ─────────────────────────────────────────────

function StepProfile({ data, onChange }: { data: Record<string,string>, onChange: (k:string,v:string)=>void }) {
  return (
    <div className="space-y-4">
      {[
        ['name', 'Full Name', 'text', 'Anne Lok'],
        ['title', 'Title', 'text', 'Senior Property Consultant'],
        ['agency', 'Agency', 'text', 'ERA Singapore'],
        ['license', 'CEA License No.', 'text', 'R012345G'],
        ['phone', 'Your WhatsApp number (for alerts)', 'tel', '+6591234567'],
      ].map(([k, label, type, placeholder]) => (
        <div key={k}>
          <label className="block text-sm font-medium mb-1">{label}</label>
          <input type={type} value={data[k] || ''} onChange={e => onChange(k, e.target.value)}
            placeholder={placeholder as string}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
      ))}
    </div>
  )
}

function StepConnectEmail({ agentId, gmailConnected }: { agentId: string, gmailConnected: boolean }) {
  const backendUrl = BACKEND?.replace(/\/$/, '')
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Connect your Gmail so Spark can read lead generator emails and extract new leads automatically.</p>
      {gmailConnected ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          ✓ Gmail connected
        </div>
      ) : (
        <a
          href={`${backendUrl}/auth/gmail/start?agent_id=${agentId}`}
          className="inline-block bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition"
        >
          🔗 Connect Gmail
        </a>
      )}
      <p className="text-xs text-gray-400">You can skip this step and connect Gmail later in Settings.</p>
    </div>
  )
}

function StepLeadSources({ sources, setSources }: { sources: string[], setSources: (s:string[])=>void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (v && !sources.includes(v)) setSources([...sources, v])
    setDraft('')
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Add email addresses or domains of your lead generators (e.g. <code className="bg-gray-100 px-1 rounded">@propertyguru.com.sg</code>).</p>
      <div className="flex gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key==='Enter' && add()}
          placeholder="noreply@propertyguru.com.sg or @99.co"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        <button onClick={add} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
      </div>
      <div className="space-y-2">
        {sources.map((s, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <span>{s}</span>
            <button onClick={() => setSources(sources.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

type Property = { name: string; type: string; location: string; price_range: string; key_selling_points: string; unit_types: string; available_units: string }
const EMPTY_PROP: Property = { name:'', type:'', location:'', price_range:'', key_selling_points:'', unit_types:'', available_units:'' }

function StepProperties({ properties, setProperties }: { properties: Property[], setProperties: (p:Property[])=>void }) {
  function update(i: number, k: keyof Property, v: string) {
    setProperties(properties.map((p, j) => j === i ? { ...p, [k]: v } : p))
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Add up to 100 properties you are marketing. You can add more later in Settings.</p>
      {properties.map((p, i) => (
        <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Property {i + 1}</span>
            <button onClick={() => setProperties(properties.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-sm">Remove</button>
          </div>
          {([['name','Project Name'],['type','Type (Condo/HDB/Landed)'],['location','Location'],['price_range','Price Range'],['key_selling_points','Key Selling Points (comma-separated)'],['unit_types','Unit Types (comma-separated)'],['available_units','Availability']] as [keyof Property, string][]).map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
              <input value={p[k]} onChange={e => update(i, k, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          ))}
        </div>
      ))}
      {properties.length < 100 && (
        <button onClick={() => setProperties([...properties, { ...EMPTY_PROP }])}
          className="w-full border-2 border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm hover:border-violet-400 hover:text-violet-500 transition">
          + Add Property
        </button>
      )}
    </div>
  )
}

function StepToneStyle({ tone, setTone, agentId, styleStats, setStyleStats }:
  { tone: Record<string,string>, setTone: (t:Record<string,string>)=>void,
    agentId: string, styleStats: {messages_parsed:number, examples_extracted:number} | null,
    setStyleStats: (s: {messages_parsed:number, examples_extracted:number} | null) => void }) {

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const backendUrl = BACKEND?.replace(/\/$/, '')

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${backendUrl}/agents/${agentId}/import-style`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setStyleStats(data)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {[
        ['style', 'Communication style', 'Friendly, warm, professional. Uses simple English.'],
        ['greeting', 'Greeting template', 'Hi {name}! I\'m Anne from ERA.'],
      ].map(([k, label, placeholder]) => (
        <div key={k}>
          <label className="block text-sm font-medium mb-1">{label}</label>
          <input value={tone[k] || ''} onChange={e => setTone({ ...tone, [k]: e.target.value })}
            placeholder={placeholder as string}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
      ))}
      <div>
        <label className="block text-sm font-medium mb-1">Emoji usage</label>
        <select value={tone.emoji_usage || 'moderate'} onChange={e => setTone({ ...tone, emoji_usage: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          {['none', 'light', 'moderate', 'heavy'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <label className="block text-sm font-medium mb-1">Import past WhatsApp conversations <span className="text-gray-400 font-normal">(optional)</span></label>
        <p className="text-xs text-gray-400 mb-2">Upload a .txt export from WhatsApp to teach the AI your exact tone and style.</p>
        <input type="file" accept=".txt" onChange={handleFileUpload} disabled={uploading}
          className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200" />
        {uploading && <p className="text-xs text-gray-400 mt-1">Processing…</p>}
        {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
        {styleStats && (
          <p className="text-xs text-green-600 mt-1">
            ✓ {styleStats.messages_parsed} messages parsed · {styleStats.examples_extracted} style examples curated
          </p>
        )}
      </div>
    </div>
  )
}

function StepBoundaries({ boundaries, setBoundaries }: { boundaries: string[], setBoundaries: (b:string[])=>void }) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (v) setBoundaries([...boundaries, v])
    setDraft('')
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Set rules the AI must always follow. The first rule is locked.</p>
      {boundaries.map((b, i) => (
        <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <span className="flex-1">{b}</span>
          {i > 0 && <button onClick={() => setBoundaries(boundaries.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">✕</button>}
        </div>
      ))}
      {boundaries.length < 10 && (
        <div className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key==='Enter' && add()}
            placeholder="e.g. Never discuss commission"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <button onClick={add} className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────

export default function OnboardingPage() {
  return <Suspense><OnboardingWizard /></Suspense>
}

function OnboardingWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [agentId, setAgentId] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [styleStats, setStyleStats] = useState<{messages_parsed:number, examples_extracted:number} | null>(null)

  // Form state
  const [profile, setProfile] = useState<Record<string,string>>({})
  const [leadSources, setLeadSources] = useState<string[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [tone, setTone] = useState<Record<string,string>>({})
  const [boundaries, setBoundaries] = useState(['Do not engage in conversations outside of property topics'])

  // Load existing agent — create row if first login
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const email = data.user.email!

      // Try to load existing agent row
      let { data: agent } = await supabase.from('agents').select('*').eq('email', email).single()

      // First login — no agent row yet, create one
      if (!agent) {
        const { data: created } = await supabase
          .from('agents')
          .insert({ email, name: email.split('@')[0], is_active: false })
          .select()
          .single()
        agent = created
      }

      if (agent) {
        setAgentId(agent.agent_id)
        setGmailConnected(!!agent.gmail_token)
        const mf = agent.memory_file || {}
        if (mf.agent) setProfile({ ...mf.agent, phone: agent.phone || '' })
        if (mf.tone) setTone(mf.tone)
        if (mf.properties) setProperties((mf.properties as Property[]).map(p => ({
          ...p,
          key_selling_points: Array.isArray(p.key_selling_points) ? (p.key_selling_points as unknown as string[]).join(', ') : p.key_selling_points || '',
          unit_types: Array.isArray(p.unit_types) ? (p.unit_types as unknown as string[]).join(', ') : p.unit_types || '',
        })))
        if (mf.boundaries) setBoundaries(mf.boundaries as string[])
        if (agent.lead_generator_senders) setLeadSources(agent.lead_generator_senders)
      }
    })
    // Check if Gmail just connected (callback redirect)
    if (searchParams.get('gmail') === 'connected') {
      setGmailConnected(true)
      setStep(2) // skip back to lead sources
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (!agentId) {
      alert('Agent not loaded yet — please wait a moment and try again.')
      return
    }
    setSaving(true)
    const memoryFile = {
      agent: { name: profile.name, title: profile.title, agency: profile.agency, license: profile.license },
      tone,
      properties: properties.map(p => ({
        ...p,
        key_selling_points: p.key_selling_points.split(',').map(s => s.trim()).filter(Boolean),
        unit_types: p.unit_types.split(',').map(s => s.trim()).filter(Boolean),
      })),
      boundaries,
    }
    await supabase.from('agents').update({
      name: profile.name,
      phone: profile.phone,
      memory_file: memoryFile,
      lead_generator_senders: leadSources,
      is_active: true,
    }).eq('agent_id', agentId)
    setSaving(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🚀</div>
          <h1 className="text-xl font-bold mb-2">Your AI agent is live!</h1>
          <p className="text-sm text-gray-500 mb-6">Spark will now monitor your inbox, engage leads, and notify you when action is needed.</p>
          <button onClick={() => router.push('/dashboard')}
            className="bg-violet-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium">
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold">✦ Set up your AI agent</h1>
          <p className="text-sm text-gray-500 mt-1">Step {step + 1} of {STEPS.length}</p>
        </div>

        {/* Stepper */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? 'bg-violet-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold mb-4">{STEPS[step]}</h2>

          {step === 0 && <StepProfile data={profile} onChange={(k, v) => setProfile({ ...profile, [k]: v })} />}
          {step === 1 && <StepConnectEmail agentId={agentId} gmailConnected={gmailConnected} />}
          {step === 2 && <StepLeadSources sources={leadSources} setSources={setLeadSources} />}
          {step === 3 && <StepProperties properties={properties} setProperties={setProperties} />}
          {step === 4 && <StepToneStyle tone={tone} setTone={setTone} agentId={agentId} styleStats={styleStats} setStyleStats={setStyleStats} />}
          {step === 5 && <StepBoundaries boundaries={boundaries} setBoundaries={setBoundaries} />}

          <div className="flex justify-between mt-8">
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/')}
              className="text-sm text-gray-500 hover:text-gray-800 transition"
            >
              {step === 0 ? 'Cancel' : '← Back'}
            </button>

            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)}
                className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium">
                Continue →
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving || !agentId}
                className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Launching…' : '🚀 Launch AI Agent'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
