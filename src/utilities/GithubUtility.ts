import { UtilityBase, type UtilityResult } from './UtilityBase';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

interface Contribution {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface GitHubResponse {
  total: {
    [year: number]: number;
    [year: string]: number;
  };
  contributions: Array<Contribution>;
}

interface GitHubStats {
  contributions: Contribution[];
  totalContributions: number;
  currentStreak: number;
  yearlyData: {
    [year: number]: {
      contributions: Contribution[];
      total: number;
    };
  };
}

export class GitHubUtility extends UtilityBase {
  private username: string;

  constructor(username = 'wesbos') {
    super({
      id: 'github-contributions',
      name: 'GitHub Contributions',
      description: 'Display GitHub contribution graph',
      icon: '📈',
      refreshIntervalMs: 3600000, // Refresh every hour
    });
    this.username = username;
  }

  async fetchData(): Promise<UtilityResult> {
    // TODO: Replace with real GitHub API calls
    const stats = await this.fetchGitHubStats();

    const grid = this.createEmptyGrid();

    // Create a contribution graph visualization
    this.renderContributionGraph(grid, stats);

    return {
      success: true,
      gridData: grid,
      metadata: {
        totalContributions: stats.totalContributions,
        currentStreak: stats.currentStreak
      }
    };
  }

        private async fetchGitHubStats(): Promise<GitHubStats> {
    try {
      const currentYear = new Date().getFullYear();
      const yearsToFetch = [2021, 2022, 2023, 2024, currentYear]; // Show last 5 years

      // Fetch data for multiple years
      const yearlyData: { [year: number]: { contributions: Contribution[]; total: number } } = {};
      let allContributions: Contribution[] = [];
      let totalContributions = 0;

      for (const year of yearsToFetch) {
        try {
          const url = `https://github-contributions-api.jogruber.de/v4/${this.username}?y=${year}`;
          console.log(`Fetching data for ${url}`);
          const response = await fetch(url);

          if (response.ok) {
            const data: GitHubResponse = await response.json();
            yearlyData[year] = {
              contributions: data.contributions,
              total: data.total[year] || 0
            };

            // Add to combined data (use current year for main stats)
            if (year === currentYear) {
              allContributions = data.contributions;
              totalContributions = data.total[year] || 0;
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch data for ${year}:`, error);
          yearlyData[year] = { contributions: [], total: 0 };
        }
      }

      // Calculate current streak from current year data
      let currentStreak = 0;
      if (allContributions.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const todayIndex = allContributions.findIndex(c => c.date === today);

        if (todayIndex !== -1) {
          for (let i = todayIndex; i >= 0; i--) {
            if (allContributions[i].count > 0) {
              currentStreak++;
            } else {
              break;
            }
          }
        }
      }

      return {
        contributions: allContributions,
        totalContributions,
        currentStreak,
        yearlyData
      };
    } catch (error) {
      console.error('Failed to fetch GitHub data:', error);

      // Fallback to empty data if API fails
      return {
        contributions: [],
        totalContributions: 0,
        currentStreak: 0,
        yearlyData: {}
      };
    }
  }

          private renderContributionGraph(grid: any[], stats: GitHubStats): void {
    // GitHub contribution colors (matching GitHub's actual colors)
    const levelColors = [
      '#161B22', // Level 0 - dark (no contributions)
      '#559300', // Level 1 - light green
      '#006D32', // Level 2 - medium green
      '#7FDB00', // Level 3 - bright green
      '#94ff00'  // Level 4 - very bright green
    ];


        // Display 5 years stacked vertically (most recent first)
    const years = [2025, 2024, 2023, 2022, 2021]; // Most recent first
    const DAYS_PER_WEEK = 7;
    const yearSpacing = 1; // 1 pixel gap between years
    const startY = 0; // Start at the very top to use all available space

    // Calculate layout: each year gets exactly 7 rows + 1 spacing
    const totalHeightNeeded = (years.length * DAYS_PER_WEEK) + ((years.length - 1) * yearSpacing);

                // Show exactly 48 weeks by cutting first 2 and last 2 weeks of the year
    const weeksToShow = 48; // Exactly 48 weeks to fit the grid width

    for (let yearIndex = 0; yearIndex < years.length; yearIndex++) {
      const year = years[yearIndex];
      const yearData = stats.yearlyData[year];

      if (!yearData || !yearData.contributions.length) {
        // Still reserve space even if no data, to keep layout consistent
        continue;
      }

      // Calculate this year's starting Y position
      const yearStartY = startY + (yearIndex * (DAYS_PER_WEEK + yearSpacing));

      // Cut first 2 weeks and last 2 weeks (show weeks 2-49, which is 48 weeks)
      const weeksToSkipStart = 2;
      const weeksToSkipEnd = 2;
      const startDay = weeksToSkipStart * 7; // Skip first 14 days
      const endDay = yearData.contributions.length - (weeksToSkipEnd * 7); // Skip last 14 days
      const displayContributions = yearData.contributions.slice(startDay, endDay);

            // Draw exactly 7 rows for this year (Sun-Sat)
      for (let i = 0; i < displayContributions.length; i++) {
        const contribution = displayContributions[i];

        // Calculate actual day of week from the date
        const date = new Date(contribution.date + 'T00:00:00');
        const actualDayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday

        // Calculate which week this contribution belongs to
        const firstDate = new Date(displayContributions[0].date + 'T00:00:00');
        const firstDayOfWeek = firstDate.getDay();
        const daysDiff = Math.floor((date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
        const week = Math.floor((daysDiff + firstDayOfWeek) / 7);

        const x = 1 + week; // Start at x=1
        const y = yearStartY + actualDayOfWeek; // Use actual day of week

        if (x < GRID_WIDTH && y < GRID_HEIGHT) {
          const color = levelColors[contribution.level];
          this.setPixel(grid, x, y, color);
        }
      }

                        // Add year label on the right side
      const yearStr = year.toString().slice(-2); // "25", "24", "23", "22", "21"
      this.drawText(grid, yearStr, GRID_WIDTH - 10, yearStartY + 2, '#ffc600', 1);
    }

    // Add username in bottom right corner in white
    const usernameY = GRID_HEIGHT - 6; // Leave some space at bottom
    this.drawText(grid, this.username, GRID_WIDTH - (this.username.length * 6), usernameY, '#FFFFFF', 1);
  }
}
