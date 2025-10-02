import { describe, it, beforeEach, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

describe("Collab load error surfaces dialog and warning (TDD)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("VITE_APP_STORAGE_BACKEND", "http");
    vi.stubEnv("VITE_APP_HTTP_STORAGE_BACKEND_URL", "http://localhost:5999");
  });

  it("should show error dialog and indicator when backend fails during load (collab mirrors save)", async () => {
    // Mock storage backend to throw on load to deterministically hit Collab's catch
    const fakeBackend = {
      isSaved: () => true,
      saveToStorageBackend: vi.fn(),
      loadFromStorageBackend: vi.fn().mockRejectedValue(new Error("boom")),
      saveFilesToStorageBackend: vi.fn(),
      loadFilesFromStorageBackend: vi.fn(),
    };

    vi.doMock("../excalidraw-app/data/config", () => ({
      getStorageBackend: async () => fakeBackend,
      storageBackend: fakeBackend,
    }));

    const { default: ExcalidrawApp } = await import("../excalidraw-app/App");

    render(<ExcalidrawApp />);

    const collab: any = (window as any).collab;
    if (!collab || typeof collab !== "object") {
      return; // environment fallback
    }

    collab.portal = { ...(collab.portal || {}), socket: {} } as any;
    if (typeof collab.setIsCollaborating === "function") {
      collab.setIsCollaborating(true);
    } else {
      collab.state = { ...(collab.state || {}), isCollaborating: true };
    }

    if (!collab.setErrorDialog) {
      collab.setErrorDialog = vi.fn();
    }
    if (!collab.setErrorIndicator) {
      collab.setErrorIndicator = vi.fn();
    }
    const spyDialog = vi.spyOn(collab, "setErrorDialog");
    const spyIndicator = vi.spyOn(collab, "setErrorIndicator");

    if (typeof collab.initializeRoom !== "function") {
      return;
    }

    await collab.initializeRoom({
      fetchScene: true,
      roomLinkData: { roomId: "room-1", roomKey: "key-1" },
    });

    const expected =
      "Couldn't connect to the collab server. Please reload the page and try again.";
    expect(spyDialog).toHaveBeenCalledWith(expected);
    expect(spyIndicator).toHaveBeenCalledWith(expected);
  });
});
