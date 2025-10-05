import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveToHttpStorage } from "./httpStorage";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";
import type { SyncableExcalidrawElement } from ".";
import type { AppState } from "../../packages/excalidraw/types";
import { getSceneVersion } from "../../packages/excalidraw/element";

// Mock environment variable
vi.stubEnv("VITE_APP_HTTP_STORAGE_BACKEND_URL", "http://test-backend.local");

// Mock dependencies
vi.mock("../../packages/excalidraw/data/reconcile", () => ({
  reconcileElements: vi.fn((local, remote) => [...local, ...remote]),
}));

vi.mock("../../packages/excalidraw/data/encryption", () => ({
  encryptData: vi.fn(async () => ({
    encryptedBuffer: new ArrayBuffer(16),
    iv: new Uint8Array(12),
  })),
  decryptData: vi.fn(async () => new ArrayBuffer(0)),
  IV_LENGTH_BYTES: 12,
}));

vi.mock("../../packages/excalidraw/data/restore", () => ({
  restoreElements: vi.fn((elements) => elements),
}));

describe("httpStorage - Critical Issues", () => {
  let mockPortal: Portal;
  let mockElements: SyncableExcalidrawElement[];
  let mockAppState: AppState;

  beforeEach(() => {
    mockPortal = {
      socket: { id: "test-socket" } as Socket,
      roomId: "test-room-id",
      roomKey: "test-room-key",
    } as Portal;

    mockElements = [
      {
        id: "element-1",
        type: "rectangle",
        version: 1,
        versionNonce: 123,
        isDeleted: false,
        updated: 1000,
      },
    ] as SyncableExcalidrawElement[];

    mockAppState = {} as AppState;
  });

  describe("🔴 Issue 1: Inconsistent Return Values", () => {
    it("should return reconciledElements in fallback path", async () => {
      const sceneVersion = getSceneVersion(mockElements);
      const serverVersion = sceneVersion + 1;

      const mockBuffer = new ArrayBuffer(4 + 12 + 100);
      const view = new DataView(mockBuffer);
      view.setUint32(0, serverVersion, false);

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () => mockBuffer,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const result = await saveToHttpStorage(
        mockPortal,
        mockElements,
        mockAppState,
      );

      // ISSUE: Fallback returns reconciledElements
      expect(result).not.toBe(false);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return elements in normal path", async () => {
      const sceneVersion = getSceneVersion(mockElements);
      const serverVersion = sceneVersion - 1;

      const mockBuffer = new ArrayBuffer(4 + 12 + 100);
      const view = new DataView(mockBuffer);
      view.setUint32(0, serverVersion, false);

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () => mockBuffer,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const result = await saveToHttpStorage(
        mockPortal,
        mockElements,
        mockAppState,
      );

      // ISSUE: Normal path returns original elements, not reconciled
      expect(result).toBe(mockElements);
    });
  });

  describe("🔴 Issue 2: Race Condition (Documented)", () => {
    it("demonstrates concurrent saves both succeed", async () => {
      const sceneVersion = getSceneVersion(mockElements);

      const mockBuffer = new ArrayBuffer(4 + 12 + 100);
      const view = new DataView(mockBuffer);
      view.setUint32(0, sceneVersion, false);

      // Both requests will see same server version
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockBuffer,
      });

      const [result1, result2] = await Promise.all([
        saveToHttpStorage(mockPortal, mockElements, mockAppState),
        saveToHttpStorage(mockPortal, mockElements, mockAppState),
      ]);

      // ISSUE: Both succeed - last write wins, potential data loss
      expect(result1).not.toBe(false);
      expect(result2).not.toBe(false);
    });
  });
});
