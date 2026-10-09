export type PortalName = 'Admin Portal' | 'Student Portal' | 'Teacher Portal';

interface NavigationItem {
  label: string;
  permissions?: readonly string[];
  shortLabel: string;
  to: string;
}

interface NavigationGroup {
  label: string;
  items: readonly NavigationItem[];
}

const studentNavigation: readonly NavigationGroup[] = [
  {
    label: 'Student portal',
    items: [
      { label: 'Dashboard', shortLabel: 'D', to: '/student/dashboard' },
      { label: 'Timetable', shortLabel: 'T', to: '/student/timetable' },
      { label: 'Assignments', shortLabel: 'A', to: '/student/assignments' },
      { label: 'Announcements', shortLabel: 'N', to: '/student/announcements' },
      { label: 'Results', shortLabel: 'R', to: '/student/results' },
      { label: 'Subjects', shortLabel: 'S', to: '/student/subjects' },
      { label: 'Academic history', shortLabel: 'H', to: '/student/academic-history' },
      { label: 'Documents', shortLabel: 'F', to: '/student/documents' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Profile', shortLabel: 'P', to: '/student/profile' },
      { label: 'Notifications', shortLabel: 'N', to: '/student/notifications' },
      { label: 'Settings', shortLabel: 'S', to: '/student/settings' },
    ],
  },
];

const teacherNavigation: readonly NavigationGroup[] = [
  {
    label: 'Teaching',
    items: [
      { label: 'Dashboard', shortLabel: 'D', to: '/teacher' },
      { label: 'Timetable', shortLabel: 'T', to: '/teacher/timetable' },
      {
        label: 'My classes',
        permissions: ['students.read', 'enrollments.read'],
        shortLabel: 'C',
        to: '/teacher/classes',
      },
      {
        label: 'My subjects',
        permissions: ['students.read', 'enrollments.read'],
        shortLabel: 'S',
        to: '/teacher/subjects',
      },
      {
        label: 'Students',
        permissions: ['students.read'],
        shortLabel: 'ST',
        to: '/teacher/students',
      },
      {
        label: 'Assignments',
        permissions: ['assignments.create', 'assignments.update', 'assignments.publish'],
        shortLabel: 'A',
        to: '/teacher/assignments',
      },
      {
        label: 'Results',
        permissions: ['results.enter', 'results.submit', 'results.request_correction'],
        shortLabel: 'R',
        to: '/teacher/results',
      },
      {
        label: 'Announcements',
        permissions: ['announcements.create_scoped', 'announcements.update_own'],
        shortLabel: 'N',
        to: '/teacher/announcements',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Notifications', shortLabel: 'N', to: '/teacher/notifications' },
      { label: 'Profile', shortLabel: 'P', to: '/teacher/profile' },
      { label: 'Settings', shortLabel: 'S', to: '/teacher/settings' },
    ],
  },
];

const adminNavigation: readonly NavigationGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', shortLabel: 'D', to: '/admin' }],
  },
  {
    label: 'Students',
    items: [
      {
        label: 'All students',
        permissions: ['students.read'],
        shortLabel: 'ST',
        to: '/admin/students',
      },
      {
        label: 'Registration review',
        permissions: ['students.approve_registration'],
        shortLabel: 'RR',
        to: '/admin/students/registrations',
      },
      {
        label: 'Graduated',
        permissions: ['students.read'],
        shortLabel: 'G',
        to: '/admin/students/graduated',
      },
      {
        label: 'Archived',
        permissions: ['students.read'],
        shortLabel: 'AR',
        to: '/admin/students/archived',
      },
      {
        label: 'Correction requests',
        permissions: ['students.manage_corrections'],
        shortLabel: 'CR',
        to: '/admin/students/corrections',
      },
    ],
  },
  {
    label: 'Teachers',
    items: [
      {
        label: 'All teachers',
        permissions: ['teachers.read'],
        shortLabel: 'T',
        to: '/admin/teachers',
      },
      {
        label: 'Pending approvals',
        permissions: ['teachers.approve'],
        shortLabel: 'PA',
        to: '/admin/teachers/approvals',
      },
      {
        label: 'Invitations',
        permissions: ['teachers.invite', 'teachers.create'],
        shortLabel: 'I',
        to: '/admin/teachers/invitations',
      },
      {
        label: 'Teaching assignments',
        permissions: ['teachers.assign'],
        shortLabel: 'TA',
        to: '/admin/teachers/assignments',
      },
    ],
  },
  {
    label: 'Academic structure',
    items: [
      {
        label: 'Timetable',
        shortLabel: 'T',
        to: '/admin/timetable',
        permissions: ['timetable.manage'],
      },
      {
        label: 'Sessions',
        permissions: ['sessions.manage'],
        shortLabel: 'SE',
        to: '/admin/academics/sessions',
      },
      {
        label: 'Terms',
        permissions: ['terms.manage'],
        shortLabel: 'TM',
        to: '/admin/academics/terms',
      },
      {
        label: 'Classes',
        permissions: ['classes.manage'],
        shortLabel: 'CL',
        to: '/admin/academics/classes',
      },
      {
        label: 'Senior tracks',
        permissions: ['tracks.manage'],
        shortLabel: 'TR',
        to: '/admin/academics/tracks',
      },
      {
        label: 'Subjects',
        permissions: ['subjects.manage'],
        shortLabel: 'SU',
        to: '/admin/academics/subjects',
      },
      {
        label: 'Subject offerings',
        permissions: ['subject_offerings.manage'],
        shortLabel: 'SO',
        to: '/admin/academics/subject-offerings',
      },
      {
        label: 'Promotions',
        permissions: ['enrollments.promote'],
        shortLabel: 'PR',
        to: '/admin/academics/promotions',
      },
    ],
  },
  {
    label: 'Academic operations',
    items: [
      {
        label: 'Assignments',
        permissions: ['assignments.manage_all'],
        shortLabel: 'A',
        to: '/admin/assignments',
      },
      {
        label: 'Announcements',
        permissions: ['announcements.create_schoolwide', 'announcements.manage_all'],
        shortLabel: 'N',
        to: '/admin/announcements',
      },
      {
        label: 'Result overview',
        permissions: ['results.read_all', 'results.review', 'results.approve', 'results.publish'],
        shortLabel: 'R',
        to: '/admin/results',
      },
    ],
  },
  {
    label: 'Results',
    items: [
      {
        label: 'Assessment configuration',
        permissions: ['results.configure'],
        shortLabel: 'AC',
        to: '/admin/results/assessment-schemes',
      },
      {
        label: 'Grading configuration',
        permissions: ['results.configure'],
        shortLabel: 'GC',
        to: '/admin/results/grading-schemes',
      },
      {
        label: 'Submitted results',
        permissions: ['results.read_all', 'results.review'],
        shortLabel: 'SR',
        to: '/admin/results/submitted',
      },
      {
        label: 'Review',
        permissions: ['results.review'],
        shortLabel: 'RV',
        to: '/admin/results/review',
      },
      {
        label: 'Approval',
        permissions: ['results.approve'],
        shortLabel: 'AP',
        to: '/admin/results/approval',
      },
      {
        label: 'Publishing',
        permissions: ['results.publish'],
        shortLabel: 'PB',
        to: '/admin/results/publishing',
      },
      {
        label: 'Corrections',
        permissions: ['results.approve_correction', 'results.read_all'],
        shortLabel: 'CR',
        to: '/admin/results/corrections',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Administrators',
        permissions: ['admins.create', 'admins.manage'],
        shortLabel: 'AD',
        to: '/admin/access/administrators',
      },
      {
        label: 'Roles',
        permissions: ['roles.manage'],
        shortLabel: 'RO',
        to: '/admin/access/roles',
      },
      {
        label: 'Permissions',
        permissions: ['permissions.manage'],
        shortLabel: 'PE',
        to: '/admin/access/permissions',
      },
      {
        label: 'Documents',
        permissions: ['documents.read', 'documents.review', 'documents.configure'],
        shortLabel: 'F',
        to: '/admin/documents',
      },
      {
        label: 'Audit logs',
        permissions: ['audit.read'],
        shortLabel: 'AU',
        to: '/admin/audit',
      },
      { label: 'Notifications', shortLabel: 'N', to: '/admin/notifications' },
      {
        label: 'School settings',
        permissions: ['settings.manage'],
        shortLabel: 'S',
        to: '/admin/settings',
      },
    ],
  },
];

export function navigationFor(portalName: PortalName): readonly NavigationGroup[] {
  if (portalName === 'Student Portal') return studentNavigation;
  if (portalName === 'Teacher Portal') return teacherNavigation;
  return adminNavigation;
}
