import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { appointmentAPI } from '../services/api';
import { StatusBadge } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate, formatTime } from '../lib/utils';

const TABS = [
  { id: 'upcoming', label: 'Upcoming', status: 'confirmed' },
  { id: 'past', label: 'Past / Completed', status: 'completed' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled' }
];

export default function ClientDashboardPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [selectedApptToCancel, setSelectedApptToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const res = await appointmentAPI.getClientAppointments();
      setAppointments(res.data.data.appointments);
    } catch (err) {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  const filteredAppointments = appointments.filter((appt) => {
    if (activeTab === 'upcoming') {
      return appt.status === 'confirmed' || appt.status === 'requested';
    }
    if (activeTab === 'past') {
      return appt.status === 'completed';
    }
    if (activeTab === 'cancelled') {
      return appt.status === 'cancelled' || appt.status === 'no-show';
    }
    return true;
  });

  const handleCancelClick = (appt) => {
    setSelectedApptToCancel(appt);
  };

  const confirmCancel = async () => {
    if (!selectedApptToCancel) return;
    setCancelling(true);

    try {
      await appointmentAPI.cancel(selectedApptToCancel._id);
      toast.success('Appointment cancelled successfully');
      setSelectedApptToCancel(null);
      fetchAppointments();
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to cancel appointment';
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">My Appointments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">View and manage your upcoming bookings.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 relative">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2 text-sm font-semibold transition-colors ${
                isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* List / Grid */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading appointments...</p>
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <Calendar className="w-10 h-10 mx-auto text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No {activeTab} appointments</h3>
          <p className="text-sm text-slate-500">You have no appointments under this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence>
            {filteredAppointments.map((appt) => (
              <motion.div
                key={appt._id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <StatusBadge status={appt.status} />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-2">
                      {appt.serviceId?.name || 'Service'}
                    </h3>
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {appt.providerId?.businessName || 'Provider'}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {formatCurrency(appt.serviceId?.price)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span>{formatDate(appt.slotStart)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    <span>{formatTime(appt.slotStart)} - {formatTime(appt.slotEnd)} ({appt.serviceId?.durationMins} mins)</span>
                  </div>
                  {appt.providerId?.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-indigo-500" />
                      <span className="truncate">{appt.providerId.location}</span>
                    </div>
                  )}
                </div>

                {appt.notes && (
                  <p className="text-xs italic text-slate-500 dark:text-slate-400">
                    Note: "{appt.notes}"
                  </p>
                )}

                {/* Cancel Action Button */}
                {appt.status === 'confirmed' && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleCancelClick(appt)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900/60 transition-colors"
                    >
                      Cancel Appointment
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      <Modal
        isOpen={!!selectedApptToCancel}
        onClose={() => setSelectedApptToCancel(null)}
        title="Confirm Cancellation"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            <p className="text-xs font-medium">
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setSelectedApptToCancel(null)}
              className="px-4 py-2 rounded-xl border text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Keep Appointment
            </button>
            <button
              disabled={cancelling}
              onClick={confirmCancel}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold shadow-md shadow-rose-600/30 flex items-center gap-1.5"
            >
              {cancelling ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Yes, Cancel Appointment'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
