export interface IApiResponse<T = unknown> {
  data: T;
}

export interface IApiErrorResponse {
  error: string;
  code?:  string;
}
