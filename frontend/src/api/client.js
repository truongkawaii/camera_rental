import axios from 'axios';

// Determine API base URL depending on environment.
// - During local development (Vite dev server) we proxy via /api
// - In production: if VITE_API_URL is set, use it; otherwise use relative /api
const rawUrl = import.meta.env.VITE_API_URL || '';

const API_BASE_URL = import.meta.env.DEV
  ? '/api'
  : (rawUrl ? `${rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl}/api` : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add a request interceptor to include the auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const activeRole = localStorage.getItem('activeRole');
  if (activeRole) {
    config.headers['X-Active-Role'] = activeRole;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const getDashboardMetrics = () => api.get('/dashboard/metrics');
export const getDashboardToday = (startDate, endDate) => {
  const params = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : '';
  return api.get(`/dashboard/summary${params}`);
};
export const getEquipment = (
  page = 1,
  limit = 10,
  month = '',
  sortBy = '',
  sortOrder = '',
  search = '',
  availabilityStatus = '',
  asOf = '',
  ownerId = '',
  branchId = '',
  model = '',
  brand = ''
) => {
  const query = new URLSearchParams({ page, limit });
  if (month) query.set('month', month);
  if (sortBy) query.set('sortBy', sortBy);
  if (sortOrder) query.set('sortOrder', sortOrder);
  if (search) query.set('search', search);
  if (availabilityStatus) query.set('availabilityStatus', availabilityStatus);
  if (asOf) query.set('asOf', asOf);
  if (ownerId) query.set('owner_id', ownerId);
  if (branchId) query.set('branch_id', branchId);
  if (model) query.set('model', model);
  if (brand) query.set('brand', brand);
  return api.get(`/equipment?${query.toString()}`);
};

export const getEquipmentModels = () => api.get('/equipment/models');
export const getEquipmentBrands = () => api.get('/equipment/brands');
export const getEquipmentRanking = (month = '') => {
  const query = new URLSearchParams();
  if (month) query.set('month', month);
  return api.get(`/equipment/ranking?${query.toString()}`);
};
export const createEquipment = (data) => api.post('/equipment', data);
export const updateEquipment = (id, data) => api.put(`/equipment/${id}`, data);
export const deleteEquipment = (id) => api.delete(`/equipment/${id}`);
export const getEquipmentCalendar = (id) => api.get(`/equipment/${id}/calendar`);

// Maintenance
export const getMaintenance = (equipmentId = '') => api.get(`/maintenance${equipmentId ? `?equipment_id=${equipmentId}` : ''}`);
export const createMaintenance = (data) => api.post('/maintenance', data);
export const updateMaintenance = (id, data) => api.put(`/maintenance/${id}`, data);
export const deleteMaintenance = (id) => api.delete(`/maintenance/${id}`);

// Lightweight paginated equipment for calendar view (no heavy stats)
export const getCalendarEquipment = (
  page = 1,
  limit = 7,
  branchId = '',
  model = '',
  sortBy = 'code',
  sortOrder = 'ASC'
) => {
  const query = new URLSearchParams({ page, limit });
  if (branchId && branchId !== 'ALL') query.set('branch_id', branchId);
  if (model && model !== 'ALL') query.set('model', model);
  if (sortBy) query.set('sortBy', sortBy);
  if (sortOrder) query.set('sortOrder', sortOrder);
  return api.get(`/equipment/calendar?${query.toString()}`);
};

export const getAllRentalsCalendar = () => api.get(`/calendar/rentals`);
export const getRental = (id) => api.get(`/rentals/${id}`);
const attachFilenamesToNewImages = (imageArray, filenames = []) => {
  let filenameIndex = 0;
  return imageArray.map((image) => {
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return image;
    }

    const filename = filenames[filenameIndex] || null;
    filenameIndex += 1;
    return filename ? { imageData: image, filename } : image;
  });
};

export const uploadEquipmentImage = (id, imageData, filename = null) => api.post(`/equipment/${id}/upload-image`, {
  imageData,
  ...(filename ? { filename } : {})
});
export const uploadEquipmentImages = (id, imageArray, filenames = []) => api.post(`/equipment/${id}/upload-image`, {
  imageArray: attachFilenamesToNewImages(imageArray, filenames)
});
export const uploadCustomerImage = (id, imageData, filename = null) => api.post(`/customers/${id}/upload-image`, {
  imageData,
  ...(filename ? { filename } : {})
});
export const uploadRentalImage = (id, imageData, filename = null) => api.post(`/rentals/${id}/upload-image`, {
  imageData,
  ...(filename ? { filename } : {})
});
export const uploadRentalImages = (id, imageArray, filenames = []) => api.post(`/rentals/${id}/upload-image`, {
  imageArray: attachFilenamesToNewImages(imageArray, filenames)
});
export const getRentalCounts = () => api.get('/rentals/counts');
export const getRentals = (page = 1, limit = 10, status = 'all', search = '', view = '', startDate = '', endDate = '', sortKey = 'created_desc', pickupDate = '', returnDate = '', ownerId = '', pickupBranchId = '', returnBranchId = '', creatorId = '', createdDate = '') => {
  const query = new URLSearchParams({ page, limit, status, search, view });
  const [sortBy, sortDir = 'desc'] = String(sortKey || 'created_desc').split('_');
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  if (pickupDate) query.set('pickupDate', pickupDate);
  if (returnDate) query.set('returnDate', returnDate);
  if (ownerId) query.set('ownerId', ownerId);
  if (pickupBranchId) query.set('pickupBranchId', pickupBranchId);
  if (returnBranchId) query.set('returnBranchId', returnBranchId);
  if (creatorId) query.set('creatorId', creatorId);
  if (createdDate) query.set('createdDate', createdDate);
  if (sortBy) query.set('sortBy', sortBy);
  if (sortDir) query.set('sortDir', sortDir);
  return api.get(`/rentals?${query.toString()}`);
};
export const createRental = (data) => api.post('/rentals', data);
export const updateRental = (id, data) => api.put(`/rentals/${id}`, data);
export const updateRentalStatus = (id, status) => api.patch(`/rentals/${id}/status`, { status });
export const deleteRental = (id) => api.delete(`/rentals/${id}`);
export const getCustomers = (page = 1, limit = 10, search = '', filterStatus = 'all') => api.get(`/customers?page=${page}&limit=${limit}&search=${search}&filterStatus=${filterStatus}`);
export const createCustomer = (data) => api.post('/customers', data);
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);

// Blacklist APIs
export const getBlacklist = (page = 1, limit = 10, search = '', status = 'active') => {
  const query = new URLSearchParams({ page, limit, status });
  if (search) query.set('search', search);
  return api.get(`/blacklist?${query.toString()}`);
};
export const checkBlacklist = (customerId) => api.get(`/blacklist/check/${customerId}`);
export const blacklistCustomer = (customerId, reason = '') => api.post('/blacklist', { customer_id: customerId, reason });
export const unblacklistCustomer = (id) => api.put(`/blacklist/${id}/unblacklist`);
export const deleteBlacklistEntry = (id) => api.delete(`/blacklist/${id}`);

export const getBranches = () => api.get('/branches');
export const createBranch = (data) => api.post('/branches', data);
export const updateBranch = (id, data) => api.put(`/branches/${id}`, data);
export const deleteBranch = (id) => api.delete(`/branches/${id}`);
export const uploadBranchImage = (id, imageData, filename = null) => api.post(`/branches/${id}/upload-image`, {
  imageData,
  ...(filename ? { filename } : {})
});

export const getUsers = (activeRoleOverride = null) => api.get('/users', {
  headers: activeRoleOverride ? { 'X-Active-Role': activeRoleOverride } : {}
});
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const getRoles = () => api.get('/roles');
export const getPerformanceMetrics = (startDate, endDate) => {
  const params = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : '';
  return api.get(`/performance${params}`);
};

export const getActivityLogs = (page = 1, limit = 20, search = '', startDate = '', endDate = '', entityTypes = []) => {
  const query = new URLSearchParams({ page, limit });
  if (search) query.set('search', search);
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  if (entityTypes.length > 0) query.set('entityType', entityTypes.join(','));
  return api.get(`/activity?${query.toString()}`);
};
export const getPayroll = (month) => api.get(`/payroll${month ? `?month=${month}` : ''}`);
export const lockPayroll = (month) => api.post('/payroll/lock', { month });
export const getPayrollTransfers = (month) => api.get(`/payroll/transfers${month ? `?month=${month}` : ''}`);
export const createPayrollTransfer = (data) => api.post('/payroll/transfers', data);
export const updatePayrollTransfer = (id, data) => api.put(`/payroll/transfers/${id}`, data);
export const deletePayrollTransfer = (id) => api.delete(`/payroll/transfers/${id}`);
export const uploadPayrollTransferImage = (id, imageData, filename = null) => api.post(`/payroll/transfers/${id}/upload-image`, {
  imageData,
  ...(filename ? { filename } : {}),
});
export const getSaleTransfers = (month) => api.get(`/sale-transfers${month ? `?month=${month}` : ''}`);
export const createSaleTransfer = (data) => api.post('/sale-transfers', data);
export const updateSaleTransfer = (id, data) => api.put(`/sale-transfers/${id}`, data);
export const deleteSaleTransfer = (id) => api.delete(`/sale-transfers/${id}`);
export const uploadSaleTransferImage = (id, imageData, filename = null) => api.post(`/sale-transfers/${id}/upload-image`, {
  imageData,
  ...(filename ? { filename } : {}),
});
export const getAdsCosts = (params) => {
  const query = new URLSearchParams();
  if (params?.month) query.set('month', params.month);
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return api.get(`/ads-costs${qs ? `?${qs}` : ''}`);
};
export const createAdsCost = (data) => api.post('/ads-costs', data);
export const updateAdsCost = (id, data) => api.put(`/ads-costs/${id}`, data);
export const deleteAdsCost = (id) => api.delete(`/ads-costs/${id}`);
export const getMiscCosts = (params) => {
  const query = new URLSearchParams();
  if (params?.month) query.set('month', params.month);
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return api.get(`/misc-costs${qs ? `?${qs}` : ''}`);
};
export const createMiscCost = (data) => api.post('/misc-costs', data);
export const updateMiscCost = (id, data) => api.put(`/misc-costs/${id}`, data);
export const deleteMiscCost = (id) => api.delete(`/misc-costs/${id}`);
export const getRevenueByBranch = (startDate, endDate) => {
  const params = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : '';
  return api.get(`/reports/revenue-by-branch${params}`);
};

export const getInvestorRevenue = (startDate, endDate) => {
  const params = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : '';
  return api.get(`/reports/investor-revenue${params}`);
};

export const previewRentalCommission = (data) => api.post('/rentals/commission-preview', data);

export const getCommissionConfigs = (params = {}) => {
  const query = new URLSearchParams();
  if (params.rule_type) query.set('rule_type', params.rule_type);
  const qs = query.toString();
  return api.get(`/commission-configs${qs ? `?${qs}` : ''}`);
};
export const getActiveCommissionConfig = () => api.get('/commission-configs/active');
export const createCommissionConfig = (data) => api.post('/commission-configs', data);
export const updateCommissionConfig = (id, data) => api.patch(`/commission-configs/${id}`, data);
export const activateCommissionConfig = (id) => api.patch(`/commission-configs/${id}/activate`);
export const deactivateCommissionConfig = (id) => api.patch(`/commission-configs/${id}/deactivate`);
export const deleteCommissionConfig = (id) => api.delete(`/commission-configs/${id}`);
export const updateCommissionRates = (id, data) => api.put(`/commission-configs/${id}/rates`, data);
export const getRuleSetUsers = (ruleSetId) => api.get(`/commission-configs/${ruleSetId}/users`);
export const getAllRuleSetUsers = () => api.get('/commission-configs/all-users');
export const addUserToRuleSet = (ruleSetId, userId, roleName) => api.post(`/commission-configs/${ruleSetId}/users`, { user_id: userId, role_name: roleName });
export const removeUserFromRuleSet = (ruleSetId, userId, roleName) => api.delete(`/commission-configs/${ruleSetId}/users/${userId}`, { params: { role_name: roleName } });


export const getCollaboratorHierarchy = (childUserId = '') => {
  const query = new URLSearchParams();
  if (childUserId) query.set('child_user_id', childUserId);
  const qs = query.toString();
  return api.get(`/collaborators${qs ? `?${qs}` : ''}`);
};
export const createCollaboratorHierarchy = (data) => api.post('/collaborators', data);
export const updateCollaboratorHierarchy = (id, data) => api.patch(`/collaborators/${id}`, data);
export const deleteCollaboratorHierarchy = (id) => api.delete(`/collaborators/${id}`);

export const getCommissionReconciliation = (startDate, endDate) => {
  const query = new URLSearchParams();
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  const qs = query.toString();
  return api.get(`/reports/commission-reconciliation${qs ? `?${qs}` : ''}`);
};

// Equipment Transfers
export const getEquipmentTransfers = (params) => {
  const query = new URLSearchParams();
  if (params?.month) query.set('month', params.month);
  if (params?.status) query.set('status', params.status);
  if (params?.equipment_id) query.set('equipment_id', params.equipment_id);
  const qs = query.toString();
  return api.get(`/equipment-transfers${qs ? `?${qs}` : ''}`);
};
export const getEquipmentTransfer = (id) => api.get(`/equipment-transfers/${id}`);
export const createEquipmentTransfer = (data) => api.post('/equipment-transfers', data);
export const approveTransfer = (id) => api.put(`/equipment-transfers/${id}/approve`);
export const rejectTransfer = (id, reason) => api.put(`/equipment-transfers/${id}/reject`, { reason });
export const completeTransfer = (id) => api.put(`/equipment-transfers/${id}/complete`);
export const cancelTransfer = (id) => api.put(`/equipment-transfers/${id}/cancel`);
export const deleteEquipmentTransfer = (id) => api.delete(`/equipment-transfers/${id}`);

export default api;
