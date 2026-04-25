/**
 * useChatHub — Phase 6F Track F2
 * SignalR hub for real-time chat. Connects on auth, disconnects on logout.
 * Reconnection with exponential backoff via SignalR's withAutomaticReconnect.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { auth } from '@/lib/firebase'
import { useQueryClient } from '@tanstack/react-query'

const HUB_URL = `${import.meta.env.VITE_API_BASE_URL ?? '/api'}/hubs/chat`.replace(/\/api\/hubs/, '/hubs')

interface HubMessage {
  messageId: string
  threadId: string
  senderUserId: string
  body: string
  createdAt: string
}

interface TypingEvent {
  threadId: string
  userId: string
}

interface UseChatHubOptions {
  onMessage?: (msg: HubMessage) => void
  onTyping?: (evt: TypingEvent) => void
}

export function useChatHub({ onMessage, onTyping }: UseChatHubOptions = {}) {
  const connectionRef = useRef<signalR.HubConnection | null>(null)
  const queryClient = useQueryClient()
  const [connectionState, setConnectionState] = useState<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected)

  const onMessageRef = useRef(onMessage)
  const onTypingRef = useRef(onTyping)
  onMessageRef.current = onMessage
  onTypingRef.current = onTyping

  useEffect(() => {
    let isMounted = true

    const connect = async () => {
      if (connectionRef.current) return

      const connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, {
          accessTokenFactory: async () => {
            const user = auth.currentUser
            if (!user) return ''
            return await user.getIdToken()
          },
        })
        .withAutomaticReconnect([0, 1000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build()

      connection.on('MessageReceived', (msg: HubMessage) => {
        if (!isMounted) return
        onMessageRef.current?.(msg)
        // Invalidate thread queries so inbox updates
        void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] })
        void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', msg.threadId] })
      })

      connection.on('TypingIndicator', (evt: TypingEvent) => {
        if (!isMounted) return
        onTypingRef.current?.(evt)
      })

      connection.onreconnecting(() => {
        if (!isMounted) return
        setConnectionState(signalR.HubConnectionState.Reconnecting)
      })

      connection.onreconnected(() => {
        if (!isMounted) return
        setConnectionState(signalR.HubConnectionState.Connected)
      })

      connection.onclose(() => {
        if (!isMounted) return
        setConnectionState(signalR.HubConnectionState.Disconnected)
      })

      try {
        await connection.start()
        if (!isMounted) {
          await connection.stop()
          return
        }
        setConnectionState(signalR.HubConnectionState.Connected)
        connectionRef.current = connection
      } catch (err) {
        console.warn('[ChatHub] Failed to connect:', err)
        setConnectionState(signalR.HubConnectionState.Disconnected)
      }
    }

    // Connect when Firebase auth is ready
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        void connect()
      } else {
        void disconnect()
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
      void disconnect()
    }
  }, [queryClient])

  const disconnect = async () => {
    const conn = connectionRef.current
    if (conn && conn.state !== signalR.HubConnectionState.Disconnected) {
      await conn.stop()
    }
    connectionRef.current = null
  }

  const joinThread = useCallback(async (threadId: string) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      try {
        await connectionRef.current.invoke('JoinThread', threadId)
      } catch {
        // Hub may not support explicit join — server side uses groups
      }
    }
  }, [])

  const leaveThread = useCallback(async (threadId: string) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      try {
        await connectionRef.current.invoke('LeaveThread', threadId)
      } catch {
        // Optional
      }
    }
  }, [])

  return {
    connectionState,
    isConnected: connectionState === signalR.HubConnectionState.Connected,
    joinThread,
    leaveThread,
  }
}
