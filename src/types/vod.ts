export interface VOD {
  id: string;
  title: string;
  createdAt: string;
  duration: string;
  thumbnailUrl: string;
  viewCount: number;
}

export interface Creator {
  name: string;
  twitchUsername: string;
  team: number;
  alive?: boolean;
  deathDate?: string | null;
  vods: VOD[];
}

export interface VODData {
  lastUpdated: string;
  creators: Creator[];
}
