import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { FORUM_ERROR } from './forum.constants';

const DANGEROUS_CONTENT =
  /(?:<\s*\/?\s*(?:script|iframe|object|embed|img|svg|style|link|meta)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|&#x?0*3c;?\s*script)/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAG = /<[^>]*>/g;

@Injectable()
export class ForumContentSanitizer {
  sanitize(value: string): string {
    const normalized = value.normalize('NFKC').replace(CONTROL_CHARACTERS, '').trim();
    if (DANGEROUS_CONTENT.test(normalized)) {
      throw new AppException(
        FORUM_ERROR.INVALID_CONTENT,
        '内容包含不支持的脚本、标签或危险协议',
        HttpStatus.BAD_REQUEST,
      );
    }
    return normalized.replace(HTML_TAG, '').trim();
  }
}
