import { Decimal } from 'decimal.js';

import { ValidationError } from '../../../app/errors/app-error.js';

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

export const SCORE_SCALE = 100;
const MAX_PERCENTAGE_HUNDREDTHS = 100 * SCORE_SCALE;
const scorePattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u;

export interface AssessmentComponentDefinition {
  key: string;
  label: string;
  maximumHundredths: number;
}

export interface AssessmentSchemeDefinition {
  components: readonly AssessmentComponentDefinition[];
  totalMaximumHundredths: number;
}

export interface GradeBandDefinition {
  grade: string;
  maximumPercentageHundredths: number;
  minimumPercentageHundredths: number;
  remark?: string;
}

export interface ResultComponentResolution {
  key: string;
  scoreHundredths?: number;
  state: 'ABSENT' | 'SCORED';
}

export interface CalculatedNormalResult {
  exempt: false;
  grade: string;
  percentageDisplay: string;
  percentageExact: string;
  subjectMaximumHundredths: number;
  totalHundredths: number;
}

export interface CalculatedExemptResult {
  exempt: true;
}

export type CalculatedResult = CalculatedExemptResult | CalculatedNormalResult;

export interface AggregateSubjectOperand {
  exempt: boolean;
  subjectMaximumHundredths?: number;
  totalHundredths?: number;
}

function integerHundredths(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative decimal with at most two places.`);
  }
  return value;
}

export function parseDecimalToHundredths(value: string, label = 'Score'): number {
  const normalized = value.trim();
  if (!scorePattern.test(normalized)) {
    throw new ValidationError(`${label} must be a non-negative decimal with at most two places.`);
  }
  const hundredths = new Decimal(normalized).times(SCORE_SCALE);
  if (!hundredths.isInteger() || hundredths.greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError(`${label} is outside the supported range.`);
  }
  return hundredths.toNumber();
}

export function formatHundredths(value: number): string {
  integerHundredths(value, 'Value');
  return new Decimal(value).div(SCORE_SCALE).toFixed(2);
}

export function validateAssessmentScheme(scheme: AssessmentSchemeDefinition): void {
  if (scheme.components.length === 0) {
    throw new ValidationError('An assessment scheme requires at least one component.');
  }
  const keys = new Set<string>();
  let calculatedMaximum = 0;
  for (const component of scheme.components) {
    const key = component.key.trim();
    if (key.length === 0 || keys.has(key)) {
      throw new ValidationError('Assessment component keys must be non-empty and unique.');
    }
    keys.add(key);
    const maximum = integerHundredths(component.maximumHundredths, 'Component maximum');
    if (maximum === 0) {
      throw new ValidationError('Assessment component maximums must be greater than zero.');
    }
    calculatedMaximum += maximum;
    if (!Number.isSafeInteger(calculatedMaximum)) {
      throw new ValidationError('The assessment scheme maximum is outside the supported range.');
    }
  }
  const declaredMaximum = integerHundredths(
    scheme.totalMaximumHundredths,
    'Assessment scheme maximum',
  );
  if (declaredMaximum === 0 || declaredMaximum !== calculatedMaximum) {
    throw new ValidationError('Assessment component maximums must equal the declared total.');
  }
}

export function validateGradingScheme(bands: readonly GradeBandDefinition[]): void {
  if (bands.length === 0) throw new ValidationError('A grading scheme requires grade bands.');
  const sorted = [...bands].sort(
    (left, right) => left.minimumPercentageHundredths - right.minimumPercentageHundredths,
  );
  const grades = new Set<string>();
  for (const [index, band] of sorted.entries()) {
    integerHundredths(band.minimumPercentageHundredths, 'Grade minimum');
    integerHundredths(band.maximumPercentageHundredths, 'Grade maximum');
    if (
      band.minimumPercentageHundredths > band.maximumPercentageHundredths ||
      band.maximumPercentageHundredths > MAX_PERCENTAGE_HUNDREDTHS
    ) {
      throw new ValidationError('Each grade band must stay within 0.00 to 100.00 percent.');
    }
    if (band.grade.trim().length === 0 || grades.has(band.grade.trim())) {
      throw new ValidationError('Grade labels must be non-empty and unique.');
    }
    grades.add(band.grade.trim());
    if (index === 0 && band.minimumPercentageHundredths !== 0) {
      throw new ValidationError('The grading scheme must start at 0.00 percent.');
    }
    const previous = sorted[index - 1];
    if (
      previous !== undefined &&
      band.minimumPercentageHundredths !== previous.maximumPercentageHundredths + 1
    ) {
      throw new ValidationError('Grade bands must not overlap or leave gaps.');
    }
  }
  if (sorted.at(-1)?.maximumPercentageHundredths !== MAX_PERCENTAGE_HUNDREDTHS) {
    throw new ValidationError('The grading scheme must end at 100.00 percent.');
  }
}

export function validateResolvedComponents(
  scheme: AssessmentSchemeDefinition,
  components: readonly ResultComponentResolution[],
): void {
  validateAssessmentScheme(scheme);
  if (components.length !== scheme.components.length) {
    throw new ValidationError('Every assessment component must be explicitly resolved.');
  }
  const byKey = new Map<string, ResultComponentResolution>();
  for (const component of components) {
    if (byKey.has(component.key)) {
      throw new ValidationError('A result cannot contain duplicate assessment components.');
    }
    byKey.set(component.key, component);
  }
  for (const definition of scheme.components) {
    const component = byKey.get(definition.key);
    if (component === undefined) {
      throw new ValidationError('Every assessment component must be explicitly resolved.');
    }
    if (component.state === 'ABSENT') {
      if (component.scoreHundredths !== undefined) {
        throw new ValidationError('An absent component cannot also carry a score.');
      }
      continue;
    }
    if (component.scoreHundredths === undefined) {
      throw new ValidationError('A scored component requires a score.');
    }
    const score = integerHundredths(component.scoreHundredths, 'Component score');
    if (score > definition.maximumHundredths) {
      throw new ValidationError(
        `${definition.label} cannot exceed ${formatHundredths(definition.maximumHundredths)}.`,
      );
    }
  }
  for (const key of byKey.keys()) {
    if (!scheme.components.some((component) => component.key === key)) {
      throw new ValidationError(`Unknown assessment component: ${key}.`);
    }
  }
}

function gradeForPercentage(
  percentage: Decimal,
  gradingBands: readonly GradeBandDefinition[],
): string {
  validateGradingScheme(gradingBands);
  const band = gradingBands.find((candidate) => {
    const minimum = new Decimal(candidate.minimumPercentageHundredths).div(SCORE_SCALE);
    const maximum = new Decimal(candidate.maximumPercentageHundredths).div(SCORE_SCALE);
    return percentage.greaterThanOrEqualTo(minimum) && percentage.lessThanOrEqualTo(maximum);
  });
  if (band === undefined) {
    throw new ValidationError('The calculated score is not covered by the grading scheme.');
  }
  return band.grade;
}

export function calculateResult(input: {
  components: readonly ResultComponentResolution[];
  exempt: boolean;
  gradingBands: readonly GradeBandDefinition[];
  scheme: AssessmentSchemeDefinition;
}): CalculatedResult {
  validateAssessmentScheme(input.scheme);
  validateGradingScheme(input.gradingBands);
  if (input.exempt) {
    if (input.components.length > 0) {
      throw new ValidationError('An exempt result cannot contain normal component scores.');
    }
    return { exempt: true };
  }
  validateResolvedComponents(input.scheme, input.components);
  const totalHundredths = input.components.reduce(
    (total, component) =>
      total + (component.state === 'SCORED' ? (component.scoreHundredths ?? 0) : 0),
    0,
  );
  const percentage = new Decimal(totalHundredths)
    .div(input.scheme.totalMaximumHundredths)
    .times(100);
  return {
    exempt: false,
    grade: gradeForPercentage(percentage, input.gradingBands),
    percentageDisplay: percentage.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    percentageExact: percentage.toString(),
    subjectMaximumHundredths: input.scheme.totalMaximumHundredths,
    totalHundredths,
  };
}

export function calculateOverallAverage(subjects: readonly AggregateSubjectOperand[]): {
  eligibleSubjectCount: number;
  exact: string;
  rounded: string;
} {
  const eligible = subjects.filter((subject) => !subject.exempt);
  if (eligible.length === 0) {
    throw new ValidationError('A report requires at least one eligible non-exempt subject.');
  }
  let sum = new Decimal(0);
  for (const subject of eligible) {
    if (
      subject.totalHundredths === undefined ||
      subject.subjectMaximumHundredths === undefined ||
      subject.subjectMaximumHundredths <= 0
    ) {
      throw new ValidationError('Every eligible subject requires a resolved authoritative result.');
    }
    integerHundredths(subject.totalHundredths, 'Subject total');
    integerHundredths(subject.subjectMaximumHundredths, 'Subject maximum');
    sum = sum.plus(
      new Decimal(subject.totalHundredths).div(subject.subjectMaximumHundredths).times(100),
    );
  }
  const average = sum.div(eligible.length);
  return {
    eligibleSubjectCount: eligible.length,
    exact: average.toString(),
    rounded: average.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
  };
}

export function standardCompetitionRanks(
  averagesById: Readonly<Record<string, string>>,
): Readonly<Record<string, number>> {
  const ordered = Object.entries(averagesById).sort((left, right) => {
    const comparison = new Decimal(right[1]).comparedTo(left[1]);
    return comparison === 0 ? left[0].localeCompare(right[0]) : comparison;
  });
  const result: Record<string, number> = {};
  let previousAverage: Decimal | undefined;
  let previousRank = 0;
  ordered.forEach(([id, average], index) => {
    const current = new Decimal(average);
    const rank = previousAverage?.equals(current) === true ? previousRank : index + 1;
    result[id] = rank;
    previousAverage = current;
    previousRank = rank;
  });
  return result;
}
