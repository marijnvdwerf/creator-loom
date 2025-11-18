export type TwitchVod = {
  _id: string
  id: string
  stream_id: string | null
  user_id: string
  user_login: string
  user_name: string
  title: string
  description: string
  created_at: number
  published_at: string | null
  url: string
  thumbnail_url: string
  viewable: string
  view_count: number
  language: string
  type: string
  duration: string
  creatorId: number
}

export type Creator = {
  _id: string
  id: number
  name: string
  team: number | null
  state: number
  avatarUrl: string | null
  lastSeen: string | null
  deathTime: string | null
  deathMessage: string | null
  deathClips?: string[]
  twitch: string | null
  youtube: string | null
  instagram: string | null
  tiktok: string | null
  vods: TwitchVod[]
}
