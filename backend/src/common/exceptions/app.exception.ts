import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(code: number, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ code, message }, status);
  }
}
