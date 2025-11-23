import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { getDb } from '@/db/client'
import { creators } from '@/db/schema'
import { isNotNull } from 'drizzle-orm'

// Twitch API constants
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TWITCH_API_BASE = 'https://api.twitch.tv/helix'

// Types
interface TwitchStream {
  id: string
  user_id: string
  user_login: string
  user_name: string
  game_id: string
  game_name: string
  type: 'live' | ''
  title: string
  viewer_count: number
  started_at: string
  language: string
  thumbnail_url: string
  tag_ids: string[]
  is_mature: boolean
}

interface StreamsResponse {
  data: TwitchStream[]
  pagination?: { cursor?: string }
}

interface LiveCreator {
  id: number
  name: string
  twitch: string
  team: number | null
  stream: TwitchStream
}

// Get Twitch OAuth token
async function getAppAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  const response = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to get access token: ${response.statusText} - ${body}`)
  }

  const data = await response.json()
  return data.access_token
}

// Convert Twitch usernames to user IDs
async function getUserIds(
  usernames: string[],
  token: string,
  clientId: string
): Promise<Map<string, string>> {
  const userIdMap = new Map<string, string>()

  // Batch usernames into groups of 100 (API limit)
  const batchSize = 100
  for (let i = 0; i < usernames.length; i += batchSize) {
    const batch = usernames.slice(i, i + batchSize)
    const params = batch.map(u => `login=${encodeURIComponent(u)}`).join('&')
    const url = `${TWITCH_API_BASE}/users?${params}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
    })

    if (!response.ok) {
      console.error(`Failed to get user IDs: ${response.statusText}`)
      continue
    }

    const data = await response.json()
    for (const user of data.data) {
      userIdMap.set(user.login.toLowerCase(), user.id)
    }
  }

  return userIdMap
}

// Get live streams for multiple user IDs
async function getLiveStreams(
  userIds: string[],
  token: string,
  clientId: string
): Promise<TwitchStream[]> {
  if (userIds.length === 0) return []

  const allStreams: TwitchStream[] = []

  // Batch user IDs into groups of 100 (API limit)
  const batchSize = 100
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize)
    const params = batch.map(id => `user_id=${id}`).join('&')
    const url = `${TWITCH_API_BASE}/streams?${params}&first=100`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch streams: ${response.statusText}`)
      continue
    }

    const data: StreamsResponse = await response.json()
    allStreams.push(...data.data)
  }

  return allStreams
}

// Simple in-memory cache
const cache: { data: LiveCreator[] | null; timestamp: number } = {
  data: null,
  timestamp: 0,
}
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

// Server function with caching
const getLiveCreators = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LiveCreator[]> => {
    const now = Date.now()

    // Check if cache is still valid
    if (cache.data && now - cache.timestamp < CACHE_DURATION) {
      console.log('Returning cached live streams data')
      return cache.data
    }

    console.log('Fetching fresh live streams data from Twitch API')

    const clientId = process.env.TWITCH_CLIENT_ID
    const clientSecret = process.env.TWITCH_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('Missing Twitch credentials')
    }

    // Get OAuth token
    const token = await getAppAccessToken(clientId, clientSecret)

    // Get all creators with Twitch usernames and team info
    const db = getDb()
    const creatorsData = await db
      .select({
        id: creators.id,
        name: creators.name,
        twitch: creators.twitch,
        team: creators.team,
      })
      .from(creators)
      .where(isNotNull(creators.twitch))
      .all()

    if (creatorsData.length === 0) {
      cache.data = []
      cache.timestamp = now
      return []
    }

    // Convert usernames to user IDs
    const usernames = creatorsData.map(c => c.twitch!.toLowerCase())
    const userIdMap = await getUserIds(usernames, token, clientId)

    // Get user IDs that were successfully resolved
    const userIds = Array.from(userIdMap.values())

    // Fetch live streams
    const liveStreams = await getLiveStreams(userIds, token, clientId)

    // Join creators with their live streams (all games)
    const liveCreators: LiveCreator[] = []
    for (const creator of creatorsData) {
      const userId = userIdMap.get(creator.twitch!.toLowerCase())
      if (!userId) continue

      const stream = liveStreams.find(s => s.user_id === userId)
      if (stream) {
        liveCreators.push({
          id: creator.id,
          name: creator.name,
          twitch: creator.twitch!,
          team: creator.team,
          stream,
        })
      }
    }

    // Sort: Minecraft team players first, then Minecraft non-team, then non-Minecraft
    liveCreators.sort((a, b) => {
      const aIsMinecraft = a.stream.game_name.toLowerCase().includes('minecraft')
      const bIsMinecraft = b.stream.game_name.toLowerCase().includes('minecraft')
      const aHasTeam = (a.team === 0 || a.team === 1) && aIsMinecraft
      const bHasTeam = (b.team === 0 || b.team === 1) && bIsMinecraft

      // Minecraft with team first
      if (aHasTeam && !bHasTeam) return -1
      if (!aHasTeam && bHasTeam) return 1

      // Then Minecraft without team
      if (aIsMinecraft && !bIsMinecraft) return -1
      if (!aIsMinecraft && bIsMinecraft) return 1

      // Within same category, sort by viewer count
      return b.stream.viewer_count - a.stream.viewer_count
    })

    // Update cache
    cache.data = liveCreators
    cache.timestamp = now

    return liveCreators
  }
)

// Query options with auto-refresh
export const liveCreatorsQueryOptions = queryOptions({
  queryKey: ['live-creators'],
  queryFn: () => getLiveCreators(),
  refetchInterval: 60000, // 1 minute
  refetchIntervalInBackground: true,
  staleTime: 60 * 1000,
})

// Route definition
export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    return await context.queryClient.ensureQueryData(liveCreatorsQueryOptions)
  },
  component: LivePage,
})

function LivePage() {
  // Use suspense query with auto-refresh
  const { data: liveCreators, isFetching } = useSuspenseQuery(liveCreatorsQueryOptions)

  // Thumbnail refresh timestamp (only when tab is active)
  const [thumbnailRefresh, setThumbnailRefresh] = useState(Date.now())

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Refresh thumbnails when tab becomes active
        setThumbnailRefresh(Date.now())
      }
    }

    // Update thumbnails every minute when tab is active
    const interval = setInterval(() => {
      if (!document.hidden) {
        setThumbnailRefresh(Date.now())
      }
    }, 60000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (liveCreators.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-600 text-xl font-mono">// No streams</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Subtle loading indicator */}
      {isFetching && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-zinc-800 px-3 py-1 rounded text-xs text-zinc-400 animate-pulse">
            Updating...
          </div>
        </div>
      )}
      {/* Background split effect */}
      <div className="fixed inset-0 flex">
        {/* Ice side */}
        <div className="flex-1 bg-gradient-to-br from-cyan-950 via-blue-950 to-black opacity-30">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3lhbiIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40" />
        </div>
        {/* Fire side */}
        <div className="flex-1 bg-gradient-to-bl from-red-950 via-orange-950 to-black opacity-30">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0ib3JhbmdlIiBzdHJva2Utb3BhY2l0eT0iMC4xIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
        </div>
      </div>

      {/* Floating particles */}
      <div className="fixed inset-0 pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-sm opacity-20"
            style={{
              width: Math.random() * 6 + 2 + 'px',
              height: Math.random() * 6 + 2 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              background: i % 2 === 0 ? '#06b6d4' : '#f97316',
              animationDelay: Math.random() * 8 + 's',
              animationDuration: Math.random() * 15 + 10 + 's',
              animation: 'drift linear infinite',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 min-h-screen flex items-center">
        <div className="max-w-[1800px] mx-auto w-full">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {liveCreators.map((creator, index) => {
              const thumbnailUrl = creator.stream.thumbnail_url
                .replace('{width}', '720')
                .replace('{height}', '405') + `?t=${thumbnailRefresh}`

              const isMinecraft = creator.stream.game_name.toLowerCase().includes('minecraft')
              const isNoord = creator.team === 0 && isMinecraft // Ice
              const isZuid = creator.team === 1 && isMinecraft // Fire

              // Calculate uptime
              const startTime = new Date(creator.stream.started_at)
              const now = new Date()
              const uptimeMs = now.getTime() - startTime.getTime()
              const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60))
              const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60))
              const uptimeStr = `${uptimeHours.toString().padStart(2, '0')}:${uptimeMinutes.toString().padStart(2, '0')}`

              return (
                <a
                  key={creator.id}
                  href={`https://twitch.tv/${creator.twitch}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block w-full"
                  style={{
                    animationDelay: `${index * 80}ms`,
                    transformOrigin: 'center center',
                  }}
                >
                  <div className="relative overflow-hidden group-hover:scale-105 transition-transform duration-150">
                    {/* Main image */}
                    <div className="aspect-video relative">
                      <img
                        src={thumbnailUrl}
                        alt={creator.stream.title}
                        className="w-full h-full object-cover"
                      />

                      {/* Team overlays */}
                      {isNoord && (
                        <>
                          {/* Heavy ice overlay */}
                          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/60 via-blue-600/40 to-cyan-400/50 mix-blend-multiply" />
                          <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/80 via-transparent to-cyan-900/40" />

                          {/* Animated ice crystals */}
                          <div className="absolute inset-0 overflow-hidden">
                            {[...Array(12)].map((_, i) => (
                              <div
                                key={i}
                                className="absolute bg-cyan-200/60 blur-[2px] animate-float-slow"
                                style={{
                                  width: Math.random() * 8 + 3 + 'px',
                                  height: Math.random() * 8 + 3 + 'px',
                                  left: Math.random() * 100 + '%',
                                  top: Math.random() * 100 + '%',
                                  animationDelay: Math.random() * 4 + 's',
                                  boxShadow: '0 0 10px rgba(6,182,212,0.8)',
                                }}
                              />
                            ))}
                          </div>

                          {/* Border effects - less strong, more intense on hover */}
                          <div className="absolute inset-0 border-4 border-cyan-400/30 group-hover:border-cyan-400/60 shadow-[inset_0_0_30px_rgba(6,182,212,0.3)] group-hover:shadow-[inset_0_0_30px_rgba(6,182,212,0.5)] transition-all duration-150" />
                          <div className="absolute inset-0 border-2 border-blue-300/20 group-hover:border-blue-300/40 transition-all duration-150" />
                        </>
                      )}

                      {isZuid && (
                        <>
                          {/* Heavy fire overlay */}
                          <div className="absolute inset-0 bg-gradient-to-br from-orange-600/60 via-red-600/40 to-orange-500/50 mix-blend-multiply" />
                          <div className="absolute inset-0 bg-gradient-to-t from-red-950/80 via-transparent to-orange-900/40" />

                          {/* Animated fire particles */}
                          <div className="absolute inset-0 overflow-hidden">
                            {[...Array(12)].map((_, i) => (
                              <div
                                key={i}
                                className="absolute bg-orange-300/70 blur-[2px] animate-float-slow"
                                style={{
                                  width: Math.random() * 8 + 3 + 'px',
                                  height: Math.random() * 8 + 3 + 'px',
                                  left: Math.random() * 100 + '%',
                                  top: Math.random() * 100 + '%',
                                  animationDelay: Math.random() * 4 + 's',
                                  boxShadow: '0 0 10px rgba(234,88,12,0.9)',
                                }}
                              />
                            ))}
                          </div>

                          {/* Border effects - less strong, more intense on hover */}
                          <div className="absolute inset-0 border-4 border-orange-500/30 group-hover:border-orange-500/60 shadow-[inset_0_0_30px_rgba(234,88,12,0.3)] group-hover:shadow-[inset_0_0_30px_rgba(234,88,12,0.5)] transition-all duration-150" />
                          <div className="absolute inset-0 border-2 border-red-400/20 group-hover:border-red-400/40 transition-all duration-150" />
                        </>
                      )}

                      {!isNoord && !isZuid && (
                        <>
                          {/* Boring slate treatment */}
                          <div className="absolute inset-0 bg-zinc-900/40" />
                          <div className="absolute inset-0 border-2 border-zinc-700/30 group-hover:border-zinc-600/50 transition-all duration-150" />
                        </>
                      )}
                    </div>

                    {/* Text overlay - gradient from transparent to team color */}
                    <div className="absolute bottom-0 left-0 right-0 p-3"
                      style={{
                        background: isNoord
                          ? 'linear-gradient(to top, rgba(6,182,212,0.6), rgba(6,182,212,0.3), transparent)'
                          : isZuid
                          ? 'linear-gradient(to top, rgba(234,88,12,0.6), rgba(234,88,12,0.3), transparent)'
                          : 'linear-gradient(to top, rgba(63,63,70,0.5), rgba(63,63,70,0.2), transparent)'
                      }}
                    >
                      <div className="text-lg font-black text-white tracking-tight drop-shadow-lg">
                        {creator.name}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="text-[10px] text-white truncate flex-1">
                          {creator.stream.title}
                        </div>
                        <div className="text-[10px] font-mono text-white tabular-nums flex-shrink-0">
                          {uptimeStr}
                        </div>
                      </div>
                    </div>

                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes drift {
          0% {
            transform: translate(0, 0) rotate(0deg);
          }
          100% {
            transform: translate(-100vw, 100vh) rotate(360deg);
          }
        }

        @keyframes float-slow {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-40px) translateX(20px);
            opacity: 1;
          }
        }

        .animate-float-slow {
          animation: float-slow ease-in-out infinite;
          animation-duration: 6s;
        }
      `}</style>
    </div>
  )
}
