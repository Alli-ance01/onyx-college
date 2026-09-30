export interface AssignmentAttachmentDto {
  displayName: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AssignmentDto {
  academicSession: { id: string; label: string };
  attachments: readonly AssignmentAttachmentDto[];
  classLevel: { code: string; id: string; name: string };
  createdAt: string;
  dueAt: string;
  id: string;
  instructions: string;
  publishedAt?: string;
  status: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED';
  subject: { code: string; id: string; name: string };
  teacher: { id: string; name: string };
  title: string;
  track?: { code: string; id: string; name: string };
  version: number;
}

export const announcementAudienceTypes = [
  'SCHOOL',
  'STUDENTS',
  'TEACHERS',
  'JUNIOR_SCHOOL',
  'SENIOR_SCHOOL',
  'CLASS',
  'TRACK',
  'CLASS_TRACK',
  'SPECIFIC_USERS',
] as const;
export type AnnouncementAudienceType = (typeof announcementAudienceTypes)[number];

export interface AnnouncementDto {
  audience: {
    classLevelId?: string;
    label: string;
    trackId?: string;
    type: AnnouncementAudienceType;
    userIds?: readonly string[];
  };
  author: { id: string; name: string };
  body: string;
  createdAt: string;
  expiresAt?: string;
  id: string;
  publishedAt?: string;
  status: 'ARCHIVED' | 'DRAFT' | 'EXPIRED' | 'PUBLISHED' | 'WITHDRAWN';
  title: string;
  version: number;
}

export interface NotificationDto {
  body: string;
  createdAt: string;
  id: string;
  readAt?: string;
  resourceId?: string;
  resourceType?: string;
  title: string;
  type: string;
}
