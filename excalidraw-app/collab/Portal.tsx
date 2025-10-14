import type {
  SocketUpdateData,
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "../data";
import { isSyncableElement } from "../data";
import type { TCollabClass } from "./Collab";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { WS_EVENTS, FILE_UPLOAD_TIMEOUT, WS_SUBTYPES } from "../app_constants";
import type {
  OnUserFollowedPayload,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { UserIdleState } from "@excalidraw/excalidraw/constants";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import throttle from "lodash.throttle";
import { newElementWith } from "@excalidraw/excalidraw/element/mutateElement";
import { encryptData } from "@excalidraw/excalidraw/data/encryption";
import type { Socket } from "socket.io-client";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

class Portal {
  collab: TCollabClass;
  socket: Socket | null = null;
  socketInitialized: boolean = false;
  roomId: string | null = null;
  roomKey: string | null = null;
  broadcastedElementVersions: Map<string, number> = new Map();
  reconnectBanner: HTMLElement | null = null;

  constructor(collab: TCollabClass) {
    this.collab = collab;
    this._initReconnectBanner();
  }

  private _initReconnectBanner() {
    this.reconnectBanner = document.createElement("div");
    this.reconnectBanner.style.position = "fixed";
    this.reconnectBanner.style.top = "-50px";
    this.reconnectBanner.style.left = "0";
    this.reconnectBanner.style.right = "0";
    this.reconnectBanner.style.height = "50px";
    this.reconnectBanner.style.backgroundColor = "#6965DB";
    this.reconnectBanner.style.color = "#fff";
    this.reconnectBanner.style.textAlign = "center";
    this.reconnectBanner.style.lineHeight = "50px";
    this.reconnectBanner.style.fontWeight = "bold";
    this.reconnectBanner.style.zIndex = "9999";
    this.reconnectBanner.style.transition = "top 0.3s ease";
    this.reconnectBanner.textContent = "Reconnecting...";
    document.body.appendChild(this.reconnectBanner);
  }

  private _showBanner(show: boolean) {
    if (this.reconnectBanner) {
      this.reconnectBanner.style.top = show ? "0" : "-50px";
    }
  }

  open(socket: Socket, id: string, key: string) {
    this.socket = socket;
    this.roomId = id;
    this.roomKey = key;

    if (!this.roomId || !this.roomKey) {
      throw new Error("Room ID or Room Key is not set.");
    }

    this.socket.io.opts.reconnection = true;
    this.socket.io.opts.reconnectionAttempts = Infinity;
    this.socket.io.opts.reconnectionDelay = 1000;
    this.socket.io.opts.reconnectionDelayMax = 5000;

    if (this.socket.connected) {
      this._joinRoom();
    }

    setTimeout(() => {
      if (this.socket?.connected && this.roomId) {
        console.log(" Join-room fallback");
        this._joinRoom();
      }
    }, 3000);

    this._initializeSocketListeners();
    return socket;
  }

  private _initializeSocketListeners() {
    this.socket?.on("init-room", () => {
      this._joinRoom();
      trackEvent("share", "room joined");
    });

    this.socket?.on("new-user", async () => {
      this.broadcastScene(
        WS_SUBTYPES.INIT,
        this.collab.getSceneElementsIncludingDeleted(),
        true,
      );
    });

    this.socket?.on("room-user-change", (clients: SocketId[]) => {
      this.collab.setCollaborators(clients);
    });

    this.socket?.io.on("reconnect_attempt", () => {
      console.log("🔄 Trying to reconnect...");
      this._showBanner(true);
    });

    this.socket?.io.on("reconnect", () => {
      console.log("✅ Socket.IO Reconnected");
      this.socket?.once("connect", () => {
        console.log("🔗 Full connection. Socket ID:", this.socket?.id);
        this._joinRoom();

        const elements = this.collab.getSceneElementsIncludingDeleted();
        console.log(` Re-sending full scene with ${elements.length} element`);
        this.broadcastScene(WS_SUBTYPES.INIT, elements, true);

        this._showBanner(false);
      });
    });

    this.socket?.io.on("reconnect_error", (err) => {
      console.error("❌ Reconnect error:", err);
      this._showBanner(true);
    });

    this.socket?.io.on("reconnect_failed", () => {
      console.warn("Reconnection failed. You may need to reload the page.");
      this._showBanner(true);
    });

    this.socket?.on("disconnect", () => {
      console.warn("⚠️ Socket disconnected");
      this._showBanner(true);
    });

    this.socket?.on("connect", () => {
      this._showBanner(false);
    });
  }

  private _joinRoom() {
    if (this.roomId && this.socket?.connected) {
      console.log(" Joining room:", this.roomId);
      this.socket.emit("join-room", this.roomId);
    }
  }

  close() {
    if (!this.socket) return;
    this.queueFileUpload.flush();
    this.socket.close();
    this.socket = null;
    this.roomId = null;
    this.roomKey = null;
    this.socketInitialized = false;
    this.broadcastedElementVersions = new Map();
  }

  isOpen() {
    return !!(
      this.socketInitialized &&
      this.socket &&
      this.roomId &&
      this.roomKey
    );
  }

  async _broadcastSocketData(
    data: SocketUpdateData,
    volatile: boolean = false,
    roomId?: string,
  ) {
    if (!this.isOpen()) return;
    const json = JSON.stringify(data);
    const encoded = new TextEncoder().encode(json);
    const { encryptedBuffer, iv } = await encryptData(this.roomKey!, encoded);
    this.socket?.emit(
      volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
      roomId ?? this.roomId,
      encryptedBuffer,
      iv,
    );
  }

  queueFileUpload = throttle(async () => {
    try {
      await this.collab.fileManager.saveFiles({
        elements: this.collab.excalidrawAPI.getSceneElementsIncludingDeleted(),
        files: this.collab.excalidrawAPI.getFiles(),
      });
    } catch (error: any) {
      if (error.name !== "AbortError") {
        this.collab.excalidrawAPI.updateScene({
          appState: { errorMessage: error.message },
        });
      }
    }

    let isChanged = false;
    const newElements = this.collab.excalidrawAPI
      .getSceneElementsIncludingDeleted()
      .map((el) => {
        if (this.collab.fileManager.shouldUpdateImageElementStatus(el)) {
          isChanged = true;
          // this will signal collaborators to pull image data from server
          // (using mutation instead of newElementWith otherwise it'd break
          // in-progress dragging)
          return newElementWith(el, { status: "saved" });
        }
        return el;
      });

    if (isChanged) {
      this.collab.excalidrawAPI.updateScene({
        elements: newElements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }, FILE_UPLOAD_TIMEOUT);

  broadcastScene = async (
    updateType: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE,
    elements: readonly OrderedExcalidrawElement[],
    syncAll: boolean,
  ) => {
    if (updateType === WS_SUBTYPES.INIT && !syncAll) {
      throw new Error("syncAll must be true when sending SCENE.INIT");
    }

    // sync out only the elements we think we need to to save bandwidth.
    // periodically we'll resync the whole thing to make sure no one diverges
    // due to a dropped message (server goes down etc).
    const syncableElements = elements.reduce((acc, element) => {
      if (
        (syncAll ||
          !this.broadcastedElementVersions.has(element.id) ||
          element.version > this.broadcastedElementVersions.get(element.id)!) &&
        isSyncableElement(element)
      ) {
        acc.push(element);
      }
      return acc;
    }, [] as SyncableExcalidrawElement[]);

    const data: SocketUpdateDataSource[typeof updateType] = {
      type: updateType,
      payload: { elements: syncableElements },
    };

    for (const e of syncableElements) {
      this.broadcastedElementVersions.set(e.id, e.version);
    }

    this.queueFileUpload();
    await this._broadcastSocketData(data as SocketUpdateData);
  };

  broadcastIdleChange = (userState: UserIdleState) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["IDLE_STATUS"] = {
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: this.socket.id as SocketId,
          userState,
          username: this.collab.state.username,
        },
      };
      return this._broadcastSocketData(data as SocketUpdateData, true);
    }
  };

  broadcastMouseLocation = (payload: {
    pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
    button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
  }) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["MOUSE_LOCATION"] = {
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId: this.socket.id as SocketId,
          pointer: payload.pointer,
          button: payload.button || "up",
          selectedElementIds:
            this.collab.excalidrawAPI.getAppState().selectedElementIds,
          username: this.collab.state.username,
        },
      };
      return this._broadcastSocketData(data as SocketUpdateData, true);
    }
  };

  broadcastVisibleSceneBounds = (
    payload: {
      sceneBounds: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"]["payload"]["sceneBounds"];
    },
    roomId: string,
  ) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"] = {
        type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
        payload: {
          socketId: this.socket.id as SocketId,
          username: this.collab.state.username,
          sceneBounds: payload.sceneBounds,
        },
      };
      return this._broadcastSocketData(data as SocketUpdateData, true, roomId);
    }
  };

  broadcastUserFollowed = (payload: OnUserFollowedPayload) => {
    if (this.socket?.id) {
      this.socket.emit(WS_EVENTS.USER_FOLLOW_CHANGE, payload);
    }
  };
}

export default Portal;
