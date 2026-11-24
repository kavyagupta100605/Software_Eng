import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, MapPin, Clock, ShieldAlert, CheckCircle2, ChevronLeft, Calendar as CalendarIcon, Info } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { providerAPI, availabilityAPI, appointmentAPI, walletQuery } from '../services/api';
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
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const requestedServiceId = searchParams.get('service');
  const rescheduleId = searchParams.get('reschedule');
  const [hold, setHold] = useState(null);
  const requestedStart = searchParams.get('slot');
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [loadingProvider, setLoadingProvider] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [notes, setNotes] = useState('');
  const [joining, setJoining] = useState(false);
  const requestedDate = new Date(requestedStart);
  const linkedDate = requestedServiceId === selectedService?._id && requestedStart
    && Number.isFinite(+requestedDate) && +requestedDate > Date.now()
    ? requestedStart
    : undefined;
  const slotsQuery = useQuery({
    queryKey: ['slots', id, selectedService?._id, user?.id, linkedDate],
    queryFn: async () => {
      const { data } = await availabilityAPI.getSlots(id, selectedService._id, linkedDate, linkedDate);
      return data.data.slots;
    },
    enabled: Boolean(selectedService),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    fetchProvider();
  }, [id]);

  const fetchProvider = async () => {
    setLoadingProvider(true);
    try {
      const res = await providerAPI.getById(id);
      const data = res.data.data.provider;
      setProvider(data);
      if (data.services && data.services.length > 0) {
        setSelectedService(data.services.find(service => service._id === requestedServiceId) || data.services[0]);
      }
    } catch (err) {
      toast.error('Failed to load provider profile');
      console.error(err);
    } finally {
      setLoadingProvider(false);
    }
  };

  const handleSlotSelect = async (slot) => {
    if (!user) {
      toast.error('Sign in to book or join the waitlist');
      navigate('/login', { state: { returnTo: location.pathname + location.search } });
      return;
    }
    if (!['client', 'admin'].includes(user.role)) {
      toast.error('A client account is required to book or join the waitlist');
      return;
    }
    if (slot.status === 'booked') {
      if (joining) return;
      setJoining(true);
      try {
        await availabilityAPI.joinWaitlist(id, {
          serviceId: selectedService._id, slotStart: slot.slotStart
        });
        toast.success('You joined the waitlist. We’ll email you if it’s your turn to book.');
      } catch (error) {
        toast.error(error.response?.data?.error?.message || 'Could not join the waitlist');
      } finally {
        await slotsQuery.refetch();
        setJoining(false);
      }
      return;
    }
    if (!slot.available) return;
    if (joining) return;
    setJoining(true);
    try {
      const result = await availabilityAPI.hold(id, { serviceId: selectedService._id, slotStart: slot.slotStart });
      setHold(result.data.data);
      setSelectedSlot(slot);
      setBookingModalOpen(true);
      setBookingSuccess(false);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not reserve this time');
      void slotsQuery.refetch();
    } finally {
      setJoining(false);
    }
  };

  const closeBooking = () => {
    if (isSubmitting) return;
    if (hold && !bookingSuccess) {
      void availabilityAPI.releaseHold(id, hold.id).then(() => slotsQuery.refetch()).catch(() => {});
    }
    setHold(null);
    setBookingModalOpen(false);
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !selectedService || isSubmitting) return;
    const priceCents = Math.round((selectedService.price ?? 0) * 100);
    setIsSubmitting(true);
    try {
      if (rescheduleId) {
        await appointmentAPI.reschedule(rescheduleId, selectedSlot.slotStart, hold?.id);
      } else {
        await appointmentAPI.create({
          providerId: provider._id,
          serviceId: selectedService._id,
          slotStart: selectedSlot.slotStart,
          notes,
          expectedPriceCents: priceCents,
          holdId: hold?.id,
          ...(priceCents > 0 && { paymentMethod: 'demo_wallet' })
        });
      }

      setBookingSuccess(true);
      if (!rescheduleId && priceCents > 0) void queryClient.invalidateQueries({ queryKey: walletQuery(user).queryKey });
      toast.success(rescheduleId ? 'Appointment rescheduled' : 'Appointment booked successfully!');

      // Refresh slots
      void slotsQuery.refetch();
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to book appointment';
      toast.error(msg);
      if (err.response?.data?.error?.code === 'HOLD_EXPIRED') {
        setHold(null);
        setBookingModalOpen(false);
      }
      void slotsQuery.refetch();
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
                <span>{provider.avgRating ? provider.avgRating.toFixed(1) : 'No ratings yet'}</span>
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
              <span>Unpaid bookings: cancel {provider.cancellationWindowHours}h before</span>
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
                  disabled={Boolean(rescheduleId && srv._id !== requestedServiceId)}
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
        {!user && linkedDate && (
          <Link to="/login" state={{ returnTo: location.pathname + location.search }}
            className="mb-4 inline-block text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            Sign in to view your waitlist offer
          </Link>
        )}
        <SlotPicker
          slots={slotsQuery.data ?? []}
          service={selectedService}
          onSelectSlot={handleSlotSelect}
          loading={Boolean(selectedService) && slotsQuery.isPending}
          error={slotsQuery.isError}
          joining={joining}
        />
      </div>

      {/* Booking Confirmation Modal */}
      <Modal
        isOpen={bookingModalOpen}
        onClose={closeBooking}
        title={bookingSuccess ? (rescheduleId ? 'Appointment Rescheduled' : 'Booking Confirmed') : (rescheduleId ? 'Confirm New Time' : 'Confirm Appointment')}
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
              Your appointment is confirmed. You can view it in your dashboard.
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
                <span>{rescheduleId ? "No new charge" : formatCurrency(selectedService?.price)}</span>
              </div>
              <div className="text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
                <p><strong>Provider:</strong> {provider.businessName}</p>
                <p><strong>Date:</strong> {selectedSlot && formatDate(selectedSlot.slotStart)}</p>
                <p><strong>Time:</strong> {selectedSlot && formatTime(selectedSlot.slotStart)} - {selectedSlot && formatTime(selectedSlot.slotEnd)}</p>
              </div>
            </div>

            {hold && (
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                Held until {formatTime(hold.expiresAt)}. {rescheduleId && 'Your original appointment stays booked until this change succeeds.'}
              </p>
            )}
            {selectedSlot?.offerExpiresAt && (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Reserved for you until {formatTime(selectedSlot.offerExpiresAt)}.
              </p>
            )}
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
              <span>{selectedService?.price > 0
                ? 'Cancel before the start for a demo wallet refund. Refund tiers are 100% from 3 hours, 75% from 2 hours, 50% from 1 hour, and 25% under 1 hour.'
                : `Cancel up to ${provider.cancellationWindowHours} hours before the start time.`}</span>
            </div>

            {!rescheduleId && selectedService?.price > 0 && (
              <Link to="/wallet" className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                View wallet or add demo funds
              </Link>
            )}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={closeBooking}
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
                  rescheduleId ? 'Confirm New Time' : selectedService?.price > 0 ? 'Pay with Demo Wallet' : 'Confirm Booking'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
