// Inspired and partly copied from https://gitlab.com/kiliandeca/excalidraw-fork
// MIT, Kilian Decaderincourt

import type { SyncableExcalidrawElement } from ".";
import { getSyncableElements } from ".";
import { MIME_TYPES } from "../../packages/excalidraw/constants";
import { decompressData } from "../../packages/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
  IV_LENGTH_BYTES,
} from "../../packages/excalidraw/data/encryption";
import { restoreElements } from "../../packages/excalidraw/data/restore";
import { getSceneVersion } from "../../packages/excalidraw/element";
import type {
  ExcalidrawElement,
  FileId
} from "../../packages/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "../../packages/excalidraw/types";
import type Portal from "../collab/Portal";
import type { RemoteExcalidrawElement } from "../../packages/excalidraw/data/reconcile";
import { reconcileElements } from "../../packages/excalidraw/data/reconcile";
import type { StoredScene } from "./StorageBackend";
import type { Socket } from "socket.io-client";

const HTTP_STORAGE_BACKEND_URL = import.meta.env
  .VITE_APP_HTTP_STORAGE_BACKEND_URL;
const SCENE_VERSION_LENGTH_BYTES = 4;

// There is a lot of intentional duplication with the firebase file
// to prevent modifying upstream files and ease future maintenance of this fork

const httpStorageSceneVersionCache = new WeakMap<Socket, number>();

export const isSavedToHttpStorage = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);
    return httpStorageSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveToHttpStorage = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  // if no room exists, consider the room saved because there's nothing we can
  // do at this point
  if (!roomId || !roomKey || !socket || isSavedToHttpStorage(portal, elements)) {
    return false;
  }

  const sceneVersion = getSceneVersion(elements);
  const getResponse = await fetch(`${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`);

  if (!getResponse.ok && getResponse.status !== 404) return false;

  if (getResponse.status === 404) {
    // Room does not exist → create new room
    const result = await saveElementsToBackend(roomKey, roomId, [...elements], sceneVersion);
    if (result) {
      console.debug("[httpStorage] Created new room, cache updated", { roomId, sceneVersion });
      httpStorageSceneVersionCache.set(socket, sceneVersion);
      return elements;
    }
    return false;
  }

  // Room exists → check scene versions
  const buffer = await getResponse.arrayBuffer();
  const sceneVersionFromRequest = parseSceneVersionFromRequest(buffer);

  if (sceneVersionFromRequest >= sceneVersion) {
    // KeepAlive Log
    console.debug("[httpStorage] Keepalive/Fallback PUT → syncing with server", {
      roomId,
      localSceneVersion: sceneVersion,
      serverSceneVersion: sceneVersionFromRequest,
    });

    // Fallback PUT: reconciling old room with server
    const existingElements = await getElementsFromBuffer(buffer, roomKey);
    const reconciledElements = getSyncableElements(
      reconcileElements(
        [...elements] as unknown as RemoteExcalidrawElement[],
        [...existingElements] as unknown as RemoteExcalidrawElement[],
        appState
      )
    );

    const newSceneVersion = sceneVersionFromRequest + 1;
    const result = await saveElementsToBackend(roomKey, roomId, reconciledElements, newSceneVersion);

    if (result) {
      // Result log
      console.debug("[httpStorage] Fallback PUT succeeded, cache updated", {
        roomId,
        sceneVersion: newSceneVersion,
      });
      httpStorageSceneVersionCache.set(socket, newSceneVersion);
      return reconciledElements;
    } else {
      console.warn("[httpStorage] Fallback PUT failed", { roomId, newSceneVersion });
      return false;
    }
  }

  // Normal PUT: reconcile with existing elements
  const existingElements = await getElementsFromBuffer(buffer, roomKey);
  const reconciledElements = getSyncableElements(
    reconcileElements(
      [...elements] as unknown as RemoteExcalidrawElement[],
      [...existingElements] as unknown as RemoteExcalidrawElement[],
      appState
    )
  );

  const result = await saveElementsToBackend(roomKey, roomId, reconciledElements, sceneVersion);
  if (result) {
    console.debug("[httpStorage] PUT succeeded, cache updated", { roomId, sceneVersion });
    httpStorageSceneVersionCache.set(socket, sceneVersion);
    return elements;
  } else {
    console.warn("[httpStorage] PUT failed", { roomId, sceneVersion });
    return false;
  }
};

export const loadFromHttpStorage = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const getResponse = await fetch(`${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`);
  const buffer = await getResponse.arrayBuffer();
  const elements = getSyncableElements(
    restoreElements(await getElementsFromBuffer(buffer, roomKey), null),
  );

  if (socket) {
    httpStorageSceneVersionCache.set(socket, getSceneVersion(elements));
  }

  return elements;
};

const getElementsFromBuffer = async (
  buffer: ArrayBuffer,
  key: string,
): Promise<readonly ExcalidrawElement[]> => {
  // Buffer should contain both the IV (fixed length) and encrypted data
  const sceneVersion = parseSceneVersionFromRequest(buffer);
  const iv = new Uint8Array(buffer.slice(SCENE_VERSION_LENGTH_BYTES, IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES));
  const encrypted = buffer.slice(IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES, buffer.byteLength);

  return await decryptElements({ sceneVersion, ciphertext: encrypted, iv }, key);
};

export const saveFilesToHttpStorage = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const payloadBlob = new Blob([buffer]);
        const payload = await new Response(payloadBlob).arrayBuffer();
        await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}`, { method: "PUT", body: payload });
        savedFiles.push(id);
      } catch (error: any) {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const loadFilesFromHttpStorage = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const response = await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}`);
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();
          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            { decryptionKey },
          );
          const dataURL = new TextDecoder().decode(data) as DataURL;
          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};

const saveElementsToBackend = async (
  roomKey: string,
  roomId: string,
  elements: SyncableExcalidrawElement[],
  sceneVersion: number,
) => {
  const { ciphertext, iv } = await encryptElements(roomKey, elements);

  // Concatenate Scene Version, IV with encrypted data (IV does not have to be secret).
  const numberBuffer = new ArrayBuffer(4);
  const numberView = new DataView(numberBuffer);
  numberView.setUint32(0, sceneVersion, false);
  const payloadBlob = await new Response(new Blob([numberBuffer, iv.buffer, ciphertext])).arrayBuffer();
  const putResponse = await fetch(`${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`, { method: "PUT", body: payloadBlob });

  return putResponse.ok;
};

const parseSceneVersionFromRequest = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  return view.getUint32(0, false);
};

const decryptElements = async (
  data: StoredScene,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const decrypted = await decryptData(data.iv, data.ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(new Uint8Array(decrypted));
  return JSON.parse(decodedData);
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const encoded = new TextEncoder().encode(JSON.stringify(elements));
  const { encryptedBuffer, iv } = await encryptData(key, encoded);
  return { ciphertext: encryptedBuffer, iv };
};
