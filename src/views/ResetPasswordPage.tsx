import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useData } from '../context/DataContext';

export const ResetPasswordPage: React.FC = () => {
  const { navigateTo } = useData();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkRecoverySession = async () => {
      try {
        const hash = window.location.hash || '';
        const search = window.location.search || '';

        // Check if Supabase returned an error in the hash fragment (e.g., expired token)
        if (hash.includes('error=')) {
          const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
          const errDesc = hashParams.get('error_description') || hashParams.get('error');
          if (errDesc) {
            const decoded = decodeURIComponent(errDesc.replace(/\+/g, ' '));
            if (isMounted) {
              setSessionError(
                decoded.includes('expired')
                  ? 'Tautan pemulihan kata sandi telah kedaluwarsa. Silakan minta tautan baru.'
                  : `Gagal memverifikasi tautan: ${decoded}`
              );
              setIsCheckingSession(false);
            }
            return;
          }
        }

        // Check if there is an active session in Supabase Auth
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          if (isMounted) {
            setSessionError(error.message);
            setIsCheckingSession(false);
          }
          return;
        }

        // Check if the URL indicates recovery or active session exists
        const hasRecoveryMarker = 
          hash.includes('type=recovery') || 
          search.includes('type=recovery') || 
          hash.includes('access_token=') ||
          search.includes('code=');

        if (session || hasRecoveryMarker) {
          if (isMounted) {
            setIsRecoverySession(true);
            setIsCheckingSession(false);
          }
        } else {
          if (isMounted) {
            setIsRecoverySession(false);
            setSessionError('Tautan pemulihan kata sandi tidak ditemukan atau telah kedaluwarsa.');
            setIsCheckingSession(false);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setSessionError(err.message || 'Gagal memverifikasi sesi pemulihan.');
          setIsCheckingSession(false);
        }
      }
    };

    checkRecoverySession();

    // Listen for PASSWORD_RECOVERY auth event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
        setIsRecoverySession(true);
        setSessionError(null);
        setIsCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!password || password.length < 6) {
      setErrorMessage('Kata sandi baru minimal harus 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok. Pastikan kedua kolom sama.');
      return;
    }

    setIsLoading(true);

    try {
      // Supabase Auth: update user password
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      setIsLoading(false);

      if (error) {
        setErrorMessage(error.message || 'Gagal memperbarui kata sandi. Silakan coba kembali.');
        return;
      }

      setSuccessMessage('Kata sandi berhasil diperbarui! Anda dapat masuk ke Admin CMS sekarang.');

      // Clear the URL hash and query params
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      // Redirect to admin login after 2 seconds
      setTimeout(() => {
        navigateTo('admin');
      }, 2000);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memperbarui kata sandi.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-[#FAF9F6] flex flex-col justify-between p-4 sm:p-6 lg:p-8 selection:bg-white selection:text-black">
      {/* Top Header */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between pt-2 sm:pt-4">
        <button
          onClick={() => navigateTo('admin')}
          className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Login Admin</span>
        </button>

        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-full text-[10px] text-[#AAA] tracking-wider uppercase">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Pemulihan Akun</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-[#141414] border border-[#262626] rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white text-[#0E0E0E] mb-2 shadow-sm">
              <Camera className="w-6 h-6" />
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-white">
              Atur Ulang Kata Sandi
            </h1>
            <p className="text-xs text-[#888] max-w-xs mx-auto leading-relaxed">
              FujiFinder Editorial Platform • Masukkan kata sandi baru untuk akun administrator Anda.
            </p>
          </div>

          {/* Checking Session State */}
          {isCheckingSession && (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="w-6 h-6 text-neutral-400 animate-spin" />
              <p className="text-xs text-[#888]">Memverifikasi tautan pemulihan Supabase...</p>
            </div>
          )}

          {/* Invalid or Expired Session Notice */}
          {!isCheckingSession && !isRecoverySession && (
            <div className="space-y-4">
              <div className="p-4 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-200 flex items-start gap-2.5 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <div className="space-y-1">
                  <p className="font-medium text-red-300">Tautan Pemulihan Tidak Valid</p>
                  <p className="text-[#AAA] leading-relaxed">
                    {sessionError || 'Tautan pemulihan kata sandi telah kedaluwarsa atau tidak valid. Silakan minta tautan baru.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigateTo('admin')}
                className="w-full py-2.5 px-4 bg-[#222] hover:bg-[#333] text-white font-medium text-xs sm:text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Minta Tautan Baru di Halaman Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Active Recovery Session: Password Form */}
          {!isCheckingSession && isRecoverySession && (
            <>
              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-start gap-2 text-left animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Success Message */}
              {successMessage && (
                <div className="p-4 bg-emerald-950/70 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5 text-left animate-in fade-in">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <div className="space-y-1">
                    <p className="font-medium text-emerald-200">Kata Sandi Berhasil Diperbarui!</p>
                    <p className="text-emerald-300/90 leading-relaxed">
                      {successMessage} Mengalihkan ke halaman login...
                    </p>
                  </div>
                </div>
              )}

              {!successMessage && (
                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#BBB] uppercase tracking-wider text-[10px]">
                      Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#666]">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        required
                        minLength={6}
                        className="w-full bg-[#1A1A1A] border border-[#2E2E2E] focus:border-white text-white rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm placeholder:text-[#555] focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#777] hover:text-white cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#BBB] uppercase tracking-wider text-[10px]">
                      Konfirmasi Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#666]">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata sandi baru"
                        required
                        minLength={6}
                        className="w-full bg-[#1A1A1A] border border-[#2E2E2E] focus:border-white text-white rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm placeholder:text-[#555] focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#777] hover:text-white cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 py-3 px-4 bg-white hover:bg-neutral-200 text-[#0E0E0E] font-bold text-xs sm:text-sm tracking-wide rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Perbarui Kata Sandi</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom Footer Note */}
      <div className="w-full max-w-md mx-auto text-center pb-2 text-[11px] text-[#666]">
        FujiFinder Editorial Platform • Supabase Authentication Protected
      </div>
    </div>
  );
};
