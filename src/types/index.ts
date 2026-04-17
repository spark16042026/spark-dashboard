export type Score = 'Scorching' | 'Hot' | 'Warm' | 'Cold'
export type LeadStatus = 'Not Started' | 'In Conversation' | 'Handed Off'
export type ManagedBy = 'ai' | 'human'
export type Channel = 'whatsapp' | 'sms'
export type NotificationType = 'score_change' | 'status_change' | 'leads_extracted'

export interface Lead {
  lead_id: string
  agent_id: string
  name: string
  phone: string
  email?: string
  property_interest?: string
  score: Score
  status: LeadStatus
  managed_by: ManagedBy
  ai_paused: boolean
  channel: Channel
  follow_up_count: number
  last_activity?: string
  created_at: string
}

export interface Message {
  message_id: string
  lead_id: string
  sender: 'ai' | 'human_agent' | 'lead'
  content: string
  direction: 'inbound' | 'outbound'
  whatsapp_message_id?: string
  metadata: {
    confidence?: number
    type?: string
    handoff_reason?: string
    channel?: string
  }
  timestamp: string
}

export interface Notification {
  notification_id: string
  agent_id: string
  lead_id?: string
  type: NotificationType
  title: string
  detail?: string
  is_read: boolean
  created_at: string
}

export interface Agent {
  agent_id: string
  name: string
  email: string
  phone?: string
  is_active: boolean
  memory_file?: Record<string, unknown>
}
