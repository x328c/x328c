import { Global, Module } from '@nestjs/common';
import { ContentSecurityService } from './content-security.service';

@Global()
@Module({ providers: [ContentSecurityService], exports: [ContentSecurityService] })
export class ContentSecurityModule {}
