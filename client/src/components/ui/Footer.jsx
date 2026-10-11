import React from 'react';
import { Calendar, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md transition-colors py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            <Calendar className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            BookEase Platform
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          Built with precision for seamless scheduling. Powered by Node.js, Express & React.
        </p>

        <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Support</span>
        </div>
      </div>
    </footer>
  );
}
