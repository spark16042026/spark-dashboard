'use client'

import { useEffect, useRef } from 'react'
import { Message } from '@/types'

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-SG', {
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function Bubble({ msg }: { msg: Message }) {
  const isLead = msg.sender === 'lead'
  const isAI = msg.sender === 'ai'

  return (
    <div className={`flex ${isLead ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[75%] ${isLead ? 'order-2' : ''}`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
            isLead
              ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
              : isAI
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-green-500 text-white rounded-tr-sm'
          }`}
        >
          {msg.content}
        </div>
        <div className={`flex gap-2 mt-0.5 text-[10px] text-gray-400 ${isLead ? '' : 'justify-end'}`}>
          <span>{formatTime(msg.timestamp)}</span>
          {!isAI && !isLead && <span className="text-green-400">You</span>}
        </div>
      </div>
    </div>
  )
}

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[10px] text-gray-400 px-2">{date}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

export default function ConversationView({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        No messages yet.
      </div>
    )
  }

  let lastDate = ''
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {messages.map((msg) => {
        const date = formatDate(msg.timestamp)
        const showDivider = date !== lastDate
        lastDate = date
        return (
          <div key={msg.message_id}>
            {showDivider && <DateDivider date={date} />}
            <Bubble msg={msg} />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
