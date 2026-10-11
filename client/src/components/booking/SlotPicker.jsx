import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar as CalendarIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

export default function SlotPicker({ slots, service, onSelectSlot, loading }) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Group slots by calendar day
  const groupedSlots = useMemo(() => {
    if (!slots || slots.length === 0) return [];

    const map = new Map();
    slots.forEach(slot => {
      const dateObj = new Date(slot.slotStart);
      const dateKey = dateObj.toDateString(); // e.g. "Mon Aug 12 2026"

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateObj,
          dayName: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: dateObj.getDate(),
          monthName: dateObj.toLocaleDateString('en-US', { month: 'short' }),
          slots: []
        });
      }
      map.get(dateKey).slots.push(slot);
    });

    return Array.from(map.values());
  }, [slots]);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Computing available time slots...</p>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-8 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-dashed border-indigo-200 dark:border-indigo-800 text-center">
        <Clock className="w-8 h-8 mx-auto text-indigo-500 mb-2" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Please select a service above to view available booking slots.</p>
      </div>
    );
  }

  if (groupedSlots.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center space-y-2">
        <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
        <h4 className="font-semibold text-slate-900 dark:text-slate-100">No Open Slots Available</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400">There are no available slots for {service.name} over the next 7 days.</p>
      </div>
    );
  }

  const activeGroup = groupedSlots[selectedDayIndex] || groupedSlots[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Select Appointment Date & Time
        </h3>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Duration: {service.durationMins} mins ({formatCurrency(service.price)})
        </span>
      </div>

      {/* Days Horizontal Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {groupedSlots.map((group, idx) => {
          const isSelected = idx === selectedDayIndex;
          return (
            <motion.button
              key={group.dateObj.toISOString()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedDayIndex(idx)}
              className={`relative flex flex-col items-center min-w-[76px] px-3 py-3 rounded-2xl border text-center transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/25'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
              }`}
            >
              <span className="text-xs font-medium uppercase tracking-wider opacity-80">{group.dayName}</span>
              <span className="text-lg font-bold">{group.dayNum}</span>
              <span className="text-[10px] font-semibold uppercase">{group.monthName}</span>
              
              {isSelected && (
                <motion.div
                  layoutId="activeTabBadge"
                  className="absolute -bottom-1.5 w-3 h-1.5 bg-indigo-400 rounded-full"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Available Slots Pill Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeGroup ? activeGroup.dateObj.toISOString() : 'empty'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2"
        >
          {activeGroup.slots.map((slot) => {
            const timeFormatted = new Date(slot.slotStart).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <motion.button
                key={slot.slotStart}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => onSelectSlot(slot)}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-500 text-slate-800 dark:text-slate-200 font-medium text-sm transition-all shadow-sm group"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span>{timeFormatted}</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
