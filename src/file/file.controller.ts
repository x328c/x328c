import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadCallbackDto, UploadSignatureDto } from './dto';
import { FileService } from './file.service';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(private readonly files: FileService) {}
  @Get('upload-signature') signature(
    @Req() req: Request & { user: JwtPayload },
    @Query() dto: UploadSignatureDto,
  ) {
    return this.files.createUploadSignature(BigInt(req.user.sub), dto);
  }
  @Post('callback') callback(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UploadCallbackDto,
  ) {
    return this.files.recordUpload(BigInt(req.user.sub), dto);
  }
}
