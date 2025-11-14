export function Timeline() {
  return (
    <div className="h-full bg-[#0a0a0a] text-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">CreatorSMP Timeline</h2>
        <p className="text-sm text-muted-foreground">November 11-30, 2024</p>
      </div>

      {/* Time ruler placeholder */}
      <div className="h-8 bg-[#141414] border-b border-border mb-2">
        <div className="flex items-center h-full px-2 text-xs font-mono text-muted-foreground">
          13:00 | 15:00 | 17:00 | 19:00 | 21:00 | 23:00
        </div>
      </div>

      {/* Team sections placeholder */}
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-blue-400 mb-2">TEAM 0 (Alive: 40)</h3>
          <div className="space-y-1">
            {['Izza', 'Player2', 'Player3'].map((name) => (
              <div key={name} className="h-8 bg-[#141414] border-l-2 border-blue-500 px-2 flex items-center text-sm">
                <span className="w-16">{name}</span>
                <div className="flex-1 ml-4">
                  <div className="h-6 bg-[#2a2a2a] rounded w-32 border border-border"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-2">TEAM 1 (Alive: 35)</h3>
          <div className="space-y-1">
            {['Streamer5', 'Streamer6'].map((name) => (
              <div key={name} className="h-8 bg-[#141414] border-l-2 border-red-500 px-2 flex items-center text-sm">
                <span className="w-16">{name}</span>
                <div className="flex-1 ml-4">
                  <div className="h-6 bg-[#2a2a2a] rounded w-40 border border-border"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
