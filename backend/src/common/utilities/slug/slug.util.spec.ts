import { SlugUtil } from './slug.util';

describe('SlugUtil', () => {
  it('generates clean English slugs', () => {
    expect(SlugUtil.generate('Ethiopian Yirgacheffe Specialty!')).toBe(
      'ethiopian-yirgacheffe-specialty',
    );
  });

  it('generates clean Arabic slugs and normalizes Alef variants', () => {
    expect(SlugUtil.generate('قهوة مختصة إثيوبية')).toBe('قهوة-مختصة-اثيوبية');
  });

  it('appends a unique hex suffix when requested', () => {
    const slug = SlugUtil.generate('Colombian Supremo', true);
    expect(slug).toMatch(/^colombian-supremo-[0-9a-f]{6}$/);
  });
});

