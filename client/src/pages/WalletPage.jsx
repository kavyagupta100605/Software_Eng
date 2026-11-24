import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { walletAPI, walletQuery } from '../services/api';
import { formatCurrency } from '../lib/utils';

export default function WalletPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const balance = useQuery(walletQuery(user));
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  async function addFunds(event) {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    setSaving(true);
    try {
      await walletAPI.topUp(amountCents);
      setAmount('');
      await queryClient.invalidateQueries({ queryKey: walletQuery(user).queryKey });
      toast.success(`${formatCurrency(amountCents / 100)} added to your demo wallet`);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not add demo funds');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-extrabold">Demo wallet</h1>
      <div className="rounded-2xl bg-indigo-700 p-6 text-white">
        <Wallet aria-hidden="true" className="mb-3 h-6 w-6" />
        <p className="text-sm">Available demo balance</p>
        <p className="mt-1 text-3xl font-bold" aria-live="polite">
          {balance.isError ? 'Unavailable' : balance.isPending ? 'Loading…' : formatCurrency(balance.data / 100)}
        </p>
      </div>
      <form onSubmit={addFunds} className="space-y-4 rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        <div>
          <label htmlFor="wallet-amount" className="block font-semibold">Amount in USD</label>
          <input id="wallet-amount" type="number" required min="1" max="1000" step="0.01"
            value={amount} onChange={event => setAmount(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 dark:border-slate-700" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">Use simulated funds to book appointments. No real money or card details are used.</p>
        <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
          {saving ? 'Adding funds…' : 'Add demo funds'}
        </button>
      </form>
    </section>
  );
}
