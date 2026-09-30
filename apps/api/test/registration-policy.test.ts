import { describe, expect, it } from 'vitest';

import {
  assertRegistrationEditable,
  classifyDuplicateCandidate,
  formatStudentId,
  normalizeHumanName,
  normalizePhone,
  normalizeRegistrationData,
  validateRegistrationForSubmission,
} from '../src/modules/student-registration/domain/registration-policy.js';

const completeRegistration = {
  academic: { requestedClassLevelCode: 'JSS1' as const },
  contact: { residentialAddress: '12 Onyx College Road' },
  customResponses: {},
  guardian: { fullName: 'Ada Parent', phone: '08012345678', relationship: 'Mother' },
  medical: {},
  personal: {
    dateOfBirth: '2014-05-11',
    firstName: 'Chidi',
    gender: 'Male',
    nationality: 'Ghanaian',
    surname: 'Okafor',
  },
};

describe('student registration policy', () => {
  it('formats permanent Student IDs with minimum four-digit padding and natural growth', () => {
    expect(formatStudentId(1)).toBe('ONYX/0001');
    expect(formatStudentId(42)).toBe('ONYX/0042');
    expect(formatStudentId(9_999)).toBe('ONYX/9999');
    expect(formatStudentId(10_000)).toBe('ONYX/10000');
  });

  it('normalizes deterministic duplicate candidate values', () => {
    expect(normalizeHumanName('  Chídi   OKAFOR ')).toBe('chídi okafor');
    expect(normalizePhone('0801 234 5678')).toBe('+2348012345678');
  });

  it('restores bounded empty sections minimized by persistence', () => {
    expect(
      normalizeRegistrationData({
        academic: { requestedClassLevelCode: 'JSS1' },
        contact: {},
        guardian: {},
        personal: {},
      }),
    ).toEqual({
      academic: { requestedClassLevelCode: 'JSS1' },
      contact: {},
      customResponses: {},
      guardian: {},
      medical: {},
      personal: {},
    });
  });

  it('classifies exact identity candidates as strong and partial candidates as warnings', () => {
    const identity = {
      normalizedDateOfBirth: '2014-05-11',
      normalizedFirstName: 'chidi',
      normalizedGuardianPhone: '+2348012345678',
      normalizedSurname: 'okafor',
    };
    expect(classifyDuplicateCandidate(identity, identity)).toEqual({
      confidence: 'STRONG',
      matchedFields: [
        'normalizedDateOfBirth',
        'normalizedFirstName',
        'normalizedGuardianPhone',
        'normalizedSurname',
      ],
    });
    expect(
      classifyDuplicateCandidate(identity, {
        normalizedDateOfBirth: identity.normalizedDateOfBirth,
        normalizedSurname: identity.normalizedSurname,
      }),
    ).toMatchObject({ confidence: 'FUZZY' });
    expect(
      classifyDuplicateCandidate(identity, { normalizedSurname: identity.normalizedSurname }),
    ).toBeNull();
  });

  it('requires Nigerian state/LGA and senior track without conflating junior placement', () => {
    expect(() => {
      validateRegistrationForSubmission(completeRegistration, [], [], true);
    }).not.toThrow();
    expect(() => {
      validateRegistrationForSubmission(
        {
          ...completeRegistration,
          personal: { ...completeRegistration.personal, nationality: 'Nigerian' },
        },
        [],
        [],
        true,
      );
    }).toThrow(/invalid values/iu);
    expect(() => {
      validateRegistrationForSubmission(
        { ...completeRegistration, academic: { requestedClassLevelCode: 'SS1' } },
        [],
        [],
        true,
      );
    }).toThrow(/invalid values/iu);
    expect(() => {
      validateRegistrationForSubmission(
        {
          ...completeRegistration,
          academic: { requestedClassLevelCode: 'JSS1', requestedTrackCode: 'SCIENCE' },
        },
        [],
        [],
        true,
      );
    }).toThrow(/invalid values/iu);
  });

  it('distinguishes editable change requests from submitted and rejected states', () => {
    expect(() => {
      assertRegistrationEditable('DRAFT');
    }).not.toThrow();
    expect(() => {
      assertRegistrationEditable('CHANGES_REQUESTED');
    }).not.toThrow();
    expect(() => {
      assertRegistrationEditable('SUBMITTED');
    }).toThrow(/read-only/iu);
    expect(() => {
      assertRegistrationEditable('REJECTED');
    }).toThrow(/read-only/iu);
  });

  it('validates custom field types, options, ranges, and the required passport', () => {
    const fields = [
      {
        displayOrder: 1,
        enabled: true,
        key: 'language',
        label: 'Language',
        options: ['English', 'French'],
        required: true,
        section: 'personal',
        type: 'SELECT' as const,
      },
      {
        displayOrder: 2,
        enabled: true,
        key: 'siblings',
        label: 'Siblings',
        required: true,
        section: 'personal',
        type: 'NUMBER' as const,
        validation: { maximum: 10, minimum: 0 },
      },
      {
        displayOrder: 3,
        enabled: true,
        key: 'availableFrom',
        label: 'Available from',
        required: true,
        section: 'personal',
        type: 'DATE' as const,
        validation: { earliestDate: '2026-01-01', latestDate: '2026-12-31' },
      },
    ];
    expect(() => {
      validateRegistrationForSubmission(
        {
          ...completeRegistration,
          customResponses: {
            availableFrom: '2026-09-01',
            language: 'English',
            siblings: 2,
          },
        },
        [],
        fields,
        true,
      );
    }).not.toThrow();
    expect(() => {
      validateRegistrationForSubmission(
        {
          ...completeRegistration,
          customResponses: {
            availableFrom: '2027-01-01',
            language: 'German',
            siblings: 11,
          },
        },
        [],
        fields,
        false,
      );
    }).toThrow(/invalid values/iu);
  });

  it('rejects values for canonical and custom fields disabled by the governing version', () => {
    expect(() => {
      validateRegistrationForSubmission(
        {
          ...completeRegistration,
          contact: { ...completeRegistration.contact, phone: '08012345678' },
          customResponses: { legacyField: 'not allowed' },
        },
        [
          {
            displayOrder: 1,
            enabled: false,
            key: 'studentPhone',
            label: 'Student phone',
            required: false,
            section: 'contact',
          },
        ],
        [],
        true,
      );
    }).toThrow(/invalid values/iu);
  });
});
