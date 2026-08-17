import { useEffect, useMemo, useState, createContext, useContext, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAnalyzeWaste, type WasteAnalysis, type WasteAnalysisInputMimeType } from '@workspace/api-client-react';
import { Activity, ArrowRight, Award, Bell, CalendarDays, Check, ChevronDown, CircleHelp, CirclePlus, ClipboardCheck, Coins, Compass, Droplets, FileCheck2, Filter, Gift, Globe2, Home as HomeIcon, ImagePlus, Leaf, ListFilter, LocateFixed, LockKeyhole, LogOut, MapPin, Menu, Mic, Navigation, PackageCheck, Pencil, Plus, RefreshCw, Recycle, Search, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, UploadCloud, UserRound, Users, Wallet, X, Zap } from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

type WasteType = 'Plastic' | 'Organic' | 'E-waste' | 'Mixed';
type ReportStatus = 'Verified' | 'Pending review' | 'Needs detail';
type OpportunityStatus = 'Open' | 'Joined' | 'Full';
type TransactionType = 'earned' | 'redeemed';

type CleanupReport = {
  id: string; title: string; wasteType: WasteType; weightKg: number; location: string;
  description: string; estimatedQuantity: string; analysisExplanation: string; impact: string;
  status: ReportStatus; verificationScore: number; createdAt: string;
  submittedBy: string; beforeImage: string; afterImage: string; points: number;
};
type CleanupOpportunity = {
  id: string; title: string; area: string; wasteType: WasteType; estimatedKg: number;
  participants: number; status: OpportunityStatus;
};
type Transaction = { id: string; label: string; date: string; points: number; type: TransactionType };
type UserProfile = { name: string; handle: string; city: string; language: string; notifications: boolean; walletConnected: boolean };

const emptyReports: CleanupReport[] = [];
const emptyOpportunities: CleanupOpportunity[] = [];
const emptyTransactions: Transaction[] = [];
const defaultProfile: UserProfile = { name: 'Guest', handle: '@guest', city: '', language: 'English', notifications: true, walletConnected: false };
const LIVE_DATA_VERSION = 'live-v3';
const dataKeys = ['restora-reports', 'restora-opportunities', 'restora-transactions', 'restora-points'];

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }
function initials(name: string) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function formatDate(date: string) { return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short' }).format(new Date(date)); }
function prepareLiveData() {
  try {
    if (localStorage.getItem('restora-data-version') !== LIVE_DATA_VERSION) {
      dataKeys.forEach((key) => localStorage.removeItem(key));
      localStorage.setItem('restora-data-version', LIVE_DATA_VERSION);
    }
  } catch { /* localStorage can be unavailable in privacy mode */ }
}

type DataContextValue = {
  reports: CleanupReport[]; opportunities: CleanupOpportunity[]; transactions: Transaction[]; points: number;
  profile: UserProfile; updateProfile: (patch: Partial<UserProfile>) => void; addReport: (report: Omit<CleanupReport, 'id' | 'createdAt' | 'submittedBy' | 'points' | 'status'>) => void;
  joinOpportunity: (id: string) => void; redeem: (label: string, cost: number) => boolean; resetData: () => void; notify: (message: string) => void;
};
const DataContext = createContext<DataContextValue | null>(null);
function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error('Restora data context is missing');
  return value;
}
function DataProvider({ children }: { children: ReactNode }) {
  prepareLiveData();
  const [reports, setReports] = useState(() => load('restora-reports', emptyReports));
  const [opportunities, setOpportunities] = useState(() => load('restora-opportunities', emptyOpportunities));
  const [transactions, setTransactions] = useState(() => load('restora-transactions', emptyTransactions));
  const [points, setPoints] = useState(() => load('restora-points', 0));
  const [profile, setProfile] = useState(() => load('restora-profile', defaultProfile));
  const [toast, setToast] = useState('');
  useEffect(() => { save('restora-reports', reports); }, [reports]);
  useEffect(() => { save('restora-opportunities', opportunities); }, [opportunities]);
  useEffect(() => { save('restora-transactions', transactions); }, [transactions]);
  useEffect(() => { save('restora-points', points); }, [points]);
  useEffect(() => { save('restora-profile', profile); }, [profile]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3000); return () => window.clearTimeout(timer); }, [toast]);
  const updateProfile = (patch: Partial<UserProfile>) => setProfile((current) => ({ ...current, ...patch }));
  const addReport = (draft: Omit<CleanupReport, 'id' | 'createdAt' | 'submittedBy' | 'points' | 'status'>) => {
    const pointsEarned = Math.max(12, Math.round(draft.weightKg * 8) + Math.round(draft.verificationScore / 10));
    const report: CleanupReport = { ...draft, id: `r-${Date.now()}`, createdAt: new Date().toISOString(), submittedBy: profile.name, status: 'Verified', verificationScore: draft.verificationScore, points: pointsEarned };
    setReports((current) => [report, ...current]);
    setTransactions((current) => [{ id: `t-${Date.now()}`, label: `Verified report · ${draft.title}`, date: formatDate(new Date().toISOString()), points: pointsEarned, type: 'earned' }, ...current]);
    setPoints((current) => current + pointsEarned);
    setToast(`Report verified. ${pointsEarned} points added to your balance.`);
  };
  const joinOpportunity = (id: string) => {
    setOpportunities((current) => current.map((item) => item.id === id ? { ...item, status: 'Joined', participants: item.participants + 1 } : item));
    setToast('You are on the cleanup list. Details saved locally.');
  };
  const redeem = (label: string, cost: number) => {
    if (points < cost) { setToast(`You need ${cost - points} more points for this reward.`); return false; }
    setPoints((current) => current - cost);
    setTransactions((current) => [{ id: `t-${Date.now()}`, label, date: formatDate(new Date().toISOString()), points: -cost, type: 'redeemed' }, ...current]);
    setToast('Reward requested. Your points ledger has been updated.');
    return true;
  };
  const resetData = () => {
    setReports(emptyReports); setOpportunities(emptyOpportunities); setTransactions(emptyTransactions); setPoints(0); setProfile(defaultProfile);
    setToast('Your local activity has been cleared.');
  };
  return <DataContext.Provider value={{ reports, opportunities, transactions, points, profile, updateProfile, addReport, joinOpportunity, redeem, resetData, notify: setToast }}>{children}{toast && <div className="toast-message" role="status" data-testid="status-toast">{toast}</div>}</DataContext.Provider>;
}

const navItems: { href: string; label: string; icon: typeof HomeIcon }[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/report', label: 'Report waste', icon: CirclePlus },
  { href: '/collect', label: 'Collect waste', icon: Compass },
  { href: '/rewards', label: 'Rewards', icon: Coins },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];
function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { profile, points, notify } = useData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = location === '/' ? '/' : `/${location.split('/')[1]}`;
  return <div className="restora-shell">
    <aside className="restora-sidebar">
      <Link href="/" className="flex items-center gap-3 px-3 mb-12" data-testid="link-brand">
        <span className="brand-mark"><Leaf size={19} /></span>
         <span><span className="brand-word block text-lg">Zero2Hero</span><span className="text-[10px] tracking-[.16em] uppercase opacity-45">Waste management</span></span>
      </Link>
      <div className="px-3 mb-3 text-[10px] font-bold uppercase tracking-[.15em] opacity-40">Workspace</div>
      <nav className="grid gap-1">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`sidebar-link ${active === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label}</span></Link>)}
      </nav>
      <div className="mt-auto">
        <div className="border-t border-white/10 pt-4 mb-3 px-3">
          <div className="text-[10px] uppercase tracking-[.15em] opacity-40 mb-2">Your balance</div>
          <div className="flex items-center gap-2 text-sm font-bold"><Coins size={15} className="text-[#8ee3ac]" /> {points} points</div>
        </div>
        <Link href="/settings" className={`sidebar-link ${active === '/settings' ? 'active' : ''}`} data-testid="link-nav-settings"><SettingsIcon /><span>Settings</span></Link>
      </div>
    </aside>
    <main className="shell-main">
      <header className="topbar">
        <button className="button button-quiet p-0 w-9 md:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu size={18} /></button>
        <div className="topbar-search"><Search size={16} /><input aria-label="Search Restora" placeholder="Search reports, areas or contributors" data-testid="input-search" /></div>
        <div className="ml-auto flex items-center gap-4">
          <button className="text-muted-foreground" aria-label="Notifications" onClick={() => notify('No new notifications. Your activity is up to date.')} data-testid="button-notifications"><Bell size={18} /></button>
          <div className="h-7 w-px bg-border" />
          <div className="topbar-user flex items-center gap-2" data-testid="text-profile-summary"><span className="avatar !w-8 !h-8">{initials(profile.name)}</span><span className="hidden lg:block text-xs font-bold">{profile.name}</span><ChevronDown size={14} className="text-muted-foreground" /></div>
        </div>
      </header>
      {drawerOpen && <div className="fixed inset-0 z-50 bg-[#15292b]/45 md:hidden" onClick={() => setDrawerOpen(false)}>
        <div className="w-[270px] h-full bg-sidebar p-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex justify-between items-center mb-8"><span className="brand-word text-xl text-white">restora</span><button className="text-white/70" onClick={() => setDrawerOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X size={20} /></button></div>
          <nav className="grid gap-2">{navItems.concat([{ href: '/settings', label: 'Settings', icon: SettingsIcon }]).map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setDrawerOpen(false)} className={`sidebar-link ${active === href ? 'active' : ''}`} data-testid={`link-drawer-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label}</span></Link>)}</nav>
        </div>
      </div>}
      {children}
    </main>
    <nav className="mobile-nav">{navItems.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={active === href ? 'active' : ''} data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label.split(' ')[0]}</span></Link>)}</nav>
  </div>;
}

function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8"><div>{eyebrow && <div className="page-eyebrow mb-3">{eyebrow}</div>}<h1 className="page-title" data-testid={`text-page-title-${title.toLowerCase().replaceAll(' ', '-')}`}>{title}</h1>{subtitle && <p className="page-subtitle mt-3 max-w-2xl">{subtitle}</p>}</div>{action}</div>;
}
function HomePage() {
  const { reports, points } = useData();
  const totalWeight = reports.reduce((sum, report) => sum + report.weightKg, 0);
  const verified = reports.filter((report) => report.status === 'Verified').length;
  const uploadedImages = reports.reduce((sum, report) => sum + Number(Boolean(report.beforeImage)) + Number(Boolean(report.afterImage)), 0);
  const areas = useMemo(() => {
    const grouped = new Map<string, { weight: number; reports: number }>();
    reports.forEach((report) => {
      const area = report.location.trim() || 'Location pending';
      const current = grouped.get(area) ?? { weight: 0, reports: 0 };
      grouped.set(area, { weight: current.weight + report.weightKg, reports: current.reports + 1 });
    });
    return Array.from(grouped.entries()).sort((a, b) => b[1].weight - a[1].weight).slice(0, 3);
  }, [reports]);
  const maxAreaWeight = Math.max(...areas.map(([, value]) => value.weight), 1);
  const stats = [{ label: 'Waste logged', value: `${totalWeight.toFixed(1)} kg`, icon: Recycle }, { label: 'Reports submitted', value: verified.toString(), icon: FileCheck2 }, { label: 'Points earned', value: points.toString(), icon: Coins }, { label: 'Images uploaded', value: uploadedImages.toString(), icon: ImagePlus }];
  return <div className="page-wrap">
    <section className="welcome-home">
      <div className="welcome-emblem"><Leaf size={58} strokeWidth={1.55} /></div>
      <div className="page-eyebrow">A cleaner way to take action</div>
      <h1 className="welcome-title"><span>Zero-to-Hero</span> Waste Management</h1>
      <p className="welcome-copy">Upload a photo of waste, make the change visible, and keep your community moving toward cleaner shared spaces.</p>
      <Link href="/report" className="button button-primary welcome-cta" data-testid="button-start-report"><Plus size={16} /> Get started <ArrowRight size={15} /></Link>
    </section>
    {reports.length === 0 ? <section className="card empty-home-state"><ImagePlus size={22} className="text-primary" /><div><div className="section-title text-base">Your activity will appear here</div><p className="text-sm text-muted-foreground mt-1">Add an image from any cleanup to start your live record. Nothing is pre-filled.</p></div><Link href="/report" className="button button-quiet !min-h-9" data-testid="button-empty-home-upload">Add an image <ArrowRight size={14} /></Link></section> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">{stats.map(({ label, value, icon: Icon }) => <div className="card stat-card" key={label} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-icon"><Icon size={18} /></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>)}</div>
      <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-5 mb-6">
        <section className="card p-5 md:p-6"><div className="flex items-center justify-between mb-3"><div><div className="section-title">Recent uploads</div><div className="text-xs text-muted-foreground mt-1">Only images you have added appear here</div></div><Link href="/report" className="text-xs font-bold text-primary flex gap-1 items-center" data-testid="link-add-activity">Add another <ArrowRight size={14} /></Link></div>
           <div>{reports.slice(0, 4).map((report) => <div className="activity-row" key={report.id} data-testid={`row-report-${report.id}`}><div className="flex items-center gap-3 min-w-0">{report.beforeImage || report.afterImage ? <img className="activity-thumb" src={report.beforeImage || report.afterImage} alt="" /> : <div className="avatar"><Recycle size={14} /></div>}<div className="min-w-0"><div className="text-sm font-bold truncate">{report.title}</div><div className="text-xs text-muted-foreground flex gap-2 mt-1 flex-wrap"><span>{report.wasteType}</span><span>·</span><span>{report.estimatedQuantity}</span><span>·</span><span>{report.weightKg} kg</span><span>·</span><span>{report.location || 'Location pending'}</span><span>·</span><span>{formatDate(report.createdAt)}</span></div></div></div><div className="text-right shrink-0"><span className="badge badge-green"><Check size={11} /> Verified</span><div className="text-xs font-bold text-primary mt-1">+{report.points} pts</div></div></div>)}</div>
        </section>
        <section className="card pulse-visual p-6"><div className="pulse-grid" /><div className="relative z-10"><div className="flex items-center gap-2 text-xs font-bold text-[#8ee3ac]"><Activity size={15} /> LIVE ACTIVITY</div><div className="font-display text-2xl font-bold tracking-tight mt-3 max-w-[250px]">{uploadedImages} image{uploadedImages === 1 ? '' : 's'} on your record.</div><p className="text-sm text-white/60 mt-2 max-w-[260px]">This view grows from the evidence you submit, not from sample data.</p></div><div className="pulse-dots" aria-label="Uploaded activity visualization" data-testid="visual-community-pulse">{Array.from({ length: Math.max(3, Math.min(13, uploadedImages * 2)) }).map((_, index) => <span key={index} />)}</div><div className="relative z-10 mt-24 flex items-center gap-2 text-xs text-white/60"><span className="w-2 h-2 rounded-full bg-[#8ee3ac]" /> Your uploads <span className="ml-3 w-2 h-2 rounded-full bg-[#efbd67]" /> Verified records</div></section>
      </div>
      <section className="card p-5 md:p-6"><div className="flex items-center justify-between mb-5"><div><div className="section-title">Impact by location</div><div className="text-xs text-muted-foreground mt-1">Built from the locations you add to each image</div></div><Link href="/leaderboard" className="button button-quiet !min-h-8 !text-xs" data-testid="button-view-leaderboard">See contributors <ArrowRight size={13} /></Link></div><div className="grid md:grid-cols-3 gap-5">{areas.map(([area, value]) => <div key={area}><div className="flex justify-between text-sm font-bold mb-2"><span>{area}</span><span className="text-primary">{value.weight.toFixed(1)} kg</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(value.weight / maxAreaWeight * 100)}%` }} /></div><div className="text-[11px] text-muted-foreground mt-2">{value.reports} report{value.reports === 1 ? '' : 's'}</div></div>)}</div></section>
    </>}
  </div>;
}

function ReportPage() {
  const { addReport } = useData();
  const analysisMutation = useAnalyzeWaste();
  const [step, setStep] = useState<'form' | 'verify' | 'success'>('form');
  const [image, setImage] = useState('');
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState<WasteAnalysisInputMimeType | ''>('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<WasteAnalysis | null>(null);

  const readImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file so Gemini can inspect the visible waste.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Keep the image under 8 MB for a fast analysis.');
      return;
    }
    const supportedType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
    if (!supportedType) {
      setError('Use a JPG, PNG, WebP or GIF image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setFileName(file.name);
      setMimeType(file.type as WasteAnalysisInputMimeType);
      setAnalysis(null);
      setError('');
    };
    reader.onerror = () => setError('That image could not be read. Try selecting it again.');
    reader.readAsDataURL(file);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocation('Location pending');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`),
      () => setLocation('Location pending'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const startAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    if (!image || !mimeType) {
      setError('Add one clear image before starting analysis.');
      return;
    }
    const separator = image.indexOf(',');
    const imageBase64 = separator >= 0 ? image.slice(separator + 1) : image;
    setError('');
    captureLocation();
    try {
      const result = await analysisMutation.mutateAsync({ data: { imageBase64, mimeType } });
      setAnalysis(result);
      setStep('verify');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The image could not be analyzed. Try again.');
    }
  };

  const publish = () => {
    if (!analysis) return;
    const verificationScore = Math.round(analysis.confidence);
    addReport({
      title: analysis.title,
      wasteType: analysis.category,
      weightKg: analysis.estimatedWeightKg,
      location,
      description: analysis.explanation,
      estimatedQuantity: analysis.estimatedQuantity,
      analysisExplanation: analysis.explanation,
      impact: analysis.impact,
      verificationScore,
      beforeImage: image,
      afterImage: '',
    });
    setStep('success');
  };

  const resetForm = () => {
    setStep('form');
    setImage('');
    setFileName('');
    setMimeType('');
    setLocation('');
    setAnalysis(null);
    setError('');
    analysisMutation.reset();
  };

  if (step === 'success') return <div className="page-wrap"><div className="max-w-2xl mx-auto pt-8"><div className="success-panel text-center"><div className="mx-auto w-14 h-14 rounded-full bg-primary text-primary-foreground grid place-items-center mb-5"><Check size={26} /></div><div className="page-eyebrow">Analysis published</div><h1 className="font-display text-3xl font-bold tracking-tight mt-2">Your waste report is now live.</h1><p className="mt-3 text-sm">The AI-derived category and estimate were saved with your image, and points were added to your local wallet.</p><div className="flex flex-wrap justify-center gap-3 mt-7"><Link href="/" className="button button-primary" data-testid="button-success-home">Back to overview <ArrowRight size={15} /></Link><button className="button button-quiet" onClick={resetForm} data-testid="button-submit-another">Analyze another</button></div></div></div></div>;

  return <div className="page-wrap"><PageHeader eyebrow="AI-powered waste reporting" title="Upload to understand" subtitle="Add one clear image. Gemini will identify the visible waste, estimate its quantity and weight, and show you the result before anything is published." /><div className="max-w-4xl">
    <div className="flex items-center gap-2 mb-7">{['1. Upload', '2. Review AI result', '3. Publish'].map((label, index) => <div key={label} className={`flex items-center gap-2 text-xs font-bold ${step === (index === 0 ? 'form' : index === 1 ? 'verify' : 'success') ? 'text-primary' : 'text-muted-foreground'}`}><span className={`w-6 h-6 rounded-full grid place-items-center border ${index === 0 || step === 'verify' && index === 1 ? 'border-primary bg-secondary' : 'border-border'}`}>{index + 1}</span>{label}{index < 2 && <span className="w-8 md:w-16 h-px bg-border ml-1" />}</div>)}</div>
    {step === 'form' && <form onSubmit={startAnalysis} className="grid lg:grid-cols-[1.15fr_.85fr] gap-5">
      <section className="card p-5 md:p-7"><div className="section-title mb-2">Start with a photo</div><p className="text-sm text-muted-foreground mb-6">Use a well-lit photo where the waste is easy to see. No title, category or weight form is needed.</p><label className="upload-box block cursor-pointer min-h-[340px] flex flex-col justify-center" htmlFor="waste-upload">{image ? <img src={image} className="upload-preview max-h-[260px]" alt="Waste image preview" /> : <UploadCloud className="mx-auto text-primary mb-3" size={30} />}<div className="font-bold text-sm">{image ? 'Replace image' : 'Choose waste image'}</div><div className="text-xs text-muted-foreground mt-1">{fileName || 'JPG, PNG, WebP or GIF · up to 8 MB'}</div><input id="waste-upload" className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={readImage} data-testid="input-waste-image" /></label></section>
      <section className="card p-5 md:p-7 bg-secondary/45"><div className="flex items-center gap-2 text-primary mb-4"><Sparkles size={18} /><div className="section-title">What Gemini will return</div></div><div className="grid gap-3"><div className="rounded-xl bg-background/75 p-4"><div className="text-xs text-muted-foreground">Classification</div><div className="font-bold mt-1">Plastic, Organic, E-waste or Mixed</div></div><div className="rounded-xl bg-background/75 p-4"><div className="text-xs text-muted-foreground">Estimated amount</div><div className="font-bold mt-1">Quantity and approximate kilograms</div></div><div className="rounded-xl bg-background/75 p-4"><div className="text-xs text-muted-foreground">Transparent review</div><div className="font-bold mt-1">Confidence, evidence and impact explanation</div></div></div><div className="flex items-start gap-2 text-xs text-muted-foreground mt-6"><ShieldCheck size={15} className="text-primary shrink-0 mt-0.5" /> Nothing is published or rewarded until you review the result.</div></section>
      {error && <div className="lg:col-span-2 text-sm text-destructive bg-red-50 border border-red-100 rounded-lg p-3 flex gap-2 items-center" role="alert" data-testid="status-report-error"><CircleHelp size={16} /> {error}</div>}
      <div className="lg:col-span-2 flex justify-end"><button className="button button-primary" type="submit" disabled={analysisMutation.isPending} data-testid="button-analyze-waste">{analysisMutation.isPending ? <><RefreshCw size={15} className="animate-spin" /> Analyzing image…</> : <><Sparkles size={15} /> Analyze image <ArrowRight size={15} /></>}</button></div>
    </form>}
    {step === 'verify' && analysis && <section className="card p-5 md:p-8"><div className="grid lg:grid-cols-[.8fr_1.2fr] gap-7"><div><img src={image} className="w-full aspect-[4/3] object-cover rounded-2xl border border-border" alt="Uploaded waste evidence" /><div className="text-xs text-muted-foreground mt-3 truncate">{fileName}</div></div><div><div className="flex items-start justify-between gap-4 mb-6"><div><div className="page-eyebrow">AI result ready</div><h2 className="font-display text-2xl font-bold tracking-tight mt-2">{analysis.title}</h2><p className="page-subtitle mt-2">Review the estimate before adding this image to your live record.</p></div><div className="text-right shrink-0"><div className="text-4xl font-display font-bold text-primary">{Math.round(analysis.confidence)}</div><div className="text-xs text-muted-foreground">confidence</div></div></div><div className="grid sm:grid-cols-2 gap-3 mb-5"><div className="rounded-xl bg-muted/55 p-4"><div className="text-xs text-muted-foreground mb-2">Category</div><div className="font-bold flex items-center gap-2"><Recycle size={16} className="text-primary" /> {analysis.category}</div></div><div className="rounded-xl bg-muted/55 p-4"><div className="text-xs text-muted-foreground mb-2">Estimated quantity</div><div className="font-bold">{analysis.estimatedQuantity}</div></div><div className="rounded-xl bg-muted/55 p-4"><div className="text-xs text-muted-foreground mb-2">Estimated weight</div><div className="font-bold">{analysis.estimatedWeightKg} kg</div></div><div className="rounded-xl bg-muted/55 p-4"><div className="text-xs text-muted-foreground mb-2">Location</div><div className="font-bold flex items-center gap-2"><LocateFixed size={15} className="text-primary" /> {location || 'Location pending'}</div></div></div><div className="rounded-xl border border-border p-4 mb-3"><div className="text-xs text-muted-foreground mb-2">Why this was identified</div><p className="text-sm leading-6">{analysis.explanation}</p></div><div className="rounded-xl bg-secondary/55 p-4"><div className="text-xs text-muted-foreground mb-2">Community impact</div><p className="text-sm leading-6">{analysis.impact}</p></div></div></div><div className="flex flex-col-reverse sm:flex-row justify-between gap-3 mt-8 pt-5 border-t border-border"><button className="button button-quiet" onClick={() => setStep('form')} data-testid="button-edit-report"><Pencil size={14} /> Choose another image</button><button className="button button-primary" onClick={publish} data-testid="button-publish-report"><FileCheck2 size={15} /> Publish and award points</button></div></section>}
  </div></div>;
}

function CollectPage() {
  const { opportunities, joinOpportunity } = useData();
  const [wasteFilter, setWasteFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState<CleanupOpportunity | null>(null);
  const filtered = opportunities.filter((item) => (wasteFilter === 'All' || item.wasteType === wasteFilter) && (statusFilter === 'All' || item.status === statusFilter));
  return <div className="page-wrap"><PageHeader eyebrow="Find the next clear edge" title="Collect nearby" subtitle="Join a cleanup already taking shape. Details are simple, local and visible before you commit." action={<button className="button button-secondary" onClick={() => window.scrollTo({ top: 450, behavior: 'smooth' })} data-testid="button-explore-map"><MapPin size={15} /> Explore activity map</button>} /><div className="card p-3 mb-6 flex flex-wrap items-center gap-2"><Filter size={15} className="text-muted-foreground mx-1" /><span className="text-xs font-bold mr-1">Waste</span>{['All', 'Plastic', 'Organic', 'E-waste', 'Mixed'].map((filter) => <button key={filter} className={`filter-pill ${wasteFilter === filter ? 'active' : ''}`} onClick={() => setWasteFilter(filter)} data-testid={`filter-waste-${filter.toLowerCase()}`}>{filter}</button>)}<span className="w-px h-5 bg-border mx-2" /><span className="text-xs font-bold mr-1">Status</span>{['All', 'Open', 'Joined'].map((filter) => <button key={filter} className={`filter-pill ${statusFilter === filter ? 'active' : ''}`} onClick={() => setStatusFilter(filter)} data-testid={`filter-status-${filter.toLowerCase()}`}>{filter}</button>)}</div><div className="grid lg:grid-cols-[.85fr_1.15fr] gap-5"><section className="grid gap-3">{filtered.length ? filtered.map((item) => <div className="card p-5 hover-elevate" key={item.id} data-testid={`card-opportunity-${item.id}`}><div className="flex justify-between gap-3"><div><span className={`badge ${item.status === 'Open' ? 'badge-green' : item.status === 'Joined' ? 'badge-amber' : 'badge-slate'}`}>{item.status}</span><h2 className="font-display text-lg font-bold tracking-tight mt-3">{item.title}</h2><div className="text-xs text-muted-foreground flex gap-2 mt-1 items-center"><MapPin size={13} /> {item.area}</div></div><div className="text-right"><div className="font-display text-xl font-bold text-primary">{item.estimatedKg} kg</div><div className="text-[11px] text-muted-foreground">estimated</div></div></div><div className="flex items-center justify-between mt-5 pt-4 border-t border-border"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Users size={14} /> {item.participants} contributors <span>·</span> {item.wasteType}</div><button className="button button-quiet !min-h-8 !text-xs" onClick={() => setSelected(item)} data-testid={`button-open-opportunity-${item.id}`}>View details <ArrowRight size={13} /></button></div></div>) : <div className="card p-8 text-center"><ListFilter className="mx-auto text-muted-foreground mb-3" size={25} /><div className="font-bold">No cleanups match those filters.</div><p className="text-sm text-muted-foreground mt-1">Try widening the waste type or status.</p></div>}</section><section className="card map-card p-5" id="activity-map"><div className="relative z-10 flex justify-between"><div><div className="section-title">Activity map</div><div className="text-xs text-muted-foreground mt-1 bg-white/75 rounded px-2 py-1 inline-block">Accra · 14 active zones</div></div><button className="button button-quiet !min-h-8 !text-xs bg-white/80" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} data-testid="button-map-reset"><RefreshCw size={13} /> Reset</button></div><div className="map-pin" style={{ left: '27%', top: '38%' }} /><div className="map-pin" style={{ left: '56%', top: '27%', background: 'hsl(38 82% 60%)' }} /><div className="map-pin" style={{ left: '71%', top: '61%' }} /><div className="map-pin" style={{ left: '39%', top: '70%', background: 'hsl(38 82% 60%)' }} /><div className="absolute left-5 bottom-5 z-10 bg-white/85 rounded-lg p-3 text-xs"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary" /> Open cleanup</div><div className="flex items-center gap-2 mt-2"><span className="w-2 h-2 rounded-full bg-accent" /> Recent report</div></div></section></div>{selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal-card p-6" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><div className="flex justify-between gap-4"><div><span className={`badge ${selected.status === 'Open' ? 'badge-green' : 'badge-amber'}`}>{selected.status}</span><h2 className="font-display text-2xl font-bold tracking-tight mt-3">{selected.title}</h2><p className="text-sm text-muted-foreground mt-2 flex items-center gap-1"><MapPin size={14} /> {selected.area}</p></div><button className="text-muted-foreground" onClick={() => setSelected(null)} aria-label="Close opportunity" data-testid="button-close-opportunity"><X size={19} /></button></div><div className="grid grid-cols-3 gap-2 my-6"><div className="bg-muted rounded-lg p-3"><div className="text-[11px] text-muted-foreground">Waste</div><div className="font-bold text-sm mt-1">{selected.wasteType}</div></div><div className="bg-muted rounded-lg p-3"><div className="text-[11px] text-muted-foreground">Target</div><div className="font-bold text-sm mt-1">{selected.estimatedKg} kg</div></div><div className="bg-muted rounded-lg p-3"><div className="text-[11px] text-muted-foreground">Team</div><div className="font-bold text-sm mt-1">{selected.participants}</div></div></div><p className="text-sm leading-6 text-muted-foreground">Meet at the marked area with gloves, a sturdy bag and a phone for a clear before and after record. Joining reserves your place in this local effort.</p><button className="button button-primary w-full mt-6" disabled={selected.status !== 'Open'} onClick={() => { joinOpportunity(selected.id); setSelected(null); }} data-testid={`button-join-opportunity-${selected.id}`}>{selected.status === 'Open' ? <><Users size={15} /> Join this cleanup</> : selected.status}</button></div></div>}</div>;
}

function RewardsPage() {
  const { points, transactions, profile, updateProfile, redeem } = useData();
  const eligible = points >= 250;
  const connectWallet = () => { updateProfile({ walletConnected: !profile.walletConnected }); };
  return <div className="page-wrap"><PageHeader eyebrow="Your proof has value" title="Rewards wallet" subtitle="A transparent points ledger for the work you have verified. Redeem locally or keep building your balance." action={<button className={`button ${profile.walletConnected ? 'button-quiet' : 'button-primary'}`} onClick={connectWallet} data-testid="button-wallet-toggle"><Wallet size={15} /> {profile.walletConnected ? 'Disconnect wallet' : 'Connect wallet'}</button>} /><div className="grid md:grid-cols-2 gap-4 mb-5"><div className="card p-5 border-l-4 border-l-[#4e89df]"><div className="flex items-center justify-between"><div className="section-title text-base">Wallet connection</div><Wallet className="text-[#4e89df]" size={20} /></div>{profile.walletConnected ? <><div className="font-mono text-xs bg-muted rounded px-3 py-2 mt-5 truncate" data-testid="text-wallet-address">0x7A24…8C19 · local demo wallet</div><div className="text-xs text-muted-foreground mt-3 flex items-center gap-1"><Check size={13} className="text-primary" /> Connected and ready for reward requests</div></> : <><p className="text-sm text-muted-foreground mt-4">Connect to make your reward eligibility visible. No wallet extension is required for this demo.</p><button className="button button-primary w-full mt-4" onClick={connectWallet} data-testid="button-connect-wallet"><Wallet size={15} /> Connect wallet</button></>}</div><div className="card p-5 border-l-4 border-l-primary"><div className="flex items-center justify-between"><div className="section-title text-base">Available points</div><Coins className="text-primary" size={20} /></div><div className="font-display text-4xl font-bold tracking-tight text-primary mt-5" data-testid="text-points-balance">{points}</div><div className="text-xs text-muted-foreground mt-1">Restora points</div><div className="progress-track mt-5"><div className="progress-fill" style={{ width: `${Math.min(100, points / 250 * 100)}%` }} /></div><div className="text-[11px] text-muted-foreground mt-2">{eligible ? 'Eligible for the current reward cycle' : `${250 - points} points until the current reward cycle`}</div></div></div><section className="card p-5 md:p-6 mb-5"><div className="section-title mb-4">Reward information</div><div className="grid sm:grid-cols-3 gap-3"><div className="bg-muted/55 rounded-xl p-4"><Award size={18} className="text-accent-foreground mb-3" /><div className="text-xs text-muted-foreground">Eligibility</div><div className={`font-bold mt-1 ${eligible ? 'text-primary' : 'text-destructive'}`}>{eligible ? 'Yes, unlocked' : 'Keep collecting'}</div></div><div className="bg-muted/55 rounded-xl p-4"><Gift size={18} className="text-primary mb-3" /><div className="text-xs text-muted-foreground">Dynamic reward</div><div className="font-bold mt-1">{eligible ? '20 cedis credit' : `${250 - points} pts to unlock`}</div></div><div className="bg-muted/55 rounded-xl p-4"><Zap size={18} className="text-accent-foreground mb-3" /><div className="text-xs text-muted-foreground">Cycle closes</div><div className="font-bold mt-1">31 May 2025</div></div></div></section><div className="grid lg:grid-cols-[1.1fr_.9fr] gap-5"><section className="card p-5 md:p-6"><div className="flex items-center justify-between mb-2"><div><div className="section-title">Recent transactions</div><div className="text-xs text-muted-foreground mt-1">Every movement, accounted for</div></div><Activity size={18} className="text-muted-foreground" /></div>{transactions.slice(0, 5).map((transaction) => <div className="ledger-row" key={transaction.id} data-testid={`row-transaction-${transaction.id}`}><div className="ledger-icon">{transaction.type === 'earned' ? <ArrowRight size={14} /> : <Gift size={14} />}</div><div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{transaction.label}</div><div className="text-xs text-muted-foreground mt-1">{transaction.date}</div></div><div className={`text-sm font-bold ${transaction.type === 'earned' ? 'text-primary' : 'text-destructive'}`}>{transaction.points > 0 ? '+' : ''}{transaction.points}</div></div>)}</section><section className="grid gap-3"><RewardCard title="Community credit" detail="Redeem once you reach the current cycle threshold." cost={250} points={points} onRedeem={() => redeem('Community credit', 250)} testId="community-credit" /><RewardCard title="Cleanup kit support" detail="A smaller way to put your points back into the work." cost={120} points={points} onRedeem={() => redeem('Cleanup kit support', 120)} testId="cleanup-kit" /></section></div></div>;
}
function RewardCard({ title, detail, cost, points, onRedeem, testId }: { title: string; detail: string; cost: number; points: number; onRedeem: () => void; testId: string }) {
  return <div className="card p-5"><div className="flex justify-between gap-3"><div><div className="font-display font-bold">{title}</div><div className="text-xs text-muted-foreground mt-2 leading-5">{detail}</div></div><div className="text-primary font-bold text-sm shrink-0">{cost} pts</div></div><button className="button button-primary w-full mt-5" disabled={points < cost} onClick={onRedeem} data-testid={`button-redeem-${testId}`}><Gift size={15} /> {points >= cost ? 'Redeem reward' : 'Not enough points'}</button></div>;
}

function LeaderboardPage() {
  const { reports, profile } = useData();
  const [period, setPeriod] = useState('This month');
  const contributors = useMemo(() => {
    const base = [{ name: 'Nana Yaa', city: 'Accra', points: 614, reports: 11 }, { name: 'Kofi Mensah', city: 'Accra', points: 487, reports: 8 }, { name: 'Ama Owusu', city: 'Tema', points: 426, reports: 7 }, { name: profile.name, city: profile.city.split(',')[0], points: reports.reduce((sum, report) => sum + report.points, 0), reports: reports.length }].sort((a, b) => b.points - a.points);
    return base.filter((item, index, array) => array.findIndex((other) => other.name === item.name) === index);
  }, [profile, reports]);
  const userRank = contributors.findIndex((item) => item.name === profile.name) + 1;
  return <div className="page-wrap"><PageHeader eyebrow="Local effort, made visible" title="Leaderboard" subtitle="Recognition without noise. See who is moving the most weight and where the work is happening." action={<div className="flex gap-2">{['This month', 'All time'].map((item) => <button key={item} className={`filter-pill ${period === item ? 'active' : ''}`} onClick={() => setPeriod(item)} data-testid={`filter-period-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div>} /><div className="card p-5 md:p-6 mb-5 bg-sidebar text-sidebar-foreground border-0"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5"><div><div className="text-xs uppercase tracking-[.14em] text-sidebar-primary font-bold">Your current position</div><div className="font-display text-4xl font-bold mt-2">#{userRank || '—'}</div><div className="text-sm text-white/55 mt-1">among active contributors in {profile.city.split(',')[0]}</div></div><div className="sm:text-right"><div className="text-2xl font-display font-bold text-sidebar-primary">{contributors.find((item) => item.name === profile.name)?.points ?? 0} pts</div><div className="text-xs text-white/55 mt-1">across {reports.length} verified reports</div></div></div></div><section className="card overflow-hidden"><div className="p-5 md:p-6 border-b border-border flex justify-between items-center"><div><div className="section-title">Top contributors</div><div className="text-xs text-muted-foreground mt-1">{period} · Accra network</div></div><Trophy size={20} className="text-accent-foreground" /></div><div>{contributors.map((contributor, index) => <div className={`flex items-center gap-4 px-5 md:px-6 py-4 border-b border-border last:border-0 ${contributor.name === profile.name ? 'bg-secondary/45' : ''}`} key={contributor.name} data-testid={`row-leaderboard-${index + 1}`}><div className={`font-display text-lg font-bold w-7 ${index < 3 ? 'text-accent-foreground' : 'text-muted-foreground'}`}>{String(index + 1).padStart(2, '0')}</div><div className="avatar">{initials(contributor.name)}</div><div className="flex-1"><div className="text-sm font-bold">{contributor.name} {contributor.name === profile.name && <span className="badge badge-green ml-2">You</span>}</div><div className="text-xs text-muted-foreground mt-1">{contributor.city} · {contributor.reports} reports</div></div><div className="text-right"><div className="font-display font-bold text-primary">{contributor.points}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wide">points</div></div></div>)}</div></section><div className="grid md:grid-cols-3 gap-3 mt-5"><div className="card p-4"><Users className="text-primary mb-3" size={18} /><div className="font-bold">214 contributors</div><div className="text-xs text-muted-foreground mt-1">Across Greater Accra</div></div><div className="card p-4"><Recycle className="text-primary mb-3" size={18} /><div className="font-bold">1,482 kg moved</div><div className="text-xs text-muted-foreground mt-1">This reporting cycle</div></div><div className="card p-4"><MapPin className="text-primary mb-3" size={18} /><div className="font-bold">18 active zones</div><div className="text-xs text-muted-foreground mt-1">Where action is happening</div></div></div></div>;
}

function SettingsPage() {
  const { profile, updateProfile, resetData } = useData();
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(profile), [profile]);
  const saveSettings = (event: FormEvent) => { event.preventDefault(); updateProfile(form); setSaved(true); window.setTimeout(() => setSaved(false), 2400); };
  const update = (key: keyof UserProfile, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="page-wrap"><PageHeader eyebrow="Your local workspace" title="Settings" subtitle="Keep your public identity and notification rhythm useful. Everything in this demo remains in your browser." /><div className="grid lg:grid-cols-[.82fr_1.18fr] gap-5"><section className="card p-5 md:p-6"><div className="flex items-center gap-3 pb-5 mb-5 border-b border-border"><div className="avatar !w-12 !h-12 text-sm">{initials(form.name)}</div><div><div className="font-display font-bold">{form.name || 'Your name'}</div><div className="text-xs text-muted-foreground mt-1">{form.handle}</div></div></div><div className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground mb-4">Profile preview</div><div className="rounded-xl bg-secondary/55 p-4"><div className="text-sm leading-6">“I am helping make <strong>{form.city || 'my neighbourhood'}</strong> easier to breathe in.”</div><div className="text-xs text-muted-foreground mt-3">Visible beside verified community activity</div></div><div className="mt-5 text-xs text-muted-foreground flex items-start gap-2"><LockKeyhole size={14} className="shrink-0 mt-0.5" /> No public contact details are stored in this local demo.</div></section><form className="card p-5 md:p-6" onSubmit={saveSettings}><div className="section-title mb-5">Profile & preferences</div><div className="grid gap-4"><div><label className="field-label" htmlFor="display-name">Display name</label><input id="display-name" className="input-field" value={form.name} onChange={(event) => update('name', event.target.value)} data-testid="input-display-name" /></div><div><label className="field-label" htmlFor="handle">Handle</label><input id="handle" className="input-field" value={form.handle} onChange={(event) => update('handle', event.target.value)} data-testid="input-handle" /></div><div><label className="field-label" htmlFor="city">City / area</label><input id="city" className="input-field" value={form.city} onChange={(event) => update('city', event.target.value)} data-testid="input-city" /></div><div><label className="field-label" htmlFor="language">Language for guidance</label><select id="language" className="select-field" value={form.language} onChange={(event) => update('language', event.target.value)} data-testid="select-language"><option>English</option><option>Twi</option><option>Ga</option></select></div><label className="flex items-center justify-between gap-4 border border-border rounded-xl p-4 cursor-pointer"><span><span className="font-bold text-sm block">Community updates</span><span className="text-xs text-muted-foreground block mt-1">Notify me when local goals move</span></span><input type="checkbox" checked={form.notifications} onChange={(event) => update('notifications', event.target.checked)} className="accent-primary w-4 h-4" data-testid="input-notifications" /></label><div className="flex flex-col sm:flex-row gap-3 pt-2"><button className="button button-primary" type="submit" data-testid="button-save-settings"><Check size={15} /> Save changes</button>{saved && <span className="text-xs text-primary font-bold self-center" role="status" data-testid="status-settings-saved">Saved to this browser</span>}</div></div></form></div><section className="card p-5 md:p-6 mt-5"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><div className="section-title text-base">Wallet & demo data</div><p className="text-xs text-muted-foreground mt-2">Wallet state: <strong>{profile.walletConnected ? 'Connected' : 'Not connected'}</strong>. Reset clears your reports, points and preferences back to the starting scenario.</p></div><div className="flex gap-2"><Link href="/rewards" className="button button-quiet" data-testid="button-settings-rewards"><Wallet size={14} /> Wallet</Link><button className="button button-danger" onClick={() => { if (window.confirm('Reset all Restora demo data?')) resetData(); }} data-testid="button-reset-data"><RefreshCw size={14} /> Reset demo</button></div></div></section></div>;
}

function NotFound() { return <div className="page-wrap text-center pt-24"><CircleHelp className="mx-auto text-primary mb-4" size={30} /><h1 className="page-title">That page is not in the record.</h1><Link href="/" className="button button-primary mt-7" data-testid="button-not-found-home">Return home</Link></div>; }
function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
const queryClient = new QueryClient();
function Router() {
  return <RoutedErrorBoundary><Shell><Switch><Route path="/" component={HomePage} /><Route path="/report" component={ReportPage} /><Route path="/collect" component={CollectPage} /><Route path="/rewards" component={RewardsPage} /><Route path="/leaderboard" component={LeaderboardPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><DataProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></DataProvider></TooltipProvider></QueryClientProvider>;
}
export default App;