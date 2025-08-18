import type { UtilityBase, UtilityResult, UtilityConfig } from './UtilityBase';
import type { GridCell } from '../types';

export class UtilityManager {
  private utilities: Map<string, UtilityBase> = new Map();
  private activeUtility: string | null = null;
  private onGridUpdate?: (gridData: GridCell[], metadata?: Record<string, unknown>) => void;

  // Register a new utility
  public registerUtility(utility: UtilityBase): void {
    this.utilities.set(utility.config.id, utility);
    console.log(`[UtilityManager] Registered utility: ${utility.config.name}`);
  }

  // Get all available utilities
  public getAvailableUtilities(): UtilityConfig[] {
    return Array.from(this.utilities.values()).map(u => u.config);
  }

  // Set callback for grid updates
  public setGridUpdateCallback(callback: (gridData: GridCell[], metadata?: Record<string, unknown>) => void): void {
    this.onGridUpdate = callback;
  }

  // Execute a specific utility
  public async executeUtility(utilityId: string): Promise<UtilityResult> {
    const utility = this.utilities.get(utilityId);
    if (!utility) {
      return {
        success: false,
        error: `Utility "${utilityId}" not found`
      };
    }

    console.log(`[UtilityManager] Executing utility: ${utility.config.name}`);

    try {
      const result = await utility.execute();

      if (result.success && result.gridData && this.onGridUpdate) {
        this.onGridUpdate(result.gridData, result.metadata);
        this.activeUtility = utilityId;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[UtilityManager] Error executing ${utilityId}:`, error);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Stop any active utility
  public stopActiveUtility(): void {
    if (this.activeUtility) {
      const utility = this.utilities.get(this.activeUtility);
      if (utility) {
        utility.stopAutoRefresh();
      }
      this.activeUtility = null;
      console.log(`[UtilityManager] Stopped active utility`);
    }
  }

  // Get currently active utility
  public getActiveUtility(): string | null {
    return this.activeUtility;
  }

  // Start auto-refresh for a utility
  public startUtilityAutoRefresh(utilityId: string): boolean {
    const utility = this.utilities.get(utilityId);
    if (!utility || !utility.config.refreshIntervalMs) {
      return false;
    }

    utility.startAutoRefresh((result) => {
      if (result.success && result.gridData && this.onGridUpdate) {
        this.onGridUpdate(result.gridData, result.metadata);
      }
    });

    return true;
  }

  // Cleanup - stop all auto-refresh timers
  public cleanup(): void {
    for (const utility of this.utilities.values()) {
      utility.stopAutoRefresh();
    }
    this.activeUtility = null;
  }
}
