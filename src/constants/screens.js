/** Screen keys used for per-user access control */
const SCREEN_IDS = [
  'executive',
  'po_so_sps',
  'po_so_waitrose',
  'po_tracker_b2b',
  'po_tracker_retails',
  'stores_kehe',
  'stores_sprouts',
  'demand_planner',
];

const SCREEN_GROUPS = [
  {
    id: 'executive',
    label: 'Executive Analytics',
    comingSoon: false,
    screens: [{ id: 'executive', label: 'Executive Analytics' }],
  },
  {
    id: 'po_so',
    label: 'PO & SO Dashboard',
    comingSoon: false,
    screens: [
      { id: 'po_so_sps', label: 'SPS' },
      { id: 'po_so_waitrose', label: 'Waitrose' },
    ],
  },
  {
    id: 'po_tracker',
    label: 'PO Trackers',
    comingSoon: false,
    screens: [
      { id: 'po_tracker_b2b', label: 'B2B' },
      { id: 'po_tracker_retails', label: 'Retails' },
    ],
  },
  {
    id: 'stores',
    label: 'Stores',
    comingSoon: false,
    screens: [
      { id: 'stores_kehe', label: 'KeHe' },
      { id: 'stores_sprouts', label: 'Sprouts' },
    ],
  },
  {
    id: 'demand_planner',
    label: 'Demand Planner',
    comingSoon: true,
    screens: [{ id: 'demand_planner', label: 'Demand Planner' }],
  },
];

/** Matches DB values: `superadmin` (primary) and legacy `super_admin` */
const SUPER_ADMIN_ROLES = ['superadmin', 'super_admin'];

const ROLES = ['user', 'superadmin', 'super_admin'];

const normalizeRoleKey = (role) => {
  if (!role) return '';
  return String(role).toLowerCase().replace(/[\s_-]+/g, '');
};

const isSuperAdminRole = (role) => normalizeRoleKey(role) === 'superadmin';

const isSuperAdmin = (user) => isSuperAdminRole(user?.role);

const normalizeRoleForStorage = (role) => (isSuperAdminRole(role) ? 'superadmin' : 'user');

const fullScreenAccess = () => [...SCREEN_IDS];

const normalizeScreenAccess = (screenAccess, role) => {
  if (isSuperAdminRole(role)) return fullScreenAccess();
  if (!Array.isArray(screenAccess)) return [];
  return screenAccess.filter((id) => SCREEN_IDS.includes(id));
};

const hasScreenAccess = (user, screenId) => {
  if (isSuperAdmin(user)) return true;
  const access = normalizeScreenAccess(user?.screenAccess, user?.role);
  return access.includes(screenId);
};

module.exports = {
  SCREEN_IDS,
  SCREEN_GROUPS,
  SUPER_ADMIN_ROLES,
  ROLES,
  isSuperAdminRole,
  isSuperAdmin,
  normalizeRoleForStorage,
  normalizeScreenAccess,
  fullScreenAccess,
  hasScreenAccess,
  normalizeRoleKey,
};
