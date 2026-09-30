import { describe, expect, it } from 'vitest';

import {
  calculateOverallAverage,
  calculateResult,
  parseDecimalToHundredths,
  standardCompetitionRanks,
  validateGradingScheme,
} from '../src/modules/results/domain/result-engine.js';

const assessmentScheme = {
  components: [
    { key: 'ca', label: 'Continuous Assessment', maximumHundredths: 4_000 },
    { key: 'exam', label: 'Examination', maximumHundredths: 6_000 },
  ],
  totalMaximumHundredths: 10_000,
} as const;

const gradingBands = [
  { grade: 'F', maximumPercentageHundredths: 3_999, minimumPercentageHundredths: 0 },
  { grade: 'D', maximumPercentageHundredths: 4_999, minimumPercentageHundredths: 4_000 },
  { grade: 'C', maximumPercentageHundredths: 5_999, minimumPercentageHundredths: 5_000 },
  { grade: 'B', maximumPercentageHundredths: 6_999, minimumPercentageHundredths: 6_000 },
  { grade: 'A', maximumPercentageHundredths: 10_000, minimumPercentageHundredths: 7_000 },
] as const;

describe('result calculation engine', () => {
  it('parses scores into exact integer hundredths and rejects excess scale', () => {
    expect(parseDecimalToHundredths('37.50')).toBe(3_750);
    expect(parseDecimalToHundredths('0')).toBe(0);
    expect(() => parseDecimalToHundredths('3.125')).toThrow(/two places/u);
  });

  it('distinguishes an explicit absence from a scored zero', () => {
    const calculated = calculateResult({
      components: [
        { key: 'ca', scoreHundredths: 0, state: 'SCORED' },
        { key: 'exam', state: 'ABSENT' },
      ],
      exempt: false,
      gradingBands,
      scheme: assessmentScheme,
    });
    expect(calculated).toMatchObject({
      exempt: false,
      grade: 'F',
      percentageDisplay: '0.00',
      totalHundredths: 0,
    });
  });

  it('rejects an unresolved required component', () => {
    expect(() =>
      calculateResult({
        components: [{ key: 'ca', scoreHundredths: 3_000, state: 'SCORED' }],
        exempt: false,
        gradingBands,
        scheme: assessmentScheme,
      }),
    ).toThrow(/explicitly resolved/u);
  });

  it('gives an exempt result no total or grade', () => {
    expect(
      calculateResult({
        components: [],
        exempt: true,
        gradingBands,
        scheme: assessmentScheme,
      }),
    ).toEqual({ exempt: true });
  });

  it('calculates an average from exact subject operands and rounds once', () => {
    const average = calculateOverallAverage([
      { exempt: false, subjectMaximumHundredths: 3_000, totalHundredths: 2_000 },
      { exempt: false, subjectMaximumHundredths: 6_000, totalHundredths: 2_000 },
      { exempt: true },
    ]);
    expect(average.eligibleSubjectCount).toBe(2);
    expect(average.rounded).toBe('50.00');
  });

  it('uses standard competition ranking for ties', () => {
    expect(
      standardCompetitionRanks({
        alpha: '91.20',
        beta: '88.50',
        delta: '70.10',
        gamma: '88.50',
      }),
    ).toEqual({ alpha: 1, beta: 2, delta: 4, gamma: 2 });
  });

  it('rejects overlapping or incomplete grading bands', () => {
    expect(() => {
      validateGradingScheme([
        { grade: 'F', maximumPercentageHundredths: 5_000, minimumPercentageHundredths: 0 },
        { grade: 'A', maximumPercentageHundredths: 10_000, minimumPercentageHundredths: 5_000 },
      ]);
    }).toThrow(/overlap or leave gaps/u);
  });
});
