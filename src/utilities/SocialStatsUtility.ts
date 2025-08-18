import { UtilityBase, type UtilityResult } from './UtilityBase';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

interface SocialStats {
  youtube: number;
  twitter: number;
  instagram: number;
  tiktok: number;
}

export class SocialStatsUtility extends UtilityBase {
  constructor() {
    super({
      id: 'social-stats',
      name: 'Social Media Stats',
      description: 'Display follower counts from social platforms',
      icon: '📊',
      refreshIntervalMs: 300000, // Refresh every 5 minutes
    });
  }

  async fetchData(): Promise<UtilityResult> {
    // TODO: Replace with real API calls
    const stats = await this.fetchSocialStats();

    const grid = this.createEmptyGrid();

    // Create a visual representation of social stats
    this.renderSocialStats(grid, stats);

    return {
      success: true,
      gridData: grid,
      metadata: { stats }
    };
  }

  private async fetchSocialStats(): Promise<SocialStats> {
    // Stub implementation - replace with real API calls
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API delay

    return {
      youtube: Math.floor(Math.random() * 100000) + 50000,
      twitter: Math.floor(Math.random() * 50000) + 10000,
      instagram: Math.floor(Math.random() * 25000) + 5000,
      tiktok: Math.floor(Math.random() * 75000) + 15000,
    };
  }

  private renderSocialStats(grid: any[], stats: SocialStats): void {
    const maxFollowers = Math.max(stats.youtube, stats.twitter, stats.instagram, stats.tiktok);

    // Colors for each platform
    const colors = {
      youtube: '#FF0000',
      twitter: '#1DA1F2',
      instagram: '#E4405F',
      tiktok: '#000000'
    };

    // Draw bars representing follower counts
    const barWidth = Math.floor(GRID_WIDTH / 4) - 2;
    const maxBarHeight = GRID_HEIGHT - 10;

    const platforms = [
      { name: 'youtube', count: stats.youtube, x: 2 },
      { name: 'twitter', count: stats.twitter, x: 2 + barWidth + 3 },
      { name: 'instagram', count: stats.instagram, x: 2 + (barWidth + 3) * 2 },
      { name: 'tiktok', count: stats.tiktok, x: 2 + (barWidth + 3) * 3 }
    ];

    platforms.forEach(platform => {
      const barHeight = Math.floor((platform.count / maxFollowers) * maxBarHeight);
      const startY = GRID_HEIGHT - barHeight - 2;

      this.drawRect(
        grid,
        platform.x,
        startY,
        barWidth,
        barHeight,
        colors[platform.name as keyof typeof colors]
      );

      // Add platform label (first letter)
      const labelY = GRID_HEIGHT - 1;
      this.setPixel(grid, platform.x + Math.floor(barWidth/2), labelY, colors[platform.name as keyof typeof colors]);
    });

    // Add title at top
    this.drawText(grid, 'SOCIAL', 2, 1, '#FFFFFF', 1);
  }
}
