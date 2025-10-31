import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AuthData } from "@saleor/app-sdk/APL";
import { RedisAPL } from "../redis-apl";

describe("RedisAPL", () => {
  let apl: RedisAPL;
  const testKeyPrefix = "test:saleor:auth:";
  // eslint-disable-next-line node/no-process-env
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  const mockAuthData: AuthData = {
    domain: "test.saleor.cloud",
    token: "test_token_12345",
    saleorApiUrl: "https://test.saleor.cloud/graphql/",
    appId: "test_app_id",
    jwks: '{"keys":[]}',
  };

  beforeAll(() => {
    apl = new RedisAPL({
      redisUrl,
      keyPrefix: testKeyPrefix,
    });
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const allData = await apl.getAll();
    for (const data of allData) {
      await apl.delete(data.saleorApiUrl);
    }
  });

  afterAll(async () => {
    // Clean up and disconnect
    const allData = await apl.getAll();
    for (const data of allData) {
      await apl.delete(data.saleorApiUrl);
    }
    await apl.disconnect();
  });

  describe("isConfigured", () => {
    it("should return configured: true when Redis is properly configured", async () => {
      const result = await apl.isConfigured();
      expect(result.configured).toBe(true);
    });
  });

  describe("isReady", () => {
    it("should return ready: true when Redis is connected", async () => {
      const result = await apl.isReady();
      expect(result.ready).toBe(true);
    });
  });

  describe("set and get", () => {
    it("should store and retrieve auth data", async () => {
      await apl.set(mockAuthData);
      const retrieved = await apl.get(mockAuthData.saleorApiUrl);

      expect(retrieved).toEqual(mockAuthData);
    });

    it("should return undefined for non-existent auth data", async () => {
      const retrieved = await apl.get("https://nonexistent.saleor.cloud/graphql/");
      expect(retrieved).toBeUndefined();
    });

    it("should overwrite existing auth data", async () => {
      await apl.set(mockAuthData);

      const updatedAuthData: AuthData = {
        ...mockAuthData,
        token: "updated_token_67890",
      };

      await apl.set(updatedAuthData);
      const retrieved = await apl.get(mockAuthData.saleorApiUrl);

      expect(retrieved).toEqual(updatedAuthData);
      expect(retrieved?.token).toBe("updated_token_67890");
    });
  });

  describe("delete", () => {
    it("should delete existing auth data", async () => {
      await apl.set(mockAuthData);

      let retrieved = await apl.get(mockAuthData.saleorApiUrl);
      expect(retrieved).toEqual(mockAuthData);

      await apl.delete(mockAuthData.saleorApiUrl);

      retrieved = await apl.get(mockAuthData.saleorApiUrl);
      expect(retrieved).toBeUndefined();
    });

    it("should not throw error when deleting non-existent auth data", async () => {
      await expect(
        apl.delete("https://nonexistent.saleor.cloud/graphql/"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("should return empty array when no auth data exists", async () => {
      const allData = await apl.getAll();
      expect(allData).toEqual([]);
    });

    it("should return all stored auth data", async () => {
      const authData1: AuthData = {
        ...mockAuthData,
        saleorApiUrl: "https://store1.saleor.cloud/graphql/",
        domain: "store1.saleor.cloud",
      };

      const authData2: AuthData = {
        ...mockAuthData,
        saleorApiUrl: "https://store2.saleor.cloud/graphql/",
        domain: "store2.saleor.cloud",
      };

      const authData3: AuthData = {
        ...mockAuthData,
        saleorApiUrl: "https://store3.saleor.cloud/graphql/",
        domain: "store3.saleor.cloud",
      };

      await apl.set(authData1);
      await apl.set(authData2);
      await apl.set(authData3);

      const allData = await apl.getAll();

      expect(allData).toHaveLength(3);
      expect(allData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ saleorApiUrl: authData1.saleorApiUrl }),
          expect.objectContaining({ saleorApiUrl: authData2.saleorApiUrl }),
          expect.objectContaining({ saleorApiUrl: authData3.saleorApiUrl }),
        ]),
      );
    });
  });

  describe("TTL support", () => {
    it("should support TTL configuration", async () => {
      const aplWithTTL = new RedisAPL({
        redisUrl,
        keyPrefix: testKeyPrefix + "ttl:",
        ttl: 2, // 2 seconds
      });

      const authData: AuthData = {
        ...mockAuthData,
        saleorApiUrl: "https://ttl-test.saleor.cloud/graphql/",
      };

      await aplWithTTL.set(authData);

      // Should exist immediately
      let retrieved = await aplWithTTL.get(authData.saleorApiUrl);
      expect(retrieved).toEqual(authData);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Should be expired
      retrieved = await aplWithTTL.get(authData.saleorApiUrl);
      expect(retrieved).toBeUndefined();

      await aplWithTTL.disconnect();
    });
  });

  describe("custom key prefix", () => {
    it("should use custom key prefix", async () => {
      const customPrefix = "custom:prefix:";
      const aplWithCustomPrefix = new RedisAPL({
        redisUrl,
        keyPrefix: customPrefix,
      });

      const authData: AuthData = {
        ...mockAuthData,
        saleorApiUrl: "https://custom-prefix.saleor.cloud/graphql/",
      };

      await aplWithCustomPrefix.set(authData);
      const retrieved = await aplWithCustomPrefix.get(authData.saleorApiUrl);

      expect(retrieved).toEqual(authData);

      // Clean up
      await aplWithCustomPrefix.delete(authData.saleorApiUrl);
      await aplWithCustomPrefix.disconnect();
    });
  });
});
