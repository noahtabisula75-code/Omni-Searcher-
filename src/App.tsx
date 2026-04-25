/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef, useCallback, ChangeEvent, FormEvent } from 'react';
import { Search, FileText, Filter, Copy, Check, Trash2, Gamepad2, Lock, Settings, X, Plus, Upload, Cloud, CloudOff, RefreshCw, Download, ShieldCheck, Cpu, Share2, AlertTriangle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { Turnstile } from './components/Turnstile';
import { getDeviceId } from './lib/fingerprint';
import { get as idbGet, set as idbSet } from 'idb-keyval';

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
  const [currentView, setCurrentView] = useState<'home' | 'searcher' | 'admin'>('home');
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [filename, setFilename] = useState('filename.txt');
  const [selectedKeyword, setSelectedKeyword] = useState(DEFAULT_KEYWORDS[0].value);
  const [copied, setCopied] = useState(false);
  const [searchLimit, setSearchLimit] = useState(300);
  const [results, setResults] = useState<string[]>([]);
  const [removeUrls, setRemoveUrls] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Admin State
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);
  
  // Admin Management State
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Anti-Leak State
  const [isLinkLocked, setIsLinkLocked] = useState(false);
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinksList, setShareLinksList] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string>('');

  const [showSqlHelper, setShowSqlHelper] = useState(false);

  // Global Error Handler
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global Error Caught:', event.error);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled Rejection Caught:', event.reason);
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Safe LocalStorage
  const safeStorage = {
    get: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn('LocalStorage access denied:', e);
        return null;
      }
    },
    set: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('LocalStorage write failed:', e);
      }
    }
  };

  // Handle Auth
  useEffect(() => {
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    } catch (e) {
      console.error('Auth initialization failed:', e);
    }
  }, []);

  // Handle Link Validation
  useEffect(() => {
    const validateLink = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const linkId = urlParams.get('sl');
        const currentDeviceId = await getDeviceId();
        setDeviceId(currentDeviceId);

        if (!linkId) {
          setIsCheckingLink(false);
          return;
        }

        const { data: linkData, error } = await supabase
          .from('share_links')
          .select('*')
          .eq('id', linkId)
          .single();

        if (error || !linkData) {
          console.error('Link Validation Error:', error);
          setVerificationError(error ? `Database Error: ${error.message}` : 'Invalid share link. This link does not exist in the database.');
          setIsLinkLocked(true);
        } else {
          if (linkData.is_used && linkData.device_id !== currentDeviceId) {
            setVerificationError('This link is already used by another device.');
            setIsLinkLocked(true);
          } else {
            if (!linkData.is_used) {
              // Claim the link
              await supabase
                .from('share_links')
                .update({ is_used: true, device_id: currentDeviceId })
                .eq('id', linkId);
              console.log('Link claimed by device:', currentDeviceId);
            }
            // Link is valid (either newly claimed or already owned by this device)
            setIsVerified(true);
            setCurrentView('searcher');
          }
        }
      } catch (error) {
        console.error('Initialization Error:', error);
        setVerificationError('A system error occurred during initialization.');
      } finally {
        setIsCheckingLink(false);
      }
    };

    validateLink();
  }, []);

  const fetchShareLinks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('share_links')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setShareLinksList(data || []);
    } catch (error) {
      console.error('Error fetching share links:', error);
    }
  }, []);

  const deleteShareLink = async (id: string) => {
    try {
      const { error } = await supabase
        .from('share_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setShareLinksList(prev => prev.filter(link => link.id !== id));
    } catch (error) {
      console.error('Error deleting share link:', error);
    }
  };

  const clearAllLinks = async () => {
    if (!window.confirm('Are you sure you want to delete ALL share links? This cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('share_links')
        .delete()
        .neq('id', ''); // Delete all
      if (error) throw error;
      setShareLinksList([]);
    } catch (error) {
      console.error('Error clearing links:', error);
    }
  };

  const generateShareLink = async () => {
    const linkId = Math.random().toString(36).substring(2, 15);
    try {
      const { error } = await supabase
        .from('share_links')
        .insert({
          id: linkId,
          created_by: user?.id || null,
          is_used: false
        });
      
      if (error) {
        console.error('Supabase Insert Error:', error);
        alert(`Failed to save link to database: ${error.message}. Make sure your 'share_links' table is created.`);
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set('sl', linkId);
      setShareLink(url.toString());
      fetchShareLinks(); // Refresh list
    } catch (error: any) {
      console.error('Link Generation Error:', error);
      alert(`System Error: ${error.message || 'Could not connect to database'}`);
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

        // Fetch Filename
        const { data: fnData } = await supabase
          .from('app_data')
          .select('value')
          .eq('key', 'filename')
          .single();
        
        if (fnData?.value?.name) {
          setFilename(fnData.value.name);
        }

        // Fetch Stock
        const { data: stockData } = await supabase
          .from('app_data')
          .select('value')
          .eq('key', 'stock')
          .single();
        
        if (stockData?.value?.content) {
          setInput(stockData.value.content);
          // Sync to local cache
          idbSet('ksp_stock', stockData.value.content);
        } else {
          // Try local cache if Supabase is empty
          const cachedStock = await idbGet<string>('ksp_stock');
          if (cachedStock) setInput(cachedStock);
        }
        setLastSync(new Date());
      } catch (e) {
        console.warn('Supabase fetch failed, falling back to local storage');
        // Combined Local Fallback
        const cachedStock = await idbGet<string>('ksp_stock');
        if (cachedStock) {
          setInput(cachedStock);
        } else {
          const savedStock = safeStorage.get('ksp_stock');
          if (savedStock) setInput(savedStock);
        }

        const savedKeywords = safeStorage.get('ksp_keywords');
        if (savedKeywords) {
          try {
            setKeywords(JSON.parse(savedKeywords));
          } catch (e) {
            console.error('Failed to parse keywords:', e);
          }
        }
      } finally {
        setIsSyncing(false);
      }
    };

    fetchData();
    fetchShareLinks();
  }, [fetchShareLinks]);

  // Cooldown Persistence & Timer
  useEffect(() => {
    const lastSearchTime = safeStorage.get('ksp_last_search');
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
      const { error } = await supabase
        .from('app_data')
        .upsert({ key, value }, { onConflict: 'key' });
      
      if (error) throw error;
      
      setLastSync(new Date());
    } catch (e: any) {
      console.error('Cloud save failed:', e);
      // If it's a 404 or table not found, we might want to alert the user
      if (e.code === '42P01') {
        console.warn('Table app_data does not exist. Please run the SQL setup in Admin Panel.');
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Auto-save filename
  useEffect(() => {
    safeStorage.set('ksp_filename', filename);
    const timer = setTimeout(() => {
      saveToCloud('filename', { name: filename });
    }, 2000);
    return () => clearTimeout(timer);
  }, [filename, saveToCloud]);

  // Auto-save stock
  useEffect(() => {
    // Always save to IndexedDB as it handles large data size (up to GBs)
    idbSet('ksp_stock', input).catch(e => {
      console.warn('IndexedDB stock save failed:', e);
    });

    try {
      // Small datasets also go to localStorage for ultra-fast fallback
      if (input.length < 2 * 1024 * 1024) {
        localStorage.setItem('ksp_stock', input);
      }
    } catch (e) {
      // Ignore quota errors here as idbSet is the primary backup
    }
    
    const timer = setTimeout(() => {
      saveToCloud('stock', { content: input });
    }, 3000);
    return () => clearTimeout(timer);
  }, [input, saveToCloud]);

  const totalLinesInSource = useMemo(() => {
    if (!input) return 0;
    // For large inputs, use a faster line counting method to avoid UI freezes
    if (input.length > 1024 * 1024) {
      let count = 0;
      for (let i = 0; i < input.length; i++) {
        if (input[i] === '\n') count++;
      }
      return count + (input[input.length - 1] === '\n' ? 0 : 1);
    }
    return input.split('\n').filter(line => line.trim() !== '').length;
  }, [input]);

  const handleSearch = () => {
    if (!input) return;

    // Find the split point for searchLimit without splitting the whole string
    let splitIndex = -1;
    let newlineCount = 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '\n') {
        newlineCount++;
        if (newlineCount === searchLimit) {
          splitIndex = i;
          break;
        }
      }
    }

    const searchAreaStr = splitIndex === -1 ? input : input.substring(0, splitIndex);
    const remainingAreaStr = splitIndex === -1 ? '' : input.substring(splitIndex + 1);

    const searchArea = searchAreaStr.split('\n').filter(line => line.trim() !== '');
    
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
    // Optimization: Join only the search area part and append the rest as a string
    const unmatchedStr = unmatchedInSearchArea.join('\n');
    const newStock = unmatchedStr + (unmatchedStr && remainingAreaStr ? '\n' : '') + remainingAreaStr;
    setInput(newStock);

    // Set Cooldown
    setCooldown(30);
    safeStorage.set('ksp_last_search', Date.now().toString());
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopy = () => {
    if (results.length === 0) return;
    copyToClipboard(results.join('\n'));
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const element = document.createElement("a");
    const file = new Blob([results.join('\n')], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename || `omni_search_${selectedKeyword}_${new Date().getTime()}.txt`;
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
      // Immediate local backup
      idbSet('ksp_stock', content);
      // Trigger immediate save for large uploads
      saveToCloud('stock', { content });
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

  const handleTurnstileVerify = useCallback(() => {
    setIsVerified(true);
  }, []);

  const handleTurnstileError = useCallback((err: any) => {
    console.error('Turnstile Error:', err);
    if (err === '110200') {
      // Immediate bypass for domain errors in preview
      setIsVerified(true);
    } else {
      setVerificationError(`Verification Error: ${err}`);
    }
  }, []);

  const HomeView = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto px-6 py-20 space-y-16"
    >
      <div className="text-center space-y-6">
        <motion.div 
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="inline-block p-4 bg-zen-red/10 rounded-3xl mb-4"
        >
          <Cpu className="w-16 h-16 text-zen-red" />
        </motion.div>
        <h1 className="text-5xl font-bold tracking-tight text-zen-ink">Omni Searcher</h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
          The ultimate terminal for high-speed data extraction and keyword filtering. 
          Engineered for precision, secured for privacy.
        </p>
        <div className="flex justify-center pt-4">
          <a 
            href="https://t.me/ItsMeJeff"
            target="_blank"
            rel="noopener noreferrer"
            className="px-10 py-5 bg-zen-ink text-white rounded-full font-bold text-xs tracking-[0.3em] hover:bg-zen-red transition-all shadow-2xl shadow-zen-ink/20 flex items-center gap-4 group"
          >
            GET STARTED
            <Search className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-4 hover:border-zen-red/30 transition-all group">
          <div className="w-12 h-12 bg-zen-red/5 rounded-xl flex items-center justify-center group-hover:bg-zen-red group-hover:text-white transition-all">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Auto URL Removal</h3>
          <p className="text-sm text-gray-400">Automatically strips URLs from results to make it easier to loot accounts and manage your data better.</p>
        </div>
        <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-4 hover:border-zen-red/30 transition-all group">
          <div className="w-12 h-12 bg-zen-red/5 rounded-xl flex items-center justify-center group-hover:bg-zen-red group-hover:text-white transition-all">
            <RefreshCw className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Real-time Sync</h3>
          <p className="text-sm text-gray-400">Cloud-powered stock management with instant updates across all your sessions.</p>
        </div>
        <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-4 hover:border-zen-red/30 transition-all group">
          <div className="w-12 h-12 bg-zen-red/5 rounded-xl flex items-center justify-center group-hover:bg-zen-red group-hover:text-white transition-all">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Anti-Leak Tech</h3>
          <p className="text-sm text-gray-400">Secure single-device links ensure your data stays where it belongs.</p>
        </div>
        <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-4 hover:border-zen-red/30 transition-all group">
          <div className="w-12 h-12 bg-zen-red/5 rounded-xl flex items-center justify-center group-hover:bg-zen-red group-hover:text-white transition-all">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Fast Processing</h3>
          <p className="text-sm text-gray-400">Optimized search algorithms capable of handling thousands of lines in milliseconds.</p>
        </div>
        <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-4 hover:border-zen-red/30 transition-all group">
          <div className="w-12 h-12 bg-zen-red/5 rounded-xl flex items-center justify-center group-hover:bg-zen-red group-hover:text-white transition-all">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Keyword Registry</h3>
          <p className="text-sm text-gray-400">Save and manage your most used keywords for quick access during extraction.</p>
        </div>
        <div className="p-8 bg-white border border-zen-border rounded-2xl shadow-sm space-y-4 hover:border-zen-red/30 transition-all group">
          <div className="w-12 h-12 bg-zen-red/5 rounded-xl flex items-center justify-center group-hover:bg-zen-red group-hover:text-white transition-all">
            <Download className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold">Export Ready</h3>
          <p className="text-sm text-gray-400">One-click copy or download your results in clean text format instantly.</p>
        </div>
      </div>

      <div id="pricing" className="bg-zen-ink text-white rounded-3xl p-12 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-zen-red/20 rounded-full blur-[100px] -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-block px-3 py-1 bg-zen-red text-[10px] font-bold uppercase tracking-widest rounded-full">
              Limited Offer
            </div>
            <h2 className="text-4xl font-bold">Premium Access</h2>
            <p className="text-gray-400 max-w-md">Unlock the full potential of Omni Searcher with lifetime cloud storage and unlimited keywords.</p>
          </div>
          <div className="text-center md:text-right space-y-4">
            <div className="text-5xl font-bold text-zen-red">100₱</div>
            <div className="text-sm font-bold uppercase tracking-widest text-gray-400">Lifetime Access</div>
            <a 
              href="https://t.me/ItsMeJeff"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full md:w-auto px-8 py-4 bg-white text-zen-ink rounded-xl font-bold text-sm tracking-widest hover:bg-zen-red hover:text-white transition-all text-center"
            >
              GET STARTED NOW
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );

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

      {/* Global Header */}
      <header className="border-b border-zen-border bg-white/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCurrentView('home')}>
            <div className="w-12 h-12 bg-zen-red flex items-center justify-center rounded-sm shadow-sm">
              <span className="text-white font-bold text-xl">オ</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zen-ink">Omni Searcher</h1>
              <p className="text-[10px] text-zen-red/60 font-medium uppercase tracking-[0.2em]">オムニ・サーチャー</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => setCurrentView('home')}
              className={`text-[10px] font-bold uppercase tracking-widest transition-all ${currentView === 'home' ? 'text-zen-red' : 'text-zen-ink/40 hover:text-zen-ink'}`}
            >
              Home
            </button>
            <button 
              onClick={() => {
                setCurrentView('home');
                setTimeout(() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
              className="text-[10px] font-bold uppercase tracking-widest text-zen-ink/40 hover:text-zen-red transition-all"
            >
              Pricing
            </button>
            <button 
              onClick={() => setCurrentView('admin')}
              className={`text-[10px] font-bold uppercase tracking-widest transition-all ${currentView === 'admin' ? 'text-zen-red' : 'text-zen-ink/40 hover:text-zen-red'}`}
            >
              Owner Panel
            </button>
          </nav>

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
              onClick={() => setCurrentView('admin')}
              className="md:hidden p-2 hover:bg-zen-red/5 rounded-full transition-all text-zen-ink/40 hover:text-zen-red"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      
      <AnimatePresence mode="wait">
        {currentView === 'home' ? (
          <HomeView key="home" />
        ) : currentView === 'admin' ? (
          <motion.div
            key="admin"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto px-6 py-12 space-y-12 relative z-10"
          >
            <div className="bg-white border border-zen-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-zen-border flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-zen-ink flex items-center justify-center rounded-sm">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-zen-ink tracking-tight">System Configuration</h2>
                </div>
              </div>

              <div className="p-8">
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
                      {/* Stats Overview */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-white border border-zen-border rounded-xl shadow-sm">
                          <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Stock</div>
                          <div className="text-xl font-bold text-zen-ink">{totalLinesInSource.toLocaleString()}</div>
                        </div>
                        <div className="p-4 bg-white border border-zen-border rounded-xl shadow-sm">
                          <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Active Links</div>
                          <div className="text-xl font-bold text-zen-indigo">{shareLinksList.filter(l => !l.is_used).length}</div>
                        </div>
                        <div className="p-4 bg-white border border-zen-border rounded-xl shadow-sm">
                          <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Used Links</div>
                          <div className="text-xl font-bold text-zen-red">{shareLinksList.filter(l => l.is_used).length}</div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Global Stock</h3>
                            {isSyncing && (
                              <div className="flex items-center gap-1.5">
                                <RefreshCw className="w-2.5 h-2.5 text-zen-indigo animate-spin" />
                                <span className="text-[8px] font-bold text-zen-indigo uppercase tracking-widest">Syncing...</span>
                              </div>
                            )}
                            {!isSyncing && lastSync && (
                              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Saved {lastSync.toLocaleTimeString()}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveToCloud('stock', { content: input })}
                              className="flex items-center gap-2 px-4 py-2 bg-zen-ink text-white hover:bg-zen-red rounded-lg text-[10px] font-bold transition-all shadow-sm"
                            >
                              <Save className="w-3 h-3" /> SAVE TO CLOUD
                            </button>
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
                              <Upload className="w-3 h-3" /> UPLOAD
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
                          onClick={() => setIsAuthorized(false)}
                          className="w-full py-3 bg-zen-ink text-white rounded-lg text-[10px] font-bold transition-all"
                        >
                          LOCK PANEL
                        </button>
                      </div>

                      {/* Anti-Leak Share Section */}
                      <div className="p-6 bg-gray-50 border border-zen-border rounded-lg space-y-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Anti-Leak Sharing</h3>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setShowSqlHelper(!showSqlHelper)}
                                className="text-[8px] font-bold text-zen-indigo hover:underline uppercase tracking-widest"
                              >
                                DB Setup
                              </button>
                              <button
                                onClick={generateShareLink}
                                className="flex items-center gap-2 px-4 py-2 bg-zen-indigo/5 text-zen-indigo hover:bg-zen-indigo hover:text-white rounded-lg text-[10px] font-bold transition-all border border-zen-indigo/20"
                              >
                                <Share2 className="w-3 h-3" /> GENERATE LINK
                              </button>
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-400 leading-relaxed">
                            Generate a secure link that locks to the first device that opens it. Perfect for preventing unauthorized redistribution.
                          </p>

                          {showSqlHelper && (
                            <div className="p-4 bg-zen-ink text-white rounded-lg space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-zen-red">SQL Schema Required</span>
                                <button onClick={() => setShowSqlHelper(false)} className="text-white/40 hover:text-white"><X className="w-3 h-3" /></button>
                              </div>
                              <p className="text-[8px] text-gray-400">Run this in your Supabase SQL Editor to enable links and cloud saving:</p>
                              <pre className="text-[8px] font-mono bg-black/30 p-3 rounded overflow-x-auto custom-scrollbar">
{`-- Table for shareable links
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  is_used BOOLEAN DEFAULT FALSE,
  device_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for application settings and stock
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Policies for share_links
CREATE POLICY "Allow public read links" ON share_links FOR SELECT USING (true);
CREATE POLICY "Allow public insert links" ON share_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update links" ON share_links FOR UPDATE USING (true);

-- Policies for app_data
CREATE POLICY "Allow public read data" ON app_data FOR SELECT USING (true);
CREATE POLICY "Allow public insert data" ON app_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update data" ON app_data FOR UPDATE USING (true);`}
                              </pre>
                            </div>
                          )}
                          {shareLink && (
                            <div className="p-3 bg-white border border-zen-border rounded-lg flex items-center gap-3">
                              <input 
                                readOnly 
                                value={shareLink}
                                className="flex-1 bg-transparent text-[10px] text-gray-500 font-mono outline-none"
                              />
                              <button
                                onClick={() => copyToClipboard(shareLink)}
                                className="text-zen-red hover:text-zen-red/80 p-1"
                              >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Link Logs */}
                        <div className="space-y-4 pt-4 border-t border-zen-border">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest">Link Logs</h3>
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-bold text-gray-400">{shareLinksList.length} TOTAL</span>
                              <button 
                                onClick={clearAllLinks}
                                className="text-[8px] font-bold text-zen-red hover:underline uppercase tracking-widest"
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {shareLinksList.length > 0 ? (
                              shareLinksList.map((link) => (
                                <div key={link.id} className="p-3 bg-white border border-zen-border rounded-lg flex items-center justify-between group">
                                  <div className="space-y-1 overflow-hidden">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-zen-ink truncate max-w-[120px]">{link.id}</span>
                                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${link.is_used ? 'bg-zen-red/10 text-zen-red' : 'bg-green-50 text-green-600'}`}>
                                        {link.is_used ? 'USED' : 'UNUSED'}
                                      </span>
                                    </div>
                                    <div className="text-[8px] text-gray-400 flex items-center gap-2">
                                      <span>{new Date(link.created_at).toLocaleDateString()}</span>
                                      {link.device_id && (
                                        <span className="truncate max-w-[100px]">ID: {link.device_id}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => {
                                        const url = new URL(window.location.href);
                                        url.searchParams.set('sl', link.id);
                                        copyToClipboard(url.toString());
                                      }}
                                      className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-zen-ink"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteShareLink(link.id)}
                                      className="p-1.5 hover:bg-zen-red/10 rounded text-gray-400 hover:text-zen-red"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="py-8 text-center border border-dashed border-zen-border rounded-lg">
                                <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">No links generated</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-zen-border">
                        <h3 className="text-[10px] font-bold text-zen-ink/40 uppercase tracking-widest flex items-center gap-2">
                          <FileText className="w-3 h-3" />
                          Filename Configuration
                        </h3>
                        <div className="space-y-3">
                          <p className="text-[9px] text-gray-400 leading-relaxed">
                            Set the default name for your downloaded search results. This is automatically saved to the cloud.
                          </p>
                          <div className="relative">
                            <input 
                              value={filename}
                              onChange={(e) => setFilename(e.target.value)}
                              placeholder="filename.txt"
                              className="w-full bg-white border border-zen-border rounded-lg px-4 py-3 text-xs outline-none focus:border-zen-red font-mono"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Save className="w-3 h-3 text-zen-red/40" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-zen-border rounded-lg">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Auto-sync Active</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : currentView === 'searcher' && !isVerified ? (
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
                    onVerify={handleTurnstileVerify} 
                    onError={handleTurnstileError}
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

              {/* Buttons removed per user request: "Removed The Buttons Below Make Please By Link" */}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-16 border-t border-zen-border flex flex-col md:flex-row items-center justify-between gap-8 text-gray-400">
        <div className="flex items-center gap-8 text-[10px] font-bold uppercase tracking-[0.2em]">
          <span onClick={() => setCurrentView('home')} className="hover:text-zen-red transition-colors cursor-pointer">Home</span>
          <span onClick={() => setCurrentView('admin')} className="hover:text-zen-red transition-colors cursor-pointer">Owner Panel</span>
          <span 
            onClick={() => {
              setCurrentView('home');
              setTimeout(() => {
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }} 
            className="hover:text-zen-red transition-colors cursor-pointer"
          >
            Pricing
          </span>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-zen-red/30">Omni Searcher • オムニ・サーチャー</p>
      </footer>

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
