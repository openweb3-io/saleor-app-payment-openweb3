import Redis from "ioredis";
import type { APL, AplConfiguredResult, AplReadyResult, AuthData } from "@saleor/app-sdk/APL";
import { createLogger } from "./logger";

export interface RedisAPLConfig {
  /**
   * Redis connection URL (e.g., redis://localhost:6379 or rediss://localhost:6380 for TLS)
   */
  redisUrl: string;
  /**
   * Optional Redis password
   */
  redisPassword?: string;
  /**
   * Optional key prefix for storing auth data (default: "saleor:auth:")
   */
  keyPrefix?: string;
  /**
   * Optional TTL in seconds for auth data (default: no expiration)
   */
  ttl?: number;
  /**
   * Enable TLS/SSL connection (default: auto-detected from URL scheme)
   * Set to true to force TLS even with redis:// URL
   */
  tls?: boolean;
  /**
   * Reject unauthorized TLS certificates (default: true)
   * Set to false to accept self-signed certificates (not recommended for production)
   */
  tlsRejectUnauthorized?: boolean;
}

/**
 * RedisAPL - Redis-based Authentication Persistence Layer for Saleor App SDK
 *
 * This implementation stores authentication data in Redis using the following structure:
 * - Individual keys: {keyPrefix}{saleorApiUrl} -> JSON stringified AuthData
 * - Index key: {keyPrefix}index -> Set of all saleorApiUrls
 *
 * @example
 * ```typescript
 * const apl = new RedisAPL({
 *   redisUrl: "redis://localhost:6379",
 *   redisPassword: "your-password",
 *   keyPrefix: "saleor:auth:",
 *   ttl: 86400 // 24 hours
 * });
 * ```
 */
export class RedisAPL implements APL {
  private client: Redis;
  private keyPrefix: string;
  private ttl?: number;
  private logger = createLogger({}, { msgPrefix: "[RedisAPL] " });
  private readonly indexKey: string;

  constructor(config: RedisAPLConfig) {
    this.keyPrefix = config.keyPrefix || "saleor:auth:";
    this.indexKey = `${this.keyPrefix}index`;
    this.ttl = config.ttl;

    // Determine if TLS should be used
    const useTls = config.tls ?? config.redisUrl.startsWith("rediss://");

    // Initialize Redis client
    this.client = new Redis(config.redisUrl, {
      password: config.redisPassword,
      maxRetriesPerRequest: 3,
      // TLS configuration
      ...(useTls && {
        tls: {
          // Reject unauthorized certificates by default (can be disabled for self-signed certs)
          rejectUnauthorized: config.tlsRejectUnauthorized ?? true,
        },
      }),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err) => {
        this.logger.error(err, "Redis connection error");
        return true;
      },
    });

    if (useTls) {
      this.logger.info("Redis client initialized with TLS/SSL enabled");
    }

    this.client.on("error", (err) => {
      this.logger.error(err, "Redis client error");
    });

    this.client.on("connect", () => {
      this.logger.info("Redis client connected");
    });

    this.client.on("ready", () => {
      this.logger.info("Redis client ready");
    });
  }

  /**
   * Generate Redis key for a given Saleor API URL
   */
  private getKey(saleorApiUrl: string): string {
    return `${this.keyPrefix}${saleorApiUrl}`;
  }

  /**
   * Get authentication data for a specific Saleor API URL
   */
  async get(saleorApiUrl: string): Promise<AuthData | undefined> {
    try {
      const key = this.getKey(saleorApiUrl);
      const data = await this.client.get(key);

      if (!data) {
        this.logger.debug(`No auth data found for ${saleorApiUrl}`);
        return undefined;
      }

      const authData = JSON.parse(data) as AuthData;
      this.logger.debug(`Retrieved auth data for ${saleorApiUrl}`);
      return authData;
    } catch (error) {
      this.logger.error(error, `Failed to get auth data for ${saleorApiUrl}`);
      throw error;
    }
  }

  /**
   * Store authentication data
   */
  async set(authData: AuthData): Promise<void> {
    try {
      const key = this.getKey(authData.saleorApiUrl);
      const value = JSON.stringify(authData);

      // Use pipeline for atomic operations
      const pipeline = this.client.pipeline();

      if (this.ttl) {
        pipeline.setex(key, this.ttl, value);
      } else {
        pipeline.set(key, value);
      }

      // Add to index set
      pipeline.sadd(this.indexKey, authData.saleorApiUrl);

      await pipeline.exec();

      this.logger.info(`Stored auth data for ${authData.saleorApiUrl}`);
    } catch (error) {
      this.logger.error(error, `Failed to set auth data for ${authData.saleorApiUrl}`);
      throw error;
    }
  }

  /**
   * Delete authentication data for a specific Saleor API URL
   */
  async delete(saleorApiUrl: string): Promise<void> {
    try {
      const key = this.getKey(saleorApiUrl);

      // Use pipeline for atomic operations
      const pipeline = this.client.pipeline();
      pipeline.del(key);
      pipeline.srem(this.indexKey, saleorApiUrl);

      await pipeline.exec();

      this.logger.info(`Deleted auth data for ${saleorApiUrl}`);
    } catch (error) {
      this.logger.error(error, `Failed to delete auth data for ${saleorApiUrl}`);
      throw error;
    }
  }

  /**
   * Get all stored authentication data
   */
  async getAll(): Promise<AuthData[]> {
    try {
      // Get all URLs from index
      const saleorApiUrls = await this.client.smembers(this.indexKey);

      if (saleorApiUrls.length === 0) {
        this.logger.debug("No auth data found");
        return [];
      }

      // Get all auth data using pipeline for better performance
      const keys = saleorApiUrls.map((url) => this.getKey(url));
      const results = await this.client.mget(...keys);

      const authDataList: AuthData[] = [];

      for (let i = 0; i < results.length; i++) {
        const data = results[i];
        if (data) {
          try {
            authDataList.push(JSON.parse(data) as AuthData);
          } catch (parseError) {
            this.logger.error(parseError, `Failed to parse auth data for ${saleorApiUrls[i]}`);
            // Clean up invalid data
            await this.delete(saleorApiUrls[i]);
          }
        } else {
          // Key doesn't exist but is in index, clean up
          this.logger.warn(`Key not found for ${saleorApiUrls[i]}, cleaning up index`);
          await this.client.srem(this.indexKey, saleorApiUrls[i]);
        }
      }

      this.logger.debug(`Retrieved ${authDataList.length} auth data entries`);
      return authDataList;
    } catch (error) {
      this.logger.error(error, "Failed to get all auth data");
      throw error;
    }
  }

  /**
   * Check if Redis connection is ready
   */
  async isReady(): Promise<AplReadyResult> {
    try {
      const status = this.client.status;
      const ready = status === "ready" || status === "connect" || status === "connecting";

      if (!ready) {
        this.logger.warn(`Redis client not ready, status: ${status}`);
        return {
          ready: false,
          error: new Error(`Redis client not ready, status: ${status}`),
        };
      }

      return { ready: true };
    } catch (error) {
      this.logger.error(error, "Failed to check Redis readiness");
      return {
        ready: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Check if Redis is properly configured
   */
  async isConfigured(): Promise<AplConfiguredResult> {
    try {
      // Try to ping Redis to check configuration
      await this.client.ping();
      return { configured: true };
    } catch (error) {
      this.logger.error(error, "Redis is not properly configured");
      return {
        configured: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Disconnect from Redis (useful for cleanup)
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.info("Redis client disconnected");
    } catch (error) {
      this.logger.error(error, "Failed to disconnect Redis client");
      throw error;
    }
  }
}
