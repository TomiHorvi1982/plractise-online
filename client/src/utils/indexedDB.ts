const DB_NAME = 'jamstream-db';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudioBuffer(
  songId: string,
  trackId: string,
  data: ArrayBuffer,
  name: string,
  type: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').put({ id: `${songId}:${trackId}`, data, name, type, timestamp: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadAudioBuffer(
  songId: string,
  trackId: string,
): Promise<{ data: ArrayBuffer; name: string; type: string } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readonly');
    const req = tx.objectStore('audio').get(`${songId}:${trackId}`);
    req.onsuccess = () => {
      db.close();
      const result = req.result;
      if (!result) resolve(null);
      else resolve({ data: result.data, name: result.name, type: result.type });
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteAudioBuffer(songId: string, trackId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').delete(`${songId}:${trackId}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listAudioBuffers(): Promise<{ id: string; name: string; type: string; timestamp: number }[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readonly');
    const req = tx.objectStore('audio').getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result.map((r: any) => ({ id: r.id, name: r.name, type: r.type, timestamp: r.timestamp })));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function clearAllAudio(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
