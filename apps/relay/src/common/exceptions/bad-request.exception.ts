import { HttpException } from './http.exception';

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', code?: string) {
    super(400, message, code);
  }
}
