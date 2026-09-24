import { AiEnrollment, enrollmentFailure, enrollmentNote } from './enrollment-result';

const reply = (over: Partial<AiEnrollment>): AiEnrollment => ({
  enrolled: 0, template_count: 0, rejected: [],
  pairwise_similarity: { min: null, mean: null },
  model_version: 'buffalo_l/w600k_r50', ...over,
});

describe('enrollmentFailure', () => {
  // The AI answers 200 even when it rejected every photo. Unchecked, the
  // enrollment is marked "synced" while the AI person holds zero templates:
  // the resident looks approved but can never be recognized.
  it('passes an enrollment where every photo produced a template', () => {
    expect(enrollmentFailure(reply({ enrolled: 5, template_count: 5 }), 5)).toBeNull();
  });

  it('fails when the AI accepted nothing, naming each rejection', () => {
    const failure = enrollmentFailure(reply({
      rejected: [
        { filename: 'enrollment-1.jpg', reasons: ['too small: 79px < 80px'] },
        { filename: 'enrollment-2.jpg', reasons: ['too blurry: 12.0 < 60.0'] },
      ],
    }), 5);
    expect(failure).toMatch(/only 0 of 5/);
    expect(failure).toMatch(/too small: 79px < 80px/);
    expect(failure).toMatch(/too blurry/);
  });

  it('fails a partial enrollment: silently dropped photos are still wrong', () => {
    expect(enrollmentFailure(reply({ enrolled: 3, template_count: 3 }), 5)).toMatch(/only 3 of 5/);
  });

  it('still gives a reason when the AI reported no detail', () => {
    expect(enrollmentFailure(reply({}), 5)).toMatch(/no reason reported/);
    expect(enrollmentFailure(undefined, 5)).toMatch(/only 0 of 5/);
  });
});

describe('enrollmentNote', () => {
  it('reports template count and self-similarity on success', () => {
    const note = enrollmentNote(reply({
      enrolled: 5, template_count: 5, pairwise_similarity: { min: 0.712, mean: 0.804 },
    }));
    expect(note).toMatch(/completed successfully/);
    expect(note).toMatch(/5 face templates/);
    expect(note).toMatch(/0\.712/);
  });

  it('flags a weak self-check rather than reporting a flat success', () => {
    const note = enrollmentNote(reply({
      enrolled: 5, template_count: 5, pairwise_similarity: { min: 0.21, mean: 0.4 },
    }));
    expect(note).toMatch(/WEAK/);
    expect(note).toMatch(/0\.210/);
    expect(note).not.toMatch(/completed successfully/);
  });

  it('omits the similarity when only one photo was enrolled', () => {
    expect(enrollmentNote(reply({ enrolled: 1, template_count: 1 })))
      .toBe('AI enrollment completed successfully (1 face templates)');
  });
});
