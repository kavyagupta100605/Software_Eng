import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Star, Calendar, ChevronRight, Sparkles, Filter } from 'lucide-react';
import { providerAPI } from '../services/api';
import { CategoryBadge } from '../components/ui/Badge';
import { CardSkeleton } from '../components/ui/Skeleton';

const CATEGORIES = ['All', 'Clinic', 'Salon', 'Tutor', 'Repair', 'Wellness'];

export default function HomePage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchProviders();
  }, [selectedCategory]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCategory !== 'All') params.category = selectedCategory;
      if (search) params.search = search;

      const res = await providerAPI.list(params);
      setProviders(res.data.data.providers);
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProviders();
  };

  return (
    <div className="space-y-12 pb-16">
      
      {/* Hero Header */}
      <section className="relative overflow-hidden pt-12 pb-16 rounded-3xl bg-gradient-to-b from-indigo-900 via-indigo-950 to-slate-950 text-white px-6 sm:px-12 shadow-2xl border border-indigo-900/50">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold backdrop-blur-md"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            Instant & Automated Appointment Booking
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight"
          >
            Book Top Professionals <br />
            <span className="bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              In Seconds
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-slate-300 font-normal max-w-xl mx-auto"
          >
            Discover certified clinics, hair studios, mentors, and repair services with real-time slot availability.
          </motion.p>

          {/* Search Bar */}
          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2 p-2 rounded-2xl bg-white/10 dark:bg-slate-900/80 border border-white/20 backdrop-blur-xl max-w-2xl mx-auto shadow-2xl"
          >
            <div className="flex-1 flex items-center gap-3 px-3 text-slate-300">
              <Search className="w-5 h-5 text-indigo-400" />
              <input
                type="text"
                placeholder="Search by business name, service, or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-white placeholder-slate-400 text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5"
            >
              <span>Search</span>
            </button>
          </motion.form>
        </div>
      </section>

      {/* Filter Category Chips */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Explore Services</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {providers.length} Verified Providers
          </span>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <motion.button
                key={cat}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
              >
                {cat}
              </motion.button>
            );
          })}
        </div>

        {/* Provider Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : providers.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <Calendar className="w-10 h-10 mx-auto text-slate-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Providers Found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Try clearing search filters or selecting a different category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {providers.map((p) => (
                <motion.div
                  key={p._id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="group relative flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500 dark:hover:border-indigo-500/50 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <CategoryBadge category={p.category} />
                      <div className="flex items-center gap-1 text-amber-500 text-xs font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200/50 dark:border-amber-900/50">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{p.avgRating ? p.avgRating.toFixed(1) : 'No ratings yet'}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {p.businessName}
                      </h3>
                      {p.location && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          <span className="truncate">{p.location}</span>
                        </p>
                      )}
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {p.description || 'Professional service provider.'}
                    </p>

                    {/* Services Pill Preview */}
                    {p.services && p.services.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-1.5">
                        {p.services.slice(0, 3).map((s) => (
                          <span
                            key={s._id}
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium"
                          >
                            {s.name}
                          </span>
                        ))}
                        {p.services.length > 3 && (
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 self-center">
                            +{p.services.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Buffer: {p.bufferMinutes}m
                    </span>

                    <Link
                      to={`/providers/${p._id}`}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-600 dark:hover:bg-indigo-500 text-indigo-600 dark:text-indigo-300 hover:text-white dark:hover:text-white text-xs font-bold transition-all group-hover:bg-indigo-600 group-hover:text-white"
                    >
                      <span>Book Now</span>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}
