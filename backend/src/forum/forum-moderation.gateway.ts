import { Injectable } from '@nestjs/common';

export type ModerationDecision =
  | { decision: 'pass' }
  | { decision: 'reject'; reason: string }
  | { decision: 'error'; code: string };

@Injectable()
export class ForumModerationGateway {
  async checkText(_content: string, _dataId: string): Promise<ModerationDecision> {
    return { decision: 'pass' };
  }

  async checkImage(_fileUrl: string): Promise<ModerationDecision> {
    return { decision: 'pass' };
  }
}
