import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, MapPin, Clock, ShieldAlert, CheckCircle2, ChevronLeft, Calendar as CalendarIcon, Info } from 'lucide-react';
import { providerAPI, availabilityAPI, appointmentAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CategoryBadge } from '../components/ui/Badge';
import SlotPicker from '../components/booking/SlotPicker';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate, formatTime } from '../lib/utils';

export default function ProviderProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [provider, setProvider] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingProvider, setLoadingProvider] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchProvider();
  }, [id]);

  useEffect(() => {
    if (selectedService) {
      fetchSlots(selectedService._id);
    }
  }, [selectedService]);

  const fetchProvider = async () => {
    setLoadingProvider(true);
    try {
      const res = await providerAPI.getById(id);
      const data = res.data.data.provider;
      setProvider(data);
      if (data.services && data.services.length > 0) {
        setSelectedService(data.services[0]);
      }
    } catch (err) {
      toast.error('Failed to load provider profile');
      console.error(err);
    } finally {
      setLoadingProvider(false);
    }
  };

  const fetchSlots = async (serviceId) => {
    setLoadingSlots(true);
    try {
      const res = await availabilityAPI.getSlots(id, serviceId);
      setSlots(res.data.data.slots);
    } catch (err) {
      toast.error('Failed to fetch available time slots');
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSlotSelect = (slot) => {
    if (!user) {
      toast.error('Please log in to book an appointment');
      navigate('/login');
      return;
    }
    setSelectedSlot(slot);
    setBookingModalOpen(true);
    setBookingSuccess(false);
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !selectedService) return;
    setIsSubmitting(true);
    try {
      await appointmentAPI.create({
        providerId: provider._id,
        serviceId: selectedService._id,
        slotStart: selectedSlot.slotStart,
        notes
      });

      setBookingSuccess(true);
      toast.success('Appointment booked successfully!');

      // Refresh slots
      fetchSlots(selectedService._id);
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to book appointment';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingProvider) {
    return (
      <div className="py-24 text-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading Provider Profile...</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="py-16 text-center space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Provider Not Found</h2>
        <button onClick={() => navigate('/')} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold">
          Return to Discovery
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Providers</span>
      </button>

      {/* Provider Header Card */}
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CategoryBadge category={provider.category} />
              <div className="flex items-center gap-1 text-amber-500 text-xs font-bold bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-200/50">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{provider.avgRating ? provider.avgRating.toFixed(1) : '5.0'}</span>
              </div>
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {provider.businessName}
            </h1>

            {provider.location && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-500" />
                <span>{provider.location}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>Buffer: {provider.bufferMinutes}m</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-indigo-500" />
              <span>Cancel Window: {provider.cancellationWindowHours}h before</span>
            </div>
          </div>
        </div>

        {provider.description && (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
            {provider.description}
          </p>
        )}
      </div>

      {/* Service Selection Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">1. Select a Service</h3>
        
        {provider.services && provider.services.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {provider.services.map((srv) => {
              const isSelected = selectedService && selectedService._id === srv._id;
              return (
                <motion.div
                  key={srv._id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedService(srv)}
                  className={`cursor-pointer p-5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/25'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-base">{srv.name}</h4>
                    <span className={`text-sm font-extrabold ${isSelected ? 'text-indigo-100' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {formatCurrency(srv.price)}
                    </span>
                  </div>
                  <p className={`text-xs ${isSelected ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    Duration: {srv.durationMins} minutes
                  </p>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 text-center text-slate-500">
            No active services offered by this provider at the moment.
          </div>
        )}
      </div>

      {/* Animated Slot Picker */}
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
        <SlotPicker
          slots={slots}
          service={selectedService}
          onSelectSlot={handleSlotSelect}
          loading={loadingSlots}
        />
      </div>

      {/* Booking Confirmation Modal */}
      <Modal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        title={bookingSuccess ? 'Booking Confirmed!' : 'Confirm Appointment'}
      >
        {bookingSuccess ? (
          <div className="text-center py-6 space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto"
            >
              <CheckCircle2 className="w-10 h-10" />
            </motion.div>
            <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100">You're All Set!</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A confirmation notification has been dispatched. You can track your appointment from your dashboard.
            </p>
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => { setBookingModalOpen(false); navigate('/dashboard'); }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm shadow-md"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-indigo-900 dark:text-indigo-200">
                <span>{selectedService?.name}</span>
                <span>{formatCurrency(selectedService?.price)}</span>
              </div>
              <div className="text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
                <p><strong>Provider:</strong> {provider.businessName}</p>
                <p><strong>Date:</strong> {selectedSlot && formatDate(selectedSlot.slotStart)}</p>
                <p><strong>Time:</strong> {selectedSlot && formatTime(selectedSlot.slotStart)} - {selectedSlot && formatTime(selectedSlot.slotEnd)}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Additional Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Mention any specific requests or instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Free cancellation up to {provider.cancellationWindowHours} hours before start time.</span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBookingModalOpen(false)}
                className="w-1/2 py-3 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmBooking}
                className="w-1/2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
