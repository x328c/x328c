import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { ForumModule } from '../forum/forum.module';

@Module({ imports: [ForumModule], controllers: [FileController], providers: [FileService] })
export class FileModule {}
