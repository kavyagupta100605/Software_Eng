import axios from 'axios';

const API = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor for 401 unauthenticated handling
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // If not already on auth pages, redirect
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
};

// Provider API
export const providerAPI = {
  list: (params) => API.get('/providers', { params }),
  getById: (id) => API.get(`/providers/${id}`),
  createProfile: (data) => API.post('/providers', data),
  updateProfile: (id, data) => API.patch(`/providers/${id}`, data),
};

// Services API
export const serviceAPI = {
  getByProvider: (providerId) => API.get(`/providers/${providerId}/services`),
  create: (providerId, data) => API.post(`/providers/${providerId}/services`, data),
  update: (id, data) => API.patch(`/services/${id}`, data),
  delete: (id) => API.delete(`/services/${id}`),
};

// Availability API
export const availabilityAPI = {
  get: (providerId) => API.get(`/providers/${providerId}/availability`),
  update: (providerId, weeklyHours, timezone) => API.put(`/providers/${providerId}/availability`, { weeklyHours, timezone }),
  removeBlock: (providerId, blockId) => API.delete(`/providers/${providerId}/availability/block/${blockId}`),
  blockDate: (providerId, data) => API.post(`/providers/${providerId}/availability/block`, data),
  hold: (providerId, data) => API.post(`/providers/${providerId}/holds`, data),
  releaseHold: (providerId, holdId) => API.delete(`/providers/${providerId}/holds/${holdId}`),
  joinWaitlist: (providerId, data) => API.post(`/providers/${providerId}/waitlist`, data),
  getSlots: (providerId, serviceId, from, to) => API.get(`/providers/${providerId}/slots`, {
    params: { serviceId, from, to }
  }),
};

// Appointment API
export const appointmentAPI = {
  create: (data) => API.post('/appointments', data),
  getClientAppointments: (params) => API.get('/appointments/me', { params }),
  getProviderAppointments: (providerId, params) => API.get(`/providers/${providerId}/appointments`, { params }),
  reschedule: (id, slotStart, holdId) => API.patch(`/appointments/${id}/reschedule`, { slotStart, holdId }),
  cancel: (id) => API.patch(`/appointments/${id}/cancel`),
  updateStatus: (id, status) => API.patch(`/appointments/${id}/status`, { status }),
};

// Admin API
export const adminAPI = {
  getProviders: () => API.get('/admin/providers'),
  toggleApproval: (providerId) => API.patch(`/admin/providers/${providerId}/approve`),
  getAppointments: () => API.get('/admin/appointments'),
};

export default API;

export const walletAPI = {
  get: () => API.get('/wallet'),
  topUp: (amountCents) => API.post('/wallet/top-up', { amountCents }),
};

export const walletQuery = (user) => ({
  queryKey: ['wallet', user?.id],
  refetchOnWindowFocus: true,
  queryFn: async () => (await walletAPI.get()).data.data.balanceCents,
  enabled: Boolean(user?.id && ['client', 'admin'].includes(user.role)),
});
