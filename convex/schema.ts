import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  creators: defineTable({
    name: v.string(),
    team: v.union(v.number(), v.null()),
    state: v.number(),
    avatarUrl: v.optional(v.string()),
    lastSeen: v.optional(v.string()),
    deathTime: v.optional(v.union(v.string(), v.null())),
    deathMessage: v.optional(v.union(v.string(), v.null())),
    deathClips: v.optional(v.array(v.string())),
    twitch: v.optional(v.string()),
    youtube: v.optional(v.string()),
    instagram: v.optional(v.string()),
    tiktok: v.optional(v.string()),
  }).index("by_name", ["name"]),

  twitch_vods: defineTable({
    id: v.string(),
    stream_id: v.optional(v.string()),
    user_id: v.string(),
    user_login: v.string(),
    user_name: v.string(),
    title: v.string(),
    description: v.string(),
    created_at: v.string(),
    published_at: v.string(),
    url: v.string(),
    thumbnail_url: v.string(),
    viewable: v.string(),
    view_count: v.number(),
    language: v.string(),
    type: v.string(),
    duration: v.string(),
    creatorId: v.id("creators"),
  }).index("by_creator", ["creatorId"]),
});
