export function TwitchPlayer() {
  return (
    <div className="h-full bg-[#0a0a0a] text-white p-4 flex flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Player</h2>
        <p className="text-sm text-muted-foreground">Click a VOD to start playback</p>
      </div>

      {/* Player placeholder */}
      <div className="flex-1 bg-[#141414] rounded border border-border flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">▶️</div>
          <p className="text-muted-foreground">No VOD selected</p>
        </div>
      </div>

      {/* Controls placeholder */}
      <div className="mt-4 p-3 bg-[#141414] rounded border border-border">
        <div className="text-xs font-mono text-muted-foreground">
          Current time: --:--:--
        </div>
      </div>
    </div>
  );
}
