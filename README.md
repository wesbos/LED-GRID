# LED Grid Party

Real-time collaborative LED grid drawing with WLED integration and data utilities.

## Features

- **Multi-user drawing** - Real-time collaborative pixel art
- **WLED integration** - WebSocket/HTTP support with automatic chunking
- **Multi-room support** - Switch between different drawing rooms
- **Data utilities** - Display GitHub contributions, social stats, build status
- **Modern UI** - React frontend with dark blue theme

## Quick Start

```bash
npm install
npm run dev
```

- **Frontend**: http://localhost:5556
- **Admin**: http://localhost:5556/admin
- **Rooms**: http://localhost:5556/room1, /room2, etc.

## Configuration

### WLED Setup

Update `src/wled/wled.ts`:

```typescript
const baseUrl = "http://YOUR_WLED_IP";
export const wled = new WledGridClient({
  baseUrl,
  gridWidth: GRID_WIDTH,
  gridHeight: GRID_HEIGHT,
  useWebSocket: true, // or false for HTTP only
});
```

### Grid Size

Update `src/constants.ts`:

```typescript
export const GRID_WIDTH = 48; // Your LED matrix width
export const GRID_HEIGHT = 48; // Your LED matrix height
```

## Architecture

### Frontend (React)

- **Drawing**: Click/drag to draw, color picker, text input
- **Real-time**: WebSocket sync via PartyKit
- **Routing**: Simple client-side routing

### Backend (PartyKit/Cloudflare Workers)

- **Room management**: Multiple drawing rooms
- **WLED sync**: Optimized chunking for WebSocket (1.4kB) vs HTTP (5kB)
- **Utilities**: Pluggable data display system

### WLED Integration

- **Transport**: Auto-selects WebSocket (<300 pixels) or HTTP (>300 pixels)
- **Chunking**: Respects WLED buffer limits
- **Fallback**: HTTP backup if WebSocket fails

## Data Utilities

### GitHub Contributions

- **API**: `github-contributions-api.jogruber.de/v4/{username}`
- **Display**: 4-year contribution graph (2022-2025)
- **Update**: Hourly refresh

### Social Stats (Stub)

- **Sources**: YouTube, Twitter, Instagram, TikTok followers
- **Display**: Bar chart visualization
- **Update**: 5-minute refresh

### Build Status (Stub)

- **Sources**: CI/CD build status
- **Display**: Timeline with status colors
- **Update**: 1-minute refresh

## Usage

### Drawing

1. Visit main page or create room: `/room1`
2. Select color and draw
3. Type text to render with bitmap font
4. Drag images to auto-convert

### Admin

1. Visit `/admin`
2. Switch active room (controls LED display)
3. Run data utilities on active room
4. Monitor room connections

### Adding Utilities

```typescript
// 1. Create utility class
class MyUtility extends UtilityBase {
  async fetchData(): Promise<UtilityResult> {
    // Fetch your data
    // Return grid visualization
  }
}

// 2. Register in server.ts
this.utilityManager.registerUtility(new MyUtility());
```
