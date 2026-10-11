import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Plus, Edit2, Trash2, Sliders, UserCheck, ShieldAlert } from 'lucide-react';
import { appointmentAPI, serviceAPI, availabilityAPI, providerAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate, formatTime } from '../lib/utils';

export default function ProviderDashboardPage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);

  // Service Modal state
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [serviceDuration, setServiceDuration] = useState(30);
  const [servicePrice, setServicePrice] = useState(50);
  const [savingService, setSavingService] = useState(false);

  // Availability Modal state
  const [availModalOpen, setAvailModalOpen] = useState(false);
  const [weeklyHoursState, setWeeklyHoursState] = useState([]);

  useEffect(() => {
    if (providerId) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [providerId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [apptsRes, srvRes, availRes] = await Promise.all([
        appointmentAPI.getProviderAppointments(providerId),
        serviceAPI.getByProvider(providerId),
        availabilityAPI.get(providerId)
      ]);

      setAppointments(apptsRes.data?.data?.appointments || []);
      setServices(srvRes.data?.data?.services || []);
      setAvailability(availRes.data?.data?.availability || null);
      if (availRes.data?.data?.availability?.weeklyHours) {
        setWeeklyHoursState(availRes.data.data.availability.weeklyHours);
      }
    } catch (err) {
      console.error('Error loading provider dashboard:', err);
      toast.error('Failed to load provider schedule data');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (apptId, newStatus) => {
    try {
      await appointmentAPI.updateStatus(apptId, newStatus);
      toast.success(`Appointment marked as ${newStatus}`);
      fetchDashboardData();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    setSavingService(true);
    try {
      await serviceAPI.create(providerId, {
        name: serviceName,
        durationMins: serviceDuration,
        price: servicePrice
      });
      toast.success('Service created successfully');
      setServiceModalOpen(false);
      setServiceName('');
      fetchDashboardData();
    } catch (err) {
      toast.error('Failed to create service');
    } finally {
      setSavingService(false);
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!window.confirm('Are you sure you want to deactivate this service?')) return;
    try {
      await serviceAPI.delete(serviceId);
      toast.success('Service deactivated');
      fetchDashboardData();
    } catch (err) {
      toast.error('Failed to deactivate service');
    }
  };

  const handleSaveAvailability = async () => {
    try {
      await availabilityAPI.update(providerId, weeklyHoursState);
      toast.success('Weekly availability updated!');
      setAvailModalOpen(false);
      fetchDashboardData();
    } catch (err) {
      toast.error('Failed to save availability');
    }
  };

  const toggleDayOfWeek = (dayNum) => {
    const existing = weeklyHoursState.find(wh => wh.dayOfWeek === dayNum);
    if (existing) {
      setWeeklyHoursState(weeklyHoursState.filter(wh => wh.dayOfWeek !== dayNum));
    } else {
      setWeeklyHoursState([...weeklyHoursState, { dayOfWeek: dayNum, startTime: '09:00', endTime: '17:00' }]);
    }
  };

  // Stats calculation
  const totalBookings = appointments.length;
  const completedBookings = appointments.filter(a => a.status === 'completed').length;
  const cancelledBookings = appointments.filter(a => a.status === 'cancelled').length;
  const completionRate = totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 100;

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading Provider Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-16">
      
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Provider Control Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage daily schedules, active services, and working hours.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAvailModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:border-indigo-500 transition-colors shadow-sm"
          >
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Edit Weekly Hours</span>
          </button>

          <button
            onClick={() => setServiceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div
          whileHover={{ y: -2 }}
          className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
        >
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Appointments</span>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{totalBookings}</div>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{appointments.filter(a => a.status === 'confirmed').length} active confirmed</p>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
        >
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completion Rate</span>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{completionRate}%</div>
          <p className="text-xs text-slate-500 font-medium">{completedBookings} completed appointments</p>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
        >
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Services</span>
          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">{services.length}</div>
          <p className="text-xs text-slate-500 font-medium">Offered on platform</p>
        </motion.div>
      </div>

      {/* Main Schedule & Actions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Appointments Table (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Schedule & Bookings</h2>
            <span className="text-xs font-semibold text-slate-500">{appointments.length} Total</span>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-x-auto">
            {appointments.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No bookings scheduled yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">Client</th>
                    <th className="pb-3">Service</th>
                    <th className="pb-3">Date & Time</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {appointments.map((appt) => (
                    <tr key={appt._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-4 font-semibold text-slate-900 dark:text-slate-100">
                        {appt.clientId?.name || 'Client'}
                        <div className="text-[10px] text-slate-400 font-normal">{appt.clientId?.email}</div>
                      </td>
                      <td className="py-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{appt.serviceId?.name}</span>
                        <div className="text-[10px] text-slate-400">{formatCurrency(appt.serviceId?.price)}</div>
                      </td>
                      <td className="py-4 text-slate-600 dark:text-slate-300">
                        <div>{formatDate(appt.slotStart)}</div>
                        <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                          {formatTime(appt.slotStart)}
                        </div>
                      </td>
                      <td className="py-4">
                        <StatusBadge status={appt.status} />
                      </td>
                      <td className="py-4 text-right">
                        {appt.status === 'confirmed' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleStatusUpdate(appt._id, 'completed')}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
                              title="Mark Completed"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(appt._id, 'no-show')}
                              className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 hover:bg-amber-100 transition-colors"
                              title="Mark No-Show"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(appt._id, 'cancelled')}
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                              title="Cancel"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No actions</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Services List Panel (1 col) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Service Catalogue</h2>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            {services.map((srv) => (
              <div
                key={srv._id}
                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:border-indigo-200 transition-colors"
              >
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{srv.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{srv.durationMins}m • {formatCurrency(srv.price)}</p>
                </div>
                <button
                  onClick={() => handleDeleteService(srv._id)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                  title="Deactivate Service"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Service Modal */}
      <Modal isOpen={serviceModalOpen} onClose={() => setServiceModalOpen(false)} title="Add New Service">
        <form onSubmit={handleCreateService} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Service Name</label>
            <input
              type="text"
              required
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Deluxe Consultation"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Duration (Minutes)</label>
              <input
                type="number"
                min={5}
                required
                value={serviceDuration}
                onChange={(e) => setServiceDuration(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Price ($)</label>
              <input
                type="number"
                min={0}
                required
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setServiceModalOpen(false)}
              className="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingService}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
            >
              Save Service
            </button>
          </div>
        </form>
      </Modal>

      {/* Weekly Hours Modal */}
      <Modal isOpen={availModalOpen} onClose={() => setAvailModalOpen(false)} title="Configure Weekly Hours">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Toggle days you are open for appointments (09:00 to 17:00 default):</p>
          
          <div className="space-y-2">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayName, idx) => {
              const active = weeklyHoursState.some(wh => wh.dayOfWeek === idx);
              return (
                <div key={dayName} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dayName}</span>
                  <button
                    type="button"
                    onClick={() => toggleDayOfWeek(idx)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      active ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {active ? 'Open' : 'Closed'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setAvailModalOpen(false)}
              className="px-4 py-2 border rounded-xl text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAvailability}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold shadow-md"
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
