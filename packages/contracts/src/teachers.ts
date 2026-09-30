export const teacherStatuses = [
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
  'ARCHIVED',
] as const;
export type TeacherStatus = (typeof teacherStatuses)[number];

export const teacherRegistrationStatuses = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;
export type TeacherRegistrationStatus = (typeof teacherRegistrationStatuses)[number];

export interface TeacherDto {
  email?: string;
  firstName: string;
  id: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  staffId?: string;
  status: TeacherStatus;
  userId: string;
}

export interface TeacherInvitationDto {
  acceptedAt?: string;
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  invitedName: string;
  status: 'ACCEPTED' | 'EXPIRED' | 'PENDING' | 'REVOKED';
}

export interface TeacherRegistrationDto {
  data: {
    address?: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone?: string;
    qualifications?: string;
  };
  id: string;
  status: TeacherRegistrationStatus;
  submittedAt?: string;
  userId: string;
  version: number;
}

export interface TeachingAssignmentDto {
  academicSession: { id: string; label: string };
  classLevel: { code: string; id: string; name: string };
  id: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'PLANNED' | 'REVOKED';
  subject: { code: string; id: string; name: string };
  teacher: { id: string; name: string };
  track?: { code: string; id: string; name: string };
  type: 'TEACHING';
}

export interface ClassTeacherAssignmentDto {
  academicSession: { id: string; label: string };
  classLevel: { code: string; id: string; name: string };
  id: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'PLANNED' | 'REVOKED';
  teacher: { id: string; name: string };
  track?: { code: string; id: string; name: string };
  type: 'CLASS_TEACHER';
}

export interface TeacherDashboardDto {
  activeClassCount: number;
  activeSubjectCount: number;
  assignmentsDueSoon: number;
  displayName: string;
  recentAnnouncements: number;
  teacher: TeacherDto;
}
