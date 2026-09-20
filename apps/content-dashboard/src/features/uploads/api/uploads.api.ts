import { apiClient } from '@/lib/api-client';

// ─── Single-PUT presign ───────────────────────────────────────────────────────

export interface PresignRequest {
  episodeId:    string;
  chapterId:    string;
  variantTag:   string;
  contentType:  string;
  fileSizeBytes: number;
}

export interface PresignResponse {
  uploadUrl: string;
  key:       string;
  publicUrl: string;
  expiresIn: number;
}

export function presignUpload(req: PresignRequest): Promise<PresignResponse> {
  return apiClient.post<PresignResponse>('/uploads/presign', req);
}

// ─── Multipart upload ─────────────────────────────────────────────────────────

export interface PartUrl {
  partNumber: number;
  url:        string;
}

export interface MultipartCreateRequest {
  episodeId:    string;
  chapterId:    string;
  variantTag:   string;
  contentType:  string;
  fileSizeBytes: number;
  partCount:    number;
}

export interface MultipartCreateResponse {
  key:       string;
  uploadId:  string;
  publicUrl: string;
  partUrls:  PartUrl[];
}

export interface CompletedPart {
  partNumber: number;
  eTag:       string;
}

export interface MultipartCompleteRequest {
  key:      string;
  uploadId: string;
  parts:    CompletedPart[];
}

export interface MultipartCompleteResponse {
  publicUrl: string;
}

export interface MultipartAbortRequest {
  key:      string;
  uploadId: string;
}

export function multipartCreate(req: MultipartCreateRequest): Promise<MultipartCreateResponse> {
  return apiClient.post<MultipartCreateResponse>('/uploads/multipart/create', req);
}

export function multipartComplete(req: MultipartCompleteRequest): Promise<MultipartCompleteResponse> {
  return apiClient.post<MultipartCompleteResponse>('/uploads/multipart/complete', req);
}

export function multipartAbort(req: MultipartAbortRequest): Promise<void> {
  return apiClient.post<void>('/uploads/multipart/abort', req);
}
