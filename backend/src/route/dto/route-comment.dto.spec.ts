import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRouteCommentDto } from './route-comment.dto';

describe('CreateRouteCommentDto', () => {
  it('accepts up to two HTTP(S) image URLs', async () => {
    const dto = plainToInstance(CreateRouteCommentDto, {
      content: '这条路线风景很好',
      images: ['https://cdn.example.com/one.jpg', 'http://cdn.example.com/two.png'],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects more than two image URLs', async () => {
    const dto = plainToInstance(CreateRouteCommentDto, {
      content: '这条路线风景很好',
      images: [
        'https://cdn.example.com/one.jpg',
        'https://cdn.example.com/two.jpg',
        'https://cdn.example.com/three.jpg',
      ],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects non-URL image values', async () => {
    const dto = plainToInstance(CreateRouteCommentDto, {
      content: '这条路线风景很好',
      images: ['javascript:alert(1)'],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
