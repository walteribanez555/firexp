import { toast } from 'sonner';

const BASE_URL: string =
  import.meta.env['VITE_CONTENT_API_URL'] ??
  'http://localhost:3003/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore parse error
    }
    const err = new ApiError(res.status, message);
    toast.error(`API Error: ${message}`);
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const json = (await res.json()) as { data: T } | T;
  // Unwrap {data} envelope if present
  if (json !== null && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};

/** Upload directly to a presigned S3 PUT URL — no auth header, just Content-Type */
export async function uploadToS3(
  presignedUrl: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('S3 upload network error'));
    xhr.send(file);
  });
}

export interface PartUploadResult {
  partNumber: number;
  eTag:       string;
}

/**
 * Upload one slice of a File to a presigned S3 UploadPart URL.
 * Returns the ETag from the response header (requires CORS ExposeHeaders: ETag).
 */
export async function uploadPartToS3(
  presignedUrl: string,
  blob:         Blob,
  contentType:  string,
  onProgress?:  (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    // S3 multipart parts must be uploaded with the same Content-Type as the object.
    xhr.setRequestHeader('Content-Type', contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // ETag is exposed via CORS ExposeHeaders (infra team configured this).
        const eTag = xhr.getResponseHeader('ETag');
        if (!eTag) {
          reject(new Error('S3 did not return an ETag header for the part upload. Ensure CORS ExposeHeaders includes "ETag".'));
          return;
        }
        resolve(eTag);
      } else {
        reject(new Error(`S3 part upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('S3 part upload network error'));
    xhr.send(blob);
  });
}
