/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef, useCallback, ChangeEvent, FormEvent } from 'react';
import { Search, FileText, Filter, Copy, Check, Trash2, Gamepad2, Lock, Settings, X, Plus, Upload, Cloud, CloudOff, RefreshCw, Download, ShieldCheck, Cpu, Share2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { Turnstile } from './components/Turnstile';
import { auth, db, getDeviceId, handleFirestoreError, OperationType, googleProvider } from './lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';

const DEFAULT_KEYWORDS = [
  { label: 'supercell.com -', value: 'supercell.com' },
  { label: 'garena.com -', value: 'garena.com' },
  { label: 'mtacc -:', value: 'mtacc' },
];

const ADMIN_PASSWORD = 'TeleHostAdmin@#$021412#';

const SakuraBackground = () => {
  const petals = useMemo(() => Array.from({ length: 30 }), []);
  
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Static background accents */}
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-zen-red/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-zen-red/5 rounded-full blur-3xl" />
      
      {petals.map((_, i) => {
        const size = Math.random() * 8 + 6;
        const startLeft = Math.random() * 100;
        const duration = Math.random() * 20 + 15;
        const delay = Math.random() * 20;
        
        return (
          <motion.div
            key={i}
            className="absolute bg-zen-red/15"
            style={{
              width: size,
              height: size * 1.4,
              left: `${startLeft}%`,
              top: `-10%`,
              borderRadius: '100% 0% 100% 0%',
              filter: 'blur(0.4px)',
            }}
            animate={{
              top: '110%',
              left: `${startLeft + (Math.random() * 40 - 20)}%`,
              rotate: [0, 90, 180, 270, 360],
              x: [0, 25, -25, 0],
            }}
            transition={{
              duration: duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: delay,
            }}
          />
        );
      })}
    </div>
  );
};

export default function App() {
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [selectedKeyword, setSelectedKeyword] = useState(DEFAULT_KEYWORDS[0].value);
  const [copied, setCopied] = useState(false);
  const [searchLimit, setSearchLimit] = useState(300);
  const [results, setResults] = useState<string[]>([]);
  const [removeUrls, setRemoveUrls] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Admin State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);
  
  // Admin Management State
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Anti-Leak State
  const [isLinkLocked, setIsLinkLocked] = useState(false);
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string>('');

  // Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Handle Link Validation
  useEffect(() => {
    const validateLink = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const linkId = urlParams.get('sl');
      const currentDeviceId = await getDeviceId();
      setDeviceId(currentDeviceId);

      if (!linkId) {
        setIsCheckingLink(false);
        return;
      }

      try {
        const linkRef = doc(db, 'shareLinks', linkId);
        const linkSnap = await getDoc(linkRef);

        if (!linkSnap.exists()) {
          setVerificationError('Invalid share link.');
          setIsLinkLocked(true);
        } else {
          const data = linkSnap.data();
          if (data.isUsed && data.deviceId !== currentDeviceId) {
            setVerificationError('This link is already used by another device.');
            setIsLinkLocked(true);
          } else if (!data.isUsed) {
            // Claim the link
            await updateDoc(linkRef, {
              isUsed: true,
              deviceId: currentDeviceId
            });
            console.log('Link claimed by device:', currentDeviceId);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `shareLinks/${linkId}`);
      } finally {
        setIsCheckingLink(false);
      }
    };

    validateLink();
  }, []);

  const generateShareLink = async () => {
    if (!user) {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (error) {
        console.error('Login failed:', error);
        return;
      }
    }

    const linkId = Math.random().toString(36).substring(2, 15);
    const linkRef = doc(db, 'shareLinks', linkId);

    try {
      await setDoc(linkRef, {
        id: linkId,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid,
        isUsed: false
      });
      
      const url = new URL(window.location.href);
      url.searchParams.set('sl', linkId);
      setShareLink(url.toString());
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `shareLinks/${linkId}`);
    }
  };

  // Load keywords and stock from Supabase on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsSyncing(true);
      try {
        // Fetch Keywords
        const { data: kwData } = await supabase
          .from('app_data')
          .select('value')
          .eq('key', 'keywords')
          .single();
        
        if (kwData?.value?.list) {
          setKeywords(kwData.value.list);
          if (kwData.value.list.length > 0) setSelectedKeyword(kwData.value.list[0].value);
        }

        // Fetch Stock
        const { data: stockData } = await supabase
          .from('app_data')
          .select('value')
          .eq('key', 'stock')
          .single();
        
        if (stockData?.value?.content) {
          setInput(stockData.value.content);
        }
        setLastSync(new Date());
      } catch (e) {
        console.warn('Supabase fetch failed, falling back to localStorage');
        // Fallback to localStorage
        const savedKeywords = localStorage.getItem('ksp_keywords');
        if (savedKeywords) setKeywords(JSON.parse(savedKeywords));
        const savedStock = localStorage.getItem('ksp_stock');
        if (savedStock) setInput(savedStock);
      } finally {
        setIsSyncing(false);
      }
    };

    fetchData();
  }, []);

  // Cooldown Persistence & Timer
  useEffect(() => {
    const lastSearchTime = localStorage.getItem('ksp_last_search');
    if (lastSearchTime) {
      const elapsed = Date.now() - parseInt(lastSearchTime);
      const remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));
      if (remaining > 0) {
        setCooldown(remaining);
      }
    }
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Debounced save to Supabase
  const saveToCloud = useCallback(async (key: string, value: any) => {
    setIsSyncing(true);
    try {
      await supabase
        .from('app_data')
        .upsert({ key, value }, { onConflict: 'key' });
      setLastSync(new Date());
    } catch (e) {
      console.error('Cloud save failed:', e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Auto-save keywords
  useEffect(() => {
    localStorage.setItem('ksp_keywords', JSON.stringify(keywords));
    const timer = setTimeout(() => {
      saveToCloud('keywords', { list: keywords });
    }, 2000);
    return () => clearTimeout(timer);
  }, [keywords, saveToCloud]);

  // Auto-save stock
  useEffect(() => {
    localStorage.setItem('ksp_stock', input);
    const timer = setTimeout(() => {
      saveToCloud('stock', { content: input });
    }, 3000);
    return () => clearTimeout(timer);
  }, [input, saveToCloud]);

  const totalLinesInSource = useMemo(() => {
    return input.split('\n').filter(line => line.trim() !== '').length;
  }, [input]);

  const handleSearch = () => {
    const allLines = input.split('\n').filter(line => line.trim() !== '');
    // We search within the user-defined limit
    const searchArea = allLines.slice(0, searchLimit);
    const remainingArea = allLines.slice(searchLimit);

    // Find matches in the search area
    const matchedLines = searchArea.filter(line => 
      line.toLowerCase().includes(selectedKeyword.toLowerCase())
    );
    
    let processedResults: string[];
    if (removeUrls) {
      const regex = /([^:\s]+:[^:\s]+)$/;
      processedResults = matchedLines
        .map(line => {
          const match = line.trim().match(regex);
          return match ? match[1] : null;
        })
        .filter((line): line is string => line !== null);
    } else {
      processedResults = matchedLines;
    }

    // Keep lines that DON'T match to put back into the stock
    const unmatchedInSearchArea = searchArea.filter(line => 
      !line.toLowerCase().includes(selectedKeyword.toLowerCase())
    );

    // Update results (unique)
    const uniqueResults = Array.from(new Set(processedResults));
    setResults(uniqueResults);

    // Update global stock (input): remove the matched lines
    const newStock = [...unmatchedInSearchArea, ...remainingArea].join('\n');
    setInput(newStock);

    // Set Cooldown
    setCooldown(30);
    localStorage.setItem('ksp_last_search', Date.now().toString());
  };

  const handleCopy = () => {
    if (results.length === 0) return;
    navigator.clipboard.writeText(results.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const element = document.createElement("a");
    const file = new Blob([results.join('\n')], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `omni_search_${selectedKeyword}_${new Date().getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleClear = () => {
    setInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInput(content);
    };
    reader.readAsText(file);
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthorized(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const addKeyword = () => {
    if (!newLabel || !newValue) return;
    const updated = [...keywords, { label: newLabel, value: newValue }];
    setKeywords(updated);
    localStorage.setItem('ksp_keywords', JSON.stringify(updated));
    setNewLabel('');
    setNewValue('');
  };

  const deleteKeyword = (index: number) => {
    const updated = keywords.filter((_, i) => i !== index);
    setKeywords(updated);
    localStorage.setItem('ksp_keywords', JSON.stringify(updated));
    if (selectedKeyword === keywords[index].value && updated.length > 0) {
      setSelectedKeyword(updated[0].value);
    }
  };

  const resetKeywords = () => {
    setKeywords(DEFAULT_KEYWORDS);
    localStorage.setItem('ksp_keywords', JSON.stringify(DEFAULT_KEYWORDS));
    setSelectedKeyword(DEFAULT_KEYWORDS[0].value);
  };

  if (isCheckingLink) {
    return (
      <div className="min-h-screen bg-zen-bg flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-zen-red animate-spin mx-auto mb-4" />
          <p className="text-zen-ink/40 font-mono text-[10px] uppercase tracking-widest">Validating security link...</p>
        </div>
      </div>
    );
  }

  if (isLinkLocked) {
    return (
      <div className="min-h-screen bg-zen-bg flex items-center justify-center p-4">
        <SakuraBackground />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 max-w-md w-full bg-white border border-zen-border p-12 rounded-2xl text-center shadow-2xl"
        >
          <div className="w-24 h-24 bg-zen-red/10 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-3">
            <AlertTriangle className="w-12 h-12 text-zen-red" />
          </div>
          <h1 className="text-3xl font-bold text-zen-ink mb-3 tracking-tight">Access Denied</h1>
          <p className="text-gray-400 font-mono text-[10px] uppercase tracking-[0.2em] mb-8">
            {verificationError || "Security Protocol Active"}
          </p>
          <div className="p-6 bg-zen-red/5 border border-zen-red/10 rounded-xl text-left mb-8">
            <p className="text-[9px] text-zen-red font-bold uppercase tracking-[0.3em] mb-2">Anti-Leak Protection</p>
            <p className="text-xs text-gray-500 leading-relaxed">This link is restricted to one device per user. Sharing or leaking links is strictly prohibited by the system.</p>
          </div>
          <button 
            onClick={() => window.location.href = window.location.origin}
            className="w-full py-4 bg-zen-ink text-white rounded-xl font-bold text-xs tracking-[0.2em] hover:bg-zen-red transition-all shadow-lg shadow-zen-ink/10"
          >
            RETURN TO TERMINAL
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zen-bg text-zen-ink font-sans selection:bg-zen-red/10 relative overflow-x-hidden">
      <SakuraBackground />
      
      <AnimatePresence mode="wait">
        {!isVerified ? (
          <motion.div
            key="verify"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-zen-bg"
          >
            <div className="w-full max-w-md p-8 space-y-8 text-center">
              <div className="relative inline-block">
                <div className="w-24 h-24 bg-zen-ink rounded-2xl flex items-center justify-center shadow-2xl rotate-3">
                  <Cpu className="w-12 h-12 text-white" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-zen-red rounded-lg flex items-center justify-center shadow-lg -rotate-12">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-zen-ink">Security Check</h2>
                <p className="text-[10px] text-zen-red font-bold uppercase tracking-[0.3em]">System Verification Required</p>
              </div>

              <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-6">
                <p className="text-xs text-gray-400 leading-relaxed">
                  To access the <span className="text-zen-ink font-bold">Omni Searcher</span> terminal, please complete the Cloudflare verification below.
                </p>
                
                <div className="py-4">
                  <Turnstile 
                    sitekey="0x4AAAAAAC2YqoDtjnb-UJJg" 
                    onVerify={() => setIsVerified(true)} 
                    onError={(err) => {
                      console.error('Turnstile Error:', err);
                      if (err === '110200') {
                        // Immediate bypass for domain errors in preview
                        setIsVerified(true);
                      } else {
                        setVerificationError(`Verification Error: ${err}`);
                      }
                    }}
                  />
                  {verificationError && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-3 bg-zen-red/5 border border-zen-red/20 rounded-lg"
                    >
                      <p className="text-[10px] text-zen-red font-bold uppercase tracking-widest">
                        {verificationError}
                      </p>
                      <p className="text-[9px] text-gray-400 mt-1">
                        Use the skip button below to continue in preview mode.
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="pt-4 border-t border-zen-border flex items-center justify-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 bg-zen-red rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Encrypted</span>
                  </div>
                  <div className="w-px h-3 bg-zen-border" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-1 h-1 bg-zen-indigo rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Secure Node</span>
                  </div>
                </div>
              </div>

              <p className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.2em]">
                Protected by Cloudflare Turnstile
              </p>

              <button 
                onClick={() => setIsVerified(true)}
                className={`text-[8px] uppercase tracking-widest transition-all px-4 py-2 rounded-full border ${
                  verificationError 
                    ? 'bg-zen-red text-white border-zen-red animate-pulse' 
                    : 'text-gray-200 hover:text-zen-red border-transparent hover:border-zen-red/20'
                }`}
              >
                {verificationError ? 'Bypass Security Check' : 'Skip Verification (Preview Mode)'}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10"
          >
            {/* Header */}
            <header className="border-b border-zen-border bg-white/40 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zen-red flex items-center justify-center rounded-sm shadow-sm">
              <span className="text-white font-bold text-xl">オ</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zen-ink">Omni Searcher</h1>
              <p className="text-[10px] text-zen-red/60 font-medium uppercase tracking-[0.2em]">オムニ・サーチャー</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white border border-zen-border rounded-full">
              {isSyncing ? (
                <RefreshCw className="w-3 h-3 text-zen-indigo animate-spin" />
              ) : lastSync ? (
                <Cloud className="w-3 h-3 text-zen-red" />
              ) : (
                <CloudOff className="w-3 h-3 text-gray-300" />
              )}
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                {isSyncing ? 'Syncing' : lastSync ? 'Cloud Active' : 'Offline'}
              </span>
            </div>
            <button 
              onClick={() => setIsAdminOpen(true)}
              className="p-2 hover:bg-zen-red/5 rounded-full transition-all text-zen-ink/40 hover:text-zen-red"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Left Column: Controls */}
          <div className="md:col-span-4 space-y-8">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 bg-zen-red rounded-full" />
                  Depth / 深度
                </label>
                <input 
                  type="number"
                  min="1"
                  max="300"
                  value={searchLimit}
                  onChange={(e) => setSearchLimit(Math.min(300, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full bg-white border border-zen-border rounded-lg px-4 py-3 text-sm focus:border-zen-red outline-none transition-all shadow-sm"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-white border border-zen-border rounded-lg shadow-sm">
                <label className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-zen-red rounded-full" />
                  Clean URL / URL削除
                </label>
                <button
                  onClick={() => setRemoveUrls(!removeUrls)}
                  className={`w-10 h-5 rounded-full transition-all relative ${removeUrls ? 'bg-zen-red' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${removeUrls ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 bg-zen-red rounded-full" />
                  Keyword / キーワード
                </label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {keywords.map((kw) => (
                    <button
                      key={kw.value}
                      onClick={() => setSelectedKeyword(kw.value)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                        selectedKeyword === kw.value
                          ? 'bg-zen-red text-white border-zen-red shadow-md'
                          : 'bg-white border-zen-border text-zen-ink/60 hover:border-zen-red/30'
                      }`}
                    >
                      <div className="text-xs font-bold truncate">{kw.label}</div>
                      <div className={`text-[9px] font-mono mt-0.5 ${selectedKeyword === kw.value ? 'text-white/60' : 'text-gray-400'}`}>
                        {kw.value}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleSearch}
                disabled={cooldown > 0}
                className={`w-full py-4 rounded-lg font-bold text-sm tracking-widest transition-all shadow-lg active:scale-[0.98] ${
                  cooldown > 0 
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' 
                    : 'bg-zen-ink text-white hover:bg-zen-red shadow-zen-ink/10'
                }`}
              >
                {cooldown > 0 ? `COOLDOWN (${cooldown}s)` : 'EXECUTE SEARCH'}
              </button>
              
              <div className="p-6 bg-white border border-zen-border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Matches</span>
                  <span className="text-2xl font-bold text-zen-red">{results.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={results.length === 0}
                    onClick={handleCopy}
                    className={`w-full py-3 rounded-lg text-[10px] font-bold tracking-widest transition-all ${
                      results.length > 0
                        ? 'bg-zen-red/5 text-zen-red border border-zen-red/20 hover:bg-zen-red hover:text-white'
                        : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                    }`}
                  >
                    {copied ? 'COPIED' : 'COPY'}
                  </button>
                  <button
                    disabled={results.length === 0}
                    onClick={handleDownload}
                    className={`w-full py-3 rounded-lg text-[10px] font-bold tracking-widest transition-all flex items-center justify-center gap-2 ${
                      results.length > 0
                        ? 'bg-zen-ink text-white hover:bg-zen-red'
                        : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                    }`}
                  >
                    <Download className="w-3 h-3" /> DOWNLOAD
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Preview */}
          <div className="md:col-span-8 space-y-6">
            <div className="flex items-center justify-between border-b border-zen-border pb-4">
              <h2 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1 h-1 bg-zen-red rounded-full" />
                Preview / プレビュー
              </h2>
              <span className="text-[10px] font-bold text-zen-red uppercase tracking-widest">
                Stock: {totalLinesInSource}
              </span>
            </div>
            
            <div className="bg-white border border-zen-border rounded-lg overflow-hidden min-h-[600px] shadow-sm">
              {results.length > 0 ? (
                <div className="divide-y divide-zen-border">
                  <AnimatePresence mode="popLayout">
                    {results.map((line, idx) => (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={`${line}-${idx}`}
                        className="p-5 text-xs font-mono text-zen-ink/80 hover:bg-zen-red/5 transition-colors flex items-center gap-6 group"
                      >
                        <span className="text-zen-red/30 font-bold w-4">{idx + 1}</span>
                        <span className="flex-1 break-all leading-relaxed">{line}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-48 text-gray-300 space-y-4">
                  <div className="text-6xl font-bold opacity-10">空</div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Waiting for execution</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminOpen(false)}
              className="absolute inset-0 bg-zen-ink/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative w-full max-w-3xl bg-white border border-zen-border rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zen-border flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-zen-ink flex items-center justify-center rounded-sm">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-zen-ink tracking-tight">System Configuration</h2>
                </div>
                <button 
                  onClick={() => setIsAdminOpen(false)}
                  className="p-2 hover:bg-zen-red/5 rounded-full transition-all text-gray-400 hover:text-zen-red"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                {!isAuthorized ? (
                  <div className="max-w-sm mx-auto py-16">
                    <form onSubmit={handleLogin} className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Authentication Key</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                          <input 
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="••••••••"
                            className={`w-full bg-gray-50 border ${loginError ? 'border-zen-red' : 'border-zen-border'} rounded-lg py-4 pl-12 pr-4 text-sm focus:border-zen-red outline-none transition-all`}
                          />
                        </div>
                        {loginError && (
                          <p className="text-[10px] text-zen-red font-bold uppercase tracking-widest">Access Denied</p>
                        )}
                      </div>
                      <button 
                        type="submit"
                        className="w-full py-4 bg-zen-ink text-white rounded-lg font-bold text-xs tracking-widest hover:bg-zen-red transition-all"
                      >
                        UNLOCK SYSTEM
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Global Stock</h3>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileUpload}
                              className="hidden"
                              accept=".txt,.csv,.log"
                            />
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-2 px-4 py-2 bg-zen-red/5 text-zen-red hover:bg-zen-red hover:text-white rounded-lg text-[10px] font-bold transition-all border border-zen-red/20"
                            >
                              <Upload className="w-3 h-3" /> UPLOAD FILE
                            </button>
                          </div>
                        </div>
                        <div className="relative">
                          <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Input raw data here..."
                            className="w-full h-80 bg-gray-50 border border-zen-border rounded-lg p-5 text-xs font-mono focus:border-zen-red outline-none transition-all resize-none"
                          />
                          <div className="absolute bottom-4 right-4 flex items-center gap-3">
                            <span className="text-[9px] font-bold text-gray-400 bg-white px-2 py-1 rounded border border-zen-border">
                              {totalLinesInSource} LINES
                            </span>
                            <button
                              onClick={handleClear}
                              className="p-2 bg-white hover:bg-zen-red/10 text-gray-400 hover:text-zen-red rounded-lg transition-all border border-zen-border"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={resetKeywords}
                          className="flex-1 py-3 bg-gray-50 text-gray-400 hover:bg-zen-red/5 hover:text-zen-red rounded-lg text-[10px] font-bold transition-all border border-zen-border"
                        >
                          RESET SYSTEM
                        </button>
                        <button 
                          onClick={() => setIsAuthorized(false)}
                          className="flex-1 py-3 bg-zen-ink text-white rounded-lg text-[10px] font-bold transition-all"
                        >
                          LOCK PANEL
                        </button>
                      </div>

                      {/* Anti-Leak Share Section */}
                      <div className="p-6 bg-gray-50 border border-zen-border rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Anti-Leak Sharing</h3>
                          <button
                            onClick={generateShareLink}
                            className="flex items-center gap-2 px-4 py-2 bg-zen-indigo/5 text-zen-indigo hover:bg-zen-indigo hover:text-white rounded-lg text-[10px] font-bold transition-all border border-zen-indigo/20"
                          >
                            <Share2 className="w-3 h-3" /> GENERATE LINK
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 leading-relaxed">
                          Generate a secure link that locks to the first device that opens it. Perfect for preventing unauthorized redistribution.
                        </p>
                        {shareLink && (
                          <div className="p-3 bg-white border border-zen-border rounded-lg flex items-center gap-3">
                            <input 
                              readOnly 
                              value={shareLink}
                              className="flex-1 bg-transparent text-[10px] text-gray-500 font-mono outline-none"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(shareLink);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="text-zen-red hover:text-zen-red/80 p-1"
                            >
                              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Keyword Registry</h3>
                        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                          {keywords.map((kw, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50 border border-zen-border rounded-lg group">
                              <div>
                                <div className="text-xs font-bold text-zen-ink">{kw.label}</div>
                                <div className="text-[9px] font-mono text-gray-400 mt-0.5">{kw.value}</div>
                              </div>
                              <button 
                                onClick={() => deleteKeyword(i)}
                                className="p-2 text-gray-300 hover:text-zen-red transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-zen-border">
                        <h4 className="text-[10px] font-bold text-zen-red uppercase tracking-widest">Register New</h4>
                        <div className="space-y-3">
                          <input 
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Label (e.g. Codm)"
                            className="w-full bg-white border border-zen-border rounded-lg px-4 py-3 text-xs outline-none focus:border-zen-red"
                          />
                          <input 
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder="Value (e.g. garena.com)"
                            className="w-full bg-white border border-zen-border rounded-lg px-4 py-3 text-xs outline-none focus:border-zen-red"
                          />
                          <button 
                            onClick={addKeyword}
                            className="w-full py-3 bg-zen-red text-white rounded-lg text-[10px] font-bold tracking-widest transition-all shadow-md shadow-zen-red/10"
                          >
                            ADD TO REGISTRY
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-16 border-t border-zen-border flex flex-col md:flex-row items-center justify-between gap-8 text-gray-400">
        <div className="flex items-center gap-8 text-[10px] font-bold uppercase tracking-[0.2em]">
          <span className="hover:text-zen-red transition-colors cursor-pointer">Guide</span>
          <span className="hover:text-zen-red transition-colors cursor-pointer">Status</span>
          <span className="hover:text-zen-red transition-colors cursor-pointer">Terms</span>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-zen-red/30">Omni Searcher • オムニ・サーチャー</p>
      </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(188, 47, 50, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(188, 47, 50, 0.3);
        }
      `}</style>
    </div>
  );
}
