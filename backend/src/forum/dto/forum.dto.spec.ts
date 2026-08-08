import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateForumPostDto, CreateForumReplyDto } from './forum.dto';

describe('forum DTOs', () => {
  it('limits posts to nine numeric image IDs', async () => {
    const dto = plainToInstance(CreateForumPostDto, {
      board_id: '1',
      title: '新手骑行安全经验',
      content: '这是至少十个字的安全经验正文。',
      image_ids: Array.from({ length: 10 }, (_, index) => String(index + 1)),
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('does not accept parentId for V2 replies under whitelist validation', async () => {
    const dto = plainToInstance(CreateForumReplyDto, { content: '一级回复', parentId: '99' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(
      0,
    );
  });
});
