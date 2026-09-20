import { HttpException } from './http.exception';

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found', code?: string) {
    super(404, message, code);
  }
}
