import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const creators = sqliteTable('creators', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  team: integer('team'),
  state: integer('state').notNull(),
  avatarUrl: text('avatar_url'),
  lastSeen: text('last_seen'),
  deathTime: text('death_time'),
  deathMessage: text('death_message'),
  deathClips: text('death_clips'), // JSON string array
  twitch: text('twitch'),
  youtube: text('youtube'),
  instagram: text('instagram'),
  tiktok: text('tiktok'),
}, (table) => ({
  nameIdx: index('creator_name_idx').on(table.name),
}))

export const twitchVods = sqliteTable('twitch_vods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vodId: text('vod_id').notNull().unique(), // Twitch's video ID
  streamId: text('stream_id'),
  userId: text('user_id').notNull(),
  userLogin: text('user_login').notNull(),
  userName: text('user_name').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdAt: integer('created_at').notNull(), // timestamp in ms
  publishedAt: text('published_at').notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  viewable: text('viewable').notNull(),
  viewCount: integer('view_count').notNull(),
  language: text('language').notNull(),
  type: text('type').notNull(),
  duration: text('duration').notNull(),
  creatorId: integer('creator_id').notNull().references(() => creators.id),
}, (table) => ({
  creatorIdx: index('vod_creator_idx').on(table.creatorId),
  createdAtIdx: index('vod_created_at_idx').on(table.createdAt),
  vodIdIdx: index('vod_id_idx').on(table.vodId),
}))

export const twitchClips = sqliteTable('twitch_clips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clipId: text('clip_id').notNull().unique(), // Twitch's clip ID
  url: text('url').notNull(),
  embedUrl: text('embed_url').notNull(),
  broadcasterId: text('broadcaster_id').notNull(),
  broadcasterName: text('broadcaster_name').notNull(),
  creatorIdTwitch: text('creator_id_twitch').notNull(), // Twitch's creator ID
  creatorName: text('creator_name').notNull(),
  title: text('title').notNull(),
  language: text('language').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  viewCount: integer('view_count').notNull(),
  createdAt: integer('created_at').notNull(), // timestamp in ms
  videoId: text('video_id'),
  vodOffset: integer('vod_offset'),
  duration: integer('duration').notNull(),
  vodId: integer('vod_id').references(() => twitchVods.id),
  creatorId: integer('creator_id').notNull().references(() => creators.id),
}, (table) => ({
  creatorIdx: index('clip_creator_idx').on(table.creatorId),
  createdAtIdx: index('clip_created_at_idx').on(table.createdAt),
  clipIdIdx: index('clip_id_idx').on(table.clipId),
}))
