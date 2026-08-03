import { validate } from 'class-validator';
import { SearchDTO, SearchSuggestionDTO } from './search.dto';

describe('search DTO validation', () => {
  it('rejects search limits above 100', async () => {
    const dto = Object.assign(new SearchDTO(), { query: 'term', limit: 101 });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects negative search offsets', async () => {
    const dto = Object.assign(new SearchDTO(), { query: 'term', offset: -1 });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects suggestion limits above 25', async () => {
    const dto = Object.assign(new SearchSuggestionDTO(), {
      query: 'term',
      limit: 26,
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
