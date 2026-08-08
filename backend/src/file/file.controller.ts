import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadCallbackDto, UploadSignatureDto } from './dto';
import { FileService } from './file.service';
import { ForumAccessService } from '../forum/forum-access.service';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(
    private readonly files: FileService,
    private readonly forumAccess: ForumAccessService,
  ) {}
  @Get('upload-signature') async signature(
    @Req() req: Request & { user: JwtPayload },
    @Query() dto: UploadSignatureDto,
  ) {
    if (dto.category === 'forum') await this.forumAccess.assertCanPublish(BigInt(req.user.sub));
    return this.files.createUploadSignature(BigInt(req.user.sub), dto);
  }
  @Post('callback') async callback(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UploadCallbackDto,
  ) {
    if (dto.file_key.startsWith('forum/')) {
      await this.forumAccess.assertCanPublish(BigInt(req.user.sub));
    }
    return this.files.recordUpload(BigInt(req.user.sub), dto);
  }
}
