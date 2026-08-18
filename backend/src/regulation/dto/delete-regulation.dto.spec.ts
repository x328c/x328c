import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BatchDeleteRegulationsDto, DeleteRegulationDto } from './delete-regulation.dto';

describe('V2.2 regulation deletion DTOs', () => {
  it('trims and accepts a valid deletion reason', async () => {
    const dto = plainToInstance(DeleteRegulationDto, { reason: '  内容不再属于摩托车法规  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('内容不再属于摩托车法规');
  });

  it('rejects duplicate IDs and a blank reason', async () => {
    const dto = plainToInstance(BatchDeleteRegulationsDto, { ids: ['1', '1'], reason: '  ' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['ids', 'reason']));
  });

  it('rejects non-positive and malformed IDs', async () => {
    const dto = plainToInstance(BatchDeleteRegulationsDto, { ids: ['0', '-2', 'abc'], reason: '批量清理' });
    expect((await validate(dto)).some((error) => error.property === 'ids')).toBe(true);
  });
});
