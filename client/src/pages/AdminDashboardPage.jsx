import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle2, XCircle, Users, Calendar, AlertCircle } from 'lucide-react';
import { adminAPI } from '../services/api';
import { StatusBadge } from '../components/ui/Badge';
import toast from 'react-hot-toast';
import { formatDate, formatTime } from '../lib/utils';

export default function AdminDashboardPage() {
  const [providers, setProviders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [provRes, apptRes] = await Promise.all([
        adminAPI.getProviders(),
        adminAPI.getAppointments()
      ]);

      setProviders(provRes.data.data.providers);
      setAppointments(apptRes.data.data.appointments);
      setStats(apptRes.data.data.stats);
    } catch (err) {
      toast.error('Failed to load admin platform data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApproval = async (providerId) => {
    try {
      await adminAPI.toggleApproval(providerId);
      toast.success('Provider approval status updated');
      fetchAdminData();
    } catch (err) {
      toast.error('Failed to update approval status');
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading Admin Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-16">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Platform Administration
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Oversee provider approvals, platform metrics, and system appointments.</p>
        </div>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Providers</span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{stats.totalProviders}</div>
          </div>
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Users</span>
            <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">{stats.totalUsers}</div>
          </div>
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Appointments</span>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{stats.totalAppointments}</div>
          </div>
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase">Confirmed</span>
            <div className="text-3xl font-extrabold text-amber-500 mt-1">{stats.confirmedCount}</div>
          </div>
        </div>
      )}

      {/* Provider Approval Queue */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Provider Approval Queue</h2>

        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="pb-3">Business Name</th>
                <th className="pb-3">Category</th>
                <th className="pb-3">Owner Email</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Approval Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {providers.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-4 font-bold text-slate-900 dark:text-slate-100">{p.businessName}</td>
                  <td className="py-4 font-medium text-slate-600 dark:text-slate-300">{p.category}</td>
                  <td className="py-4 text-slate-500">{p.userId?.email || 'N/A'}</td>
                  <td className="py-4">
                    {p.isApproved ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-right">
                    <button
                      onClick={() => handleToggleApproval(p._id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        p.isApproved
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-100'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                      }`}
                    >
                      {p.isApproved ? 'Revoke Approval' : 'Approve Provider'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
