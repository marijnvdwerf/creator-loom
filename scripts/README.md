# CreatorSMP VOD Fetcher

Script to fetch all Twitch VODs for CreatorSMP creators from November 11-30, 2024.

## Prerequisites

- Bun runtime installed
- Twitch application credentials (Client ID and Client Secret)

## Setup

1. Create a Twitch application at https://dev.twitch.tv/console/apps
2. Set the following environment variables:
   ```bash
   export TWITCH_CLIENT_ID="your_client_id"
   export TWITCH_CLIENT_SECRET="your_client_secret"
   ```

## Usage

Run the script with:

```bash
bun run scripts/fetch-vods.ts
```

Or using environment variables inline:

```bash
TWITCH_CLIENT_ID=xxx TWITCH_CLIENT_SECRET=yyy bun run scripts/fetch-vods.ts
```

## Output

The script will:
1. Fetch all creators from the CreatorSMP API
2. For each creator with a Twitch account:
   - Get their Twitch user ID
   - Fetch all VODs (archives) from November 11-30, 2024
3. Save results to `src/data/vods.json`

Output format:
```json
{
  "lastUpdated": "2024-11-14T...",
  "creators": [
    {
      "name": "Creator name",
      "twitchUsername": "username",
      "team": 0,
      "alive": true,
      "deathDate": null,
      "vods": [
        {
          "id": "video_id",
          "title": "stream title",
          "createdAt": "2024-11-11T13:15:00Z",
          "duration": "PT6H30M",
          "thumbnailUrl": "https://...",
          "viewCount": 12345
        }
      ]
    }
  ]
}
```

## Features

- **Rate limiting**: Respects Twitch API rate limits (800 req/min)
- **Error handling**: Continues processing other creators if one fails
- **Progress logging**: Shows real-time progress as it fetches
- **Date filtering**: Only fetches VODs from November 11-30, 2024
- **Pagination**: Automatically handles paginated responses from Twitch API
- **Type safety**: Full TypeScript type definitions

## Notes

- Creators without Twitch usernames are skipped
- Creators without any VODs in the date range will have an empty `vods` array
- The script uses Twitch's client credentials flow (app access token)
- Duration format follows ISO 8601 (e.g., "PT6H30M" = 6 hours 30 minutes)
