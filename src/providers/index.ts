// =============================================================================
// Trading Platform Provider Factory
// =============================================================================
// Returns the correct TradingPlatformProvider implementation based on the
// TRADING_PLATFORM config value. This is the only place where concrete
// provider classes are imported.
// =============================================================================

import { config } from '../config/index.js';
import type { TradingPlatformProvider } from './trading-platform.provider.js';
import { VolumetricaProvider } from './volumetrica/volumetrica.provider.js';

let _cached: TradingPlatformProvider | null = null;

export function getTradingPlatformProvider(): TradingPlatformProvider {
  if (_cached) return _cached;

  const platform = config.tradingPlatform;

  switch (platform) {
    case 'volumetrica':
      _cached = new VolumetricaProvider();
      break;
    default:
      throw new Error(`Unknown trading platform: ${platform}`);
  }

  return _cached;
}

export type { TradingPlatformProvider } from './trading-platform.provider.js';
export * from './types.js';
