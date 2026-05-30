import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { apiErrorMessage } from '@/lib/api/client';
import { homePathFor } from '@/lib/utils/role';
import logoImg from '@/assets/Sk Learnings.png';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
  tenantSlug: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasToken } = useAuthStore();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const me = useCurrentUser();

  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', tenantSlug: '' },
  });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async (tokens) => {
      setTokens(tokens.accessToken, tokens.refreshToken);
      const profile = await authApi.me();
      setUser(profile);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? homePathFor(profile.role), { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  useEffect(() => {
    if (me.user) navigate(homePathFor(me.user.role), { replace: true });
  }, [me.user, navigate]);

  if (user && hasToken) return <Navigate to={homePathFor(user.role)} replace />;

  return (
    <div className="custom-page-container relative min-h-screen w-full bg-[#F4F6FA] flex items-center justify-center p-4 lg:p-12 overflow-hidden select-none">
      {/* Premium Typography & Custom Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cinzel:wght@500;700;800&display=swap');
        
        .custom-page-container {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(-5%); }
          50% { transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(6deg); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(-4deg); }
        }
        @keyframes custom-ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }

        .animate-custom-spin {
          animation: spin 1s linear infinite;
        }
        .animate-custom-bounce {
          animation: bounce 2.5s ease-in-out infinite;
        }
        .animate-custom-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-float-slow {
          animation: float-slow 8s ease-in-out infinite;
        }
        .animate-float-medium {
          animation: float-medium 6s ease-in-out infinite;
        }
        .animate-custom-ping {
          animation: custom-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>

      {/* TOP-RIGHT CORNER AESTHETIC BUBBLES */}
      {/* Large Gradient Sphere */}
      <div 
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(224,231,255,0.7) 0%, rgba(244,246,250,0) 70%)',
          top: '-15%',
          right: '-15%'
        }}
      />
      {/* Overlapping Indigo/Soft-Teal Sphere */}
      <div 
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '350px',
          height: '350px',
          background: 'radial-gradient(circle, rgba(238,242,255,0.85) 0%, rgba(219,234,254,0.3) 50%, rgba(244,246,250,0) 80%)',
          top: '0%',
          right: '-5%'
        }}
      />
      {/* Large Floating Glassmorphic Bubble */}
      <div 
        className="absolute animate-float-slow rounded-full border border-white/40 backdrop-blur-md pointer-events-none hidden md:block"
        style={{
          width: '120px',
          height: '120px',
          background: 'rgba(255, 255, 255, 0.15)',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04), inset 0 8px 32px 0 rgba(255, 255, 255, 0.25)',
          top: '12%',
          right: '12%'
        }}
      />
      {/* Companion Small Glassmorphic Bubble */}
      <div 
        className="absolute animate-float-medium rounded-full border border-white/30 backdrop-blur-sm pointer-events-none hidden md:block"
        style={{
          width: '60px',
          height: '60px',
          background: 'rgba(255, 255, 255, 0.1)',
          boxShadow: 'inset 0 4px 16px 0 rgba(255, 255, 255, 0.15)',
          top: '26%',
          right: '8%'
        }}
      />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-[48%_52%] gap-8 lg:gap-12 items-center">
        
        {/* Left Side: Branding */}
        <div className="hidden lg:flex flex-col items-center text-center px-4">
          {/* Logo Card */}
          <div 
            className="w-[240px] h-[240px] bg-transparent flex flex-col items-center justify-center relative select-none"
          >
            {/* Logo Image */}
            <div className="flex-1 flex items-center justify-center w-full h-full">
              <img src={logoImg} alt="The SK Learnings" className="w-full h-full object-contain" />
            </div>
          </div>

          {/* Bespoke Value Props Wording */}
          <h2 
            className="text-[#0E1B3D] font-extrabold mt-8 tracking-tight"
            style={{ fontSize: '30px', lineHeight: '38px' }}
          >
            Seamless Assessments,<br />Powerful Insights
          </h2>
          <p className="text-[#5C6F84] text-[13.5px] mt-3.5 max-w-[390px] leading-relaxed font-medium">
            Experience a unified ecosystem designed to streamline exam creation, automate student evaluation, and deliver deep analytical clarity for modern educational institutions.
          </p>
        </div>

        {/* Right Side: Sign In Card */}
        <div className="flex justify-center items-center w-full px-2">
          <div 
            className="w-full max-w-[440px] flex flex-col relative"
            style={{ 
              borderRadius: '28px', 
              boxShadow: '0px 30px 70px rgba(0, 0, 0, 0.025), 0px 4px 16px rgba(0, 0, 0, 0.005)',
              background: '#FFFFFF',
              border: '1px solid #EEF2F6',
              minHeight: '480px',
              padding: '40px'
            }}
          >
            {/* Top Shield + Star Badge Illustration */}
            <div className="relative w-28 h-28 mx-auto mb-6 flex items-center justify-center">
              {/* Outer glowing ring */}
              <div 
                className="absolute inset-0 rounded-full blur-xl opacity-20 animate-custom-pulse pointer-events-none"
                style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }}
              />
              
              {/* Glass container circle */}
              <div 
                className="relative w-20 h-20 rounded-full flex items-center justify-center border border-white/60 bg-white/70 backdrop-blur-md"
                style={{ boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.05)' }}
              >
                {/* Image replacing SVG shield */}
                <img src={logoImg} alt="Icon" className="w-12 h-12 object-contain" />
                
                {/* Floating micro sparks around the badge */}
                <div className="absolute top-2 right-4 w-1.5 h-1.5 rounded-full bg-[#ECC06B] animate-custom-ping" style={{ animationDelay: '0.5s' }} />
                <div className="absolute bottom-4 left-3 w-1 h-1 rounded-full bg-[#3498DB] animate-custom-ping" style={{ animationDelay: '1.2s' }} />
              </div>
            </div>

            {/* Form Title */}
            <h1 className="text-[#0E1B3D] text-[22px] font-extrabold text-center mb-6 tracking-tight">
              Sign In
            </h1>

            {/* Form */}
            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="flex flex-col gap-4 flex-1">
              {/* Email (Login ID) Input */}
              <div className="flex flex-col w-full">
                <input
                  id="email"
                  type="email"
                  placeholder="Enter Login ID"
                  autoComplete="email"
                  disabled={mutation.isPending}
                  className="w-full h-12 px-4 rounded-lg bg-white border text-sm text-[#1E293B] placeholder-[#A0AEC0] focus:outline-none transition-all duration-200"
                  style={{
                    borderColor: formState.errors.email ? '#F87171' : '#CBD5E0',
                    boxShadow: formState.errors.email ? '0 0 0 4px rgba(248, 113, 113, 0.1)' : undefined
                  }}
                  {...register('email')}
                />
                {formState.errors.email && (
                  <span 
                    className="text-[11px] mt-1 font-semibold pl-1"
                    style={{ color: '#EF4444' }}
                  >
                    {formState.errors.email.message}
                  </span>
                )}
              </div>

              {/* Password Input with Show/Hide Eye Toggle */}
              <div className="flex flex-col w-full">
                <div className="relative w-full">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    autoComplete="current-password"
                    disabled={mutation.isPending}
                    className="w-full h-12 pl-4 pr-12 rounded-lg bg-white border text-sm text-[#1E293B] placeholder-[#A0AEC0] focus:outline-none transition-all duration-200"
                    style={{
                      borderColor: formState.errors.password ? '#F87171' : '#CBD5E0',
                      boxShadow: formState.errors.password ? '0 0 0 4px rgba(248, 113, 113, 0.1)' : undefined
                    }}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showPassword ? (
                      /* Eye Off SVG */
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      /* Eye SVG */
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {formState.errors.password && (
                  <span 
                    className="text-[11px] mt-1 font-semibold pl-1"
                    style={{ color: '#EF4444' }}
                  >
                    {formState.errors.password.message}
                  </span>
                )}
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full h-12 rounded-lg bg-[#1A80F8] hover:bg-[#156ED3] active:bg-[#0F56A8] text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(26,128,248,0.2)] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {mutation.isPending ? (
                  <svg className="animate-custom-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  'SIGN IN'
                )}
              </button>
            </form>
          </div>
        </div>
        
      </div>

      {/* Privacy Policy Link - Bottom Right */}
      <div className="absolute bottom-6 right-8 text-right z-20">
        <a 
          href="#"
          onClick={(e) => {
            e.preventDefault();
            toast.info('Privacy Policy is currently under review.');
          }}
          className="text-[12px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          Privacy Policy
        </a>
      </div>
    </div>
  );
};



