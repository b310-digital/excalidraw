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
  FileId,
  OrderedExcalidrawElement,
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

const httpStorageSceneVersionCache = new WeakMap<Socket, number>();

// ─────────────────────────────────────────────
// Helper: Kontrollera om rummet redan sparats
export const isSavedToHttpStorage = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);
    return httpStorageSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  return true;
};

// ─────────────────────────────────────────────
// PATCH /files/:id/timestamp helper
export const touchFilesInHttpStorage = async (
  filesIds: readonly FileId[],
) => {
  const touchedFiles: FileId[] = [];
  const erroredFiles: FileId[] = [];

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const response = await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}/timestamp`, {
          method: "PATCH",
        });
        if (response.ok) touchedFiles.push(id);
        else erroredFiles.push(id);
      } catch (error) {
        console.error(`[httpStorage] Failed to touch file ${id}`, error);
        erroredFiles.push(id);
      }
    }),
  );

  return { touchedFiles, erroredFiles };
};

// ─────────────────────────────────────────────
// Spara rummet och uppdatera filer
export const saveToHttpStorage = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (!roomId || !roomKey || !socket || isSavedToHttpStorage(portal, elements)) {
    return false;
  }

  const sceneVersion = getSceneVersion(elements);
  const getResponse = await fetch(`${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`);

  if (!getResponse.ok && getResponse.status !== 404) {
    return false;
  }

  // Skapa nytt rum om 404
  if (getResponse.status === 404) {
    const result: boolean = await saveElementsToBackend(
      roomKey,
      roomId,
      [...elements],
      sceneVersion,
    );
    if (result) {
      console.debug("[httpStorage] Created new room, cache updated", { roomId, sceneVersion });
      httpStorageSceneVersionCache.set(socket, sceneVersion);

      // 🔥 Touch alla filer
      if (appState.files) {
        const fileIds = Object.keys(appState.files) as FileId[];
        await touchFilesInHttpStorage(fileIds);
      }

      return elements;
    }
    return false;
  }

  const buffer = await getResponse.arrayBuffer();
  const sceneVersionFromRequest = parseSceneVersionFromRequest(buffer);

  // Fallback PUT om server har nyare version
  if (sceneVersionFromRequest >= sceneVersion) {
    console.debug("[httpStorage] Keepalive/Fallback PUT → syncing with server", {
      roomId,
      localSceneVersion: sceneVersion,
      serverSceneVersion: sceneVersionFromRequest,
    });

    const existingElements = await getElementsFromBuffer(buffer, roomKey);
    const reconciledElements = getSyncableElements(
      reconcileElements(
        [...elements] as unknown as RemoteExcalidrawElement[],
        [...existingElements] as unknown as RemoteExcalidrawElement[],
        appState,
      ),
    );

    const newSceneVersion = sceneVersionFromRequest + 1;
    const result = await saveElementsToBackend(roomKey, roomId, reconciledElements, newSceneVersion);

    if (result) {
      console.debug("[httpStorage] Fallback PUT succeeded, cache updated", {
        roomId,
        sceneVersion: newSceneVersion,
      });
      httpStorageSceneVersionCache.set(socket, newSceneVersion);

      // 🔥 Touch alla filer
      if (appState.files) {
        const fileIds = Object.keys(appState.files) as FileId[];
        await touchFilesInHttpStorage(fileIds);
      }

      return reconciledElements;
    } else {
      console.warn("[httpStorage] Fallback PUT failed", { roomId, newSceneVersion });
      return false;
    }
  }

  // Normal PUT
  const existingElements = await getElementsFromBuffer(buffer, roomKey);
  const reconciledElements = getSyncableElements(
    reconcileElements(
      [...elements] as unknown as RemoteExcalidrawElement[],
      [...existingElements] as unknown as RemoteExcalidrawElement[],
      appState,
    ),
  );

  const result = await saveElementsToBackend(roomKey, roomId, reconciledElements, sceneVersion);
  if (result) {
    console.debug("[httpStorage] PUT succeeded, cache updated", { roomId, sceneVersion });
    httpStorageSceneVersionCache.set(socket, sceneVersion);

    // 🔥 Touch alla filer
    if (appState.files) {
      const fileIds = Object.keys(appState.files) as FileId[];
      await touchFilesInHttpStorage(fileIds);
    }

    return elements;
  } else {
    console.warn("[httpStorage] PUT failed", { roomId, sceneVersion });
    return false;
  }
};

// ─────────────────────────────────────────────
// Ladda rummet
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
  return elements;
};

// ─────────────────────────────────────────────
// Ladda filer
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
          const { data, metadata } = await decompressData<BinaryFileMetadata>(new Uint8Array(arrayBuffer), { decryptionKey });
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

// ─────────────────────────────────────────────
// Spara filer
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

// ─────────────────────────────────────────────
// Internt: hämta element från buffer
const getElementsFromBuffer = async (
  buffer: ArrayBuffer,
  key: string,
): Promise<readonly ExcalidrawElement[]> => {
  const sceneVersion = parseSceneVersionFromRequest(buffer);
  const iv = new Uint8Array(
    buffer.slice(SCENE_VERSION_LENGTH_BYTES, IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES),
  );
  const encrypted = buffer.slice(IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES, buffer.byteLength);
  return await decryptElements({ sceneVersion, ciphertext: encrypted, iv }, key);
};

// ─────────────────────────────────────────────
// Internt: spara element till backend
const saveElementsToBackend = async (
  roomKey: string,
  roomId: string,
  elements: SyncableExcalidrawElement[],
  sceneVersion: number,
) => {
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  const numberBuffer = new ArrayBuffer(4);
  const numberView = new DataView(numberBuffer);
  numberView.setUint32(0, sceneVersion, false);
  const payloadBlob = await new Response(new Blob([numberBuffer, iv.buffer, ciphertext])).arrayBuffer();
  const putResponse = await fetch(`${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`, { method: "PUT", body: payloadBlob });
  return putResponse.ok;
};

// ─────────────────────────────────────────────
// Internt: parse scene version
const parseSceneVersionFromRequest = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  return view.getUint32(0, false);
};

// ─────────────────────────────────────────────
// Internt: decrypt
const decryptElements = async (data: StoredScene, roomKey: string): Promise<readonly ExcalidrawElement[]> => {
  const decrypted = await decryptData(data.iv, data.ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(new Uint8Array(decrypted));
  return JSON.parse(decodedData);
};

// ─────────────────────────────────────────────
// Internt: encrypt
const encryptElements = async (key: string, elements: readonly ExcalidrawElement[]): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const encoded = new TextEncoder().encode(JSON.stringify(elements));
  const { encryptedBuffer, iv } = await encryptData(key, encoded);
  return { ciphertext: encryptedBuffer, iv };
};
