import { UtilityBase, type UtilityResult } from './UtilityBase';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

interface BuildStatus {
  project: string;
  status: 'success' | 'failed' | 'building' | 'pending';
  duration?: number; // in seconds
  timestamp: Date;
}

interface BuildStats {
  builds: BuildStatus[];
  successRate: number;
  avgDuration: number;
}

export class BuildStatusUtility extends UtilityBase {
  constructor() {
    super({
      id: 'build-status',
      name: 'Build Status',
      description: 'Display CI/CD build status and history',
      icon: '🚀',
      refreshIntervalMs: 60000, // Refresh every minute
    });
  }

  async fetchData(): Promise<UtilityResult> {
    // TODO: Replace with real CI/CD API calls (GitHub Actions, Jenkins, etc.)
    const stats = await this.fetchBuildStats();

    const grid = this.createEmptyGrid();

    // Create a build status visualization
    this.renderBuildStatus(grid, stats);

    return {
      success: true,
      gridData: grid,
      metadata: {
        successRate: stats.successRate,
        avgDuration: stats.avgDuration,
        totalBuilds: stats.builds.length
      }
    };
  }

  private async fetchBuildStats(): Promise<BuildStats> {
    // Stub implementation - replace with real CI/CD API
    await new Promise(resolve => setTimeout(resolve, 120)); // Simulate API delay

    const builds: BuildStatus[] = [];
    const projects = ['frontend', 'backend', 'mobile', 'docs'];
    const statuses: BuildStatus['status'][] = ['success', 'failed', 'building', 'pending'];

    // Generate recent build history
    for (let i = 0; i < 20; i++) {
      const timestamp = new Date();
      timestamp.setHours(timestamp.getHours() - i);

      builds.push({
        project: projects[Math.floor(Math.random() * projects.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        duration: Math.floor(Math.random() * 300) + 30,
        timestamp
      });
    }

    const successCount = builds.filter(b => b.status === 'success').length;
    const successRate = (successCount / builds.length) * 100;
    const avgDuration = builds
      .filter(b => b.duration)
      .reduce((sum, b) => sum + (b.duration || 0), 0) / builds.length;

    return {
      builds,
      successRate,
      avgDuration
    };
  }

  private renderBuildStatus(grid: any[], stats: BuildStats): void {
    // Status colors
    const statusColors = {
      success: '#22C55E',   // Green
      failed: '#EF4444',    // Red
      building: '#F59E0B',  // Amber
      pending: '#64748B'    // Gray
    };

    // Draw title
    this.drawText(grid, 'BUILDS', 2, 1, '#FFFFFF', 1);

    // Draw recent builds as a timeline (last 20 builds)
    const recentBuilds = stats.builds.slice(0, Math.min(20, GRID_WIDTH - 4));

    for (let i = 0; i < recentBuilds.length; i++) {
      const build = recentBuilds[i];
      const x = 2 + i;
      const color = statusColors[build.status];

      // Draw build status as a vertical bar
      const barHeight = build.status === 'success' ? 8 :
                      build.status === 'failed' ? 6 :
                      build.status === 'building' ? 4 : 2;

      this.drawRect(grid, x, GRID_HEIGHT - barHeight - 2, 1, barHeight, color);
    }

    // Draw success rate indicator
    const successRateHeight = Math.floor((stats.successRate / 100) * 10);
    this.drawRect(grid, GRID_WIDTH - 3, GRID_HEIGHT - successRateHeight - 2, 2, successRateHeight, '#22C55E');

    // Add legend
    this.setPixel(grid, 1, GRID_HEIGHT - 2, statusColors.success);
    this.setPixel(grid, 1, GRID_HEIGHT - 4, statusColors.failed);
    this.setPixel(grid, 1, GRID_HEIGHT - 6, statusColors.building);
    this.setPixel(grid, 1, GRID_HEIGHT - 8, statusColors.pending);
  }
}
