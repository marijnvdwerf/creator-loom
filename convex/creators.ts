import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const upsert = internalMutation({
  args: {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find existing creator by name
    const existing = await ctx.db
      .query("creators")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      // Update existing creator
      await ctx.db.patch(existing._id, args);
    } else {
      // Insert new creator
      await ctx.db.insert("creators", args);
    }

    return null;
  },
});
