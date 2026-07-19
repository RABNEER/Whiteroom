import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '../api/client';

export interface OfflineAttendance {
  sessionId: string;
  records: Array<{ studentId: string; status: string }>;
  idempotencyKey: string;
  timestamp: number;
}

const STORAGE_KEY = 'whiteroom_offline_attendance_queue';

let memoryQueue: OfflineAttendance[] = [];
let queueLock: Promise<any> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueLock.then(() => fn());
  queueLock = next.catch(() => {});
  return next;
}

async function saveQueue(queue: OfflineAttendance[]) {
  try {
    const jsonValue = JSON.stringify(queue);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, jsonValue);
      }
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, jsonValue);
    }
  } catch (e) {
    console.error('Failed to save offline queue', e);
  }
  memoryQueue = queue;
}

export async function loadQueue(): Promise<OfflineAttendance[]> {
  try {
    let jsonValue: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        jsonValue = window.localStorage.getItem(STORAGE_KEY);
      }
    } else {
      jsonValue = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (jsonValue) {
      return JSON.parse(jsonValue) as OfflineAttendance[];
    }
  } catch (e) {
    console.error('Failed to load offline queue', e);
  }
  return memoryQueue;
}

export function isOnline(): boolean {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  return true;
}

export const offlineQueue = {
  enqueue: async (attendance: OfflineAttendance) => {
    return withLock(async () => {
      // FIX: Offline queue race condition — two teachers overwrite each other
      const queue = await loadQueue();
      const existingIndex = queue.findIndex(
        (item) => item.sessionId === attendance.sessionId
      );

      if (existingIndex !== -1) {
        // Update existing entry instead of creating duplicate
        queue[existingIndex] = {
          ...queue[existingIndex],
          records: attendance.records,
          timestamp: Date.now(),
          idempotencyKey: queue[existingIndex].idempotencyKey, // KEEP original key
        };
      } else {
        const MAX_QUEUE_SIZE = 50;
        if (queue.length >= MAX_QUEUE_SIZE) {
          // Auto flush existing queue items before pushing new item when over capacity
          const remaining: OfflineAttendance[] = [];
          for (const item of queue) {
            try {
              await api.attendanceMark(item.sessionId, {
                records: item.records,
                idempotencyKey: item.idempotencyKey,
              });
            } catch (e) {
              console.error(`Failed to auto-sync session ${item.sessionId}`, e);
              remaining.push(item);
            }
          }
          await saveQueue(remaining);
          const freshQueue = await loadQueue();
          freshQueue.push(attendance);
          await saveQueue(freshQueue);
          return;
        }
        queue.push(attendance);
      }
      await saveQueue(queue);
    });
  },

  getQueue: async () => {
    return withLock(async () => {
      return loadQueue();
    });
  },

  remove: async (sessionId: string) => {
    return withLock(async () => {
      const queue = await loadQueue();
      const filtered = queue.filter(item => item.sessionId !== sessionId);
      await saveQueue(filtered);
    });
  },

  clear: async () => {
    return withLock(async () => {
      await saveQueue([]);
    });
  },

  flush: async (apiMarkFn: (sessionId: string, payload: { records: Array<{ studentId: string; status: string }>; idempotencyKey: string }) => Promise<any>): Promise<{ success: number; failed: number }> => {
    return withLock(async () => {
      const queue = await loadQueue();
      if (queue.length === 0) return { success: 0, failed: 0 };

      let success = 0;
      let failed = 0;
      const remaining: OfflineAttendance[] = [];

      for (const item of queue) {
        try {
          await apiMarkFn(item.sessionId, {
            records: item.records,
            idempotencyKey: item.idempotencyKey,
          });
          success++;
        } catch (e) {
          console.error(`Failed to sync offline attendance for session ${item.sessionId}`, e);
          failed++;
          remaining.push(item);
        }
      }

      await saveQueue(remaining);
      return { success, failed };
    });
  }
};
