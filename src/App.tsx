/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search,
  MessageSquare,
  Plus,
  Send, 
  BookOpen, 
  FileText, 
  Loader2,
  Info,
  Shield,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  UserX,
  ShieldAlert,
  Mic,
  MicOff,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LogIn,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { chatWithAssistant } from './services/geminiService';
import { generateWordDocument } from './lib/wordGenerator';
import { PdfViewer } from './components/PdfViewer';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from './constants/legal';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  db, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  handleFirestoreError,
  OperationType,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  limit
} from './lib/firebase';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

interface Chat {
  id: string;
  title: string;
  updatedAt: Date;
}

const TypewriterContent = ({ content, isLast }: { content: string, isLast: boolean }) => {
  const [displayedText, setDisplayedText] = useState(isLast ? "" : content);
  const [currentIndex, setCurrentIndex] = useState(isLast ? 0 : content.length);

  useEffect(() => {
    if (isLast && currentIndex < content.length) {
      const timeout = setTimeout(() => {
        // Natural typing: vary characters per step
        const chunkSize = Math.floor(Math.random() * 4) + 3;
        const nextIndex = Math.min(currentIndex + chunkSize, content.length);
        setDisplayedText(content.substring(0, nextIndex));
        setCurrentIndex(nextIndex);
      }, 20);
      return () => clearTimeout(timeout);
    } else if (!isLast) {
      setDisplayedText(content);
      setCurrentIndex(content.length);
    }
  }, [currentIndex, content, isLast]);

  return (
    <div className={`markdown-body prose prose-slate max-w-none dark:prose-invert`}>
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children).replace(/\n$/, '');
            
            if (match && match[1] === 'doc_content') {
              return (
                <div className="my-4 p-4 border border-blue-200 bg-blue-50 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-blue-800 font-semibold mb-1">
                    <FileText className="w-5 h-5" />
                    <span>Documento Oficio Generado</span>
                  </div>
                  <p className="text-xs text-blue-600 mb-2 italic">
                    Se ha generado un borrador formal de oficio basado en su solicitud.
                  </p>
                  <button
                    onClick={() => generateWordDocument(codeContent)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-hover transition-all text-sm font-medium shadow-sm"
                  >
                    <BookOpen className="w-4 h-4" />
                    Descargar Oficio (.docx)
                  </button>
                </div>
              );
            }
            
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {displayedText}
      </ReactMarkdown>
      {isLast && currentIndex < content.length && (
        <span className="inline-block w-2 h-4 ml-1 bg-brand-blue animate-pulse align-middle" />
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatsHistory, setChatsHistory] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [legalContent, setLegalContent] = useState<{ title: string, content: string } | null>(null);
  const [isProtocolExpanded, setIsProtocolExpanded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) return saved === 'true';
    } catch (e) {
      console.warn("LocalStorage access failed", e);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  const [selectedPdf, setSelectedPdf] = useState<{ url: string, title: string } | null>(null);

  // Dark Mode Toggle Effect
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem('darkMode', isDarkMode.toString());
    } catch (e) {
      console.warn("LocalStorage saving failed", e);
    }
  }, [isDarkMode]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const guiaUrl = import.meta.env.VITE_GUIA_OPERATIVA_URL;
  const prevencionUrl = import.meta.env.VITE_PROTOCOLO_PREVENCION_URL;
  const maltratoUrl = import.meta.env.VITE_PROTOCOLO_MALTRATO_URL;
  const violenciaUrl = import.meta.env.VITE_PROTOCOLO_VIOLENCIA_URL;

  // Auth Listener
  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Clean up previous listeners if any
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      setUser(currentUser);
      setIsAuthLoading(false);
      
      if (currentUser) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            await updateDoc(userRef, {
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }

        // Listen to user data
        unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
        }, (error) => {
          // Only log if not a logout transition
          if (auth.currentUser) {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          }
        });

      } else {
        setUserData(null);
        setMessages([]);
        setCurrentChatId(null);
      }
    });

    return () => {
      unsubscribe();
      if (unsubUser) unsubUser();
    };
  }, []);

  // Listen for messages in current chat
  useEffect(() => {
    if (!user || !currentChatId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, `users/${user.uid}/chats/${currentChatId}/messages`),
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          role: data.role,
          content: data.text,
          timestamp: data.timestamp?.toDate() || new Date()
        } as Message;
      });
      setMessages(msgs);
    }, (error) => {
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/chats/${currentChatId}/messages`);
      }
    });
    return () => unsubscribe();
  }, [user, currentChatId]);

  // Listen for all chats (history)
  useEffect(() => {
    if (!user) {
      setChatsHistory([]);
      return;
    }
    const q = query(
      collection(db, `users/${user.uid}/chats`),
      orderBy('updatedAt', 'desc'),
      limit(5)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data().title || 'Chat sin título',
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      }));
      setChatsHistory(chats);
    }, (error) => {
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/chats`);
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    // Force loading of voices for better reliability
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      // Chrome needs this event to properly populate voices
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const speak = (text: string, msgId: string) => {
    if (!('speechSynthesis' in window)) return;

    if (currentlySpeakingId === msgId) {
      window.speechSynthesis.cancel();
      setCurrentlySpeakingId(null);
      return;
    }

    // Cancel existing speech
    window.speechSynthesis.cancel();

    // Remove markdown symbols and clean text for cleaner speech
    const cleanText = text
      .replace(/[*_#`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/\|/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Find a friendly female voice, prioritizing Mexican Spanish (es-MX)
    const voices = window.speechSynthesis.getVoices();
    
    // Sort to prioritize premium/google voices and specifically Mexican Spanish
    const prioritizedVoices = [...voices].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aLang = a.lang.toLowerCase();
      const bLang = b.lang.toLowerCase();
      
      const aIsMX = aLang.includes('es-mx');
      const bIsMX = bLang.includes('es-mx');
      
      const aIsPremium = aName.includes('google') || aName.includes('natural') || aName.includes('enhanced');
      const bIsPremium = bName.includes('google') || bName.includes('natural') || bName.includes('enhanced');
      
      // Prioritize MX first, then Premium
      if (aIsMX && !bIsMX) return -1;
      if (!aIsMX && bIsMX) return 1;
      if (aIsPremium && !bIsPremium) return -1;
      if (!aIsPremium && bIsPremium) return 1;
      return 0;
    });

    // Strategy: Look for Spanish (Mexico) female voices specifically, avoiding male names
    const femaleVoice = prioritizedVoices.find(v => {
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();
      
      const isSpanish = lang.includes('es');
      const isMexican = lang.includes('mx') || name.includes('mexic');
      
      const maleNames = ['jorge', 'diego', 'enrique', 'luis', 'carlos', 'pablo', 'ricardo', 'daniel', 'marcos', 'alfonso', 'enrique', 'javier'];
      const isMale = maleNames.some(m => name.includes(m)) || name.includes(' male') || name.includes(' man');
      
      const femaleNames = ['google', 'monica', 'helena', 'female', 'paulina', 'lucia', 'marisol', 'hilda', 'daria', 'rosa', 'sabina', 'paola', 'mia', 'sofi', 'angelica'];
      const isFemale = femaleNames.some(f => name.includes(f)) || name.includes('woman') || name.includes('female');

      // Best match: Spanish + Mexican + Female (and definitely not Male)
      return isSpanish && isMexican && isFemale && !isMale;
    }) || prioritizedVoices.find(v => {
      // Second best: Any Mexican female
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();
      const maleNames = ['jorge', 'diego', 'enrique', 'luis', 'carlos', 'pablo', 'ricardo', 'daniel'];
      const isMale = maleNames.some(m => name.includes(m));
      return lang.includes('mx') && !isMale;
    }) || prioritizedVoices.find(v => {
      // Fallback: Any Spanish female (not es-ES if possible, but definitely female)
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();
      const isSpanish = lang.includes('es');
      const isSpainMale = lang.includes('es-es') && (name.includes('jorge') || name.includes('enrique'));
      return isSpanish && (name.includes('female') || name.includes('google') || name.includes('monica')) && !isSpainMale;
    }) || prioritizedVoices.find(v => v.lang.toLowerCase().includes('es-mx'))
       || prioritizedVoices.find(v => v.lang.toLowerCase().includes('es') && !v.lang.toLowerCase().includes('es-es'));

    if (femaleVoice) {
      utterance.voice = femaleVoice;
      utterance.lang = femaleVoice.lang;
    } else {
      utterance.lang = 'es-MX';
    }
    
    // Fine-tuning for a "Friendly Mexican Female" feel
    utterance.rate = 0.98; // Natural pace
    utterance.pitch = 1.15; // Clearly feminine and warm
    utterance.volume = 1.0;
    
    utterance.onstart = () => setCurrentlySpeakingId(msgId);
    utterance.onend = () => setCurrentlySpeakingId(null);
    utterance.onerror = () => setCurrentlySpeakingId(null);
    
    window.speechSynthesis.speak(utterance);
  };

  const [isListening, setIsListening] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      console.log('Speech Recognition is supported');
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'es-MX';

      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        console.log('Transcript:', transcript);
        setInput(transcript);
      };

      recognitionRef.current.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
        setRecordingTime(0);
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      };

      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      console.warn('Speech Recognition is not supported in this browser');
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Su navegador no soporta el reconocimiento de voz.");
      return;
    }

    try {
      if (isListening) {
        recognitionRef.current.stop();
      } else {
        recognitionRef.current.start();
      }
    } catch (error) {
      console.error('Error toggling listening:', error);
      setIsListening(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    let chatId = currentChatId;
    
    // Auto-create chat if none exists
    if (!chatId) {
      try {
        const chatsRef = collection(db, `users/${user.uid}/chats`);
        
        // LIMIT 5: Check existing chats
        const q = query(chatsRef, orderBy('updatedAt', 'asc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.size >= 5) {
          // Delete oldest chat(s)
          const docsToDelete = snapshot.docs.slice(0, snapshot.size - 4); // Keep 4, so including new one it's 5
          for (const d of docsToDelete) {
            await deleteDoc(doc(db, `users/${user.uid}/chats`, d.id));
            // Note: In production we'd also delete subcollections, 
            // but for simple Firestore rules it's okay for now or we could use a cloud function.
            // Client-side subcollection deletion requires knowing the IDs.
          }
        }

        const chatRef = await addDoc(chatsRef, {
          userId: user.uid,
          title: input.substring(0, 40) + '...',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        chatId = chatRef.id;
        setCurrentChatId(chatId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/chats`);
      }
    } else {
      try {
        const chatRef = doc(db, `users/${user.uid}/chats`, chatId);
        await updateDoc(chatRef, {
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/chats/${chatId}`);
      }
    }

    const messageData = {
      role: 'user',
      text: input,
      timestamp: serverTimestamp()
    };

    setInput('');
    setIsLoading(true);

    try {
      const messagesPath = `users/${user.uid}/chats/${chatId}/messages`;
      try {
        await addDoc(collection(db, messagesPath), messageData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, messagesPath);
      }

      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const response = await chatWithAssistant(history, input);
      
      try {
        await addDoc(collection(db, messagesPath), {
          role: 'model',
          text: response,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, messagesPath);
      }

    } catch (error) {
      console.error("Error in handleSend:", error);
      const messagesPath = `users/${user.uid}/chats/${chatId}/messages`;
      try {
        await addDoc(collection(db, messagesPath), {
          role: 'model',
          text: "Lo siento, hubo un error procesando su solicitud. Por favor intente de nuevo.",
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Critical error saving error message:", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = () => {
    setCurrentChatId(null);
    setInput('');
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 text-center my-8"
        >
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Send className="w-8 h-8 text-brand-blue" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Norma AI</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-10 leading-relaxed text-sm">
            Tu Asistente Normativo Inteligente
          </p>

          <div className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Bienvenido de nuevo
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Inicia sesión para continuar tus consultas
            </p>
          </div>
          
          <button 
            onClick={login}
            className="w-full flex items-center justify-center gap-4 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-brand-blue transition-all active:scale-95 group shadow-sm"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Continuar con Google
          </button>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
            <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em] whitespace-nowrap">
              Seguridad Norma AI
            </span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
          </div>

          <div className="mt-10 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-start gap-3 text-left">
            <Shield className="w-5 h-5 text-brand-blue shrink-0" />
            <div>
              <p className="text-xs font-bold text-brand-blue dark:text-blue-400 uppercase tracking-wider mb-1">Privacidad y Seguridad</p>
              <p className="text-[11px] text-blue-800 dark:text-blue-300 font-medium leading-relaxed">
                Tus datos están protegidos con encriptación de grado bancario. Nunca compartimos tu información personal sin tu consentimiento.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">
              AL CONTINUAR, ACEPTAS NUESTROS{' '}
              <button 
                onClick={() => setLegalContent({ title: 'Términos de Servicio', content: TERMS_OF_SERVICE })}
                className="text-brand-blue dark:text-blue-400 hover:underline font-bold"
              >
                TÉRMINOS DE SERVICIO
              </button>
              {' '}Y{' '}
              <button 
                onClick={() => setLegalContent({ title: 'Política de Privacidad', content: PRIVACY_POLICY })}
                className="text-brand-blue dark:text-blue-400 hover:underline font-bold"
              >
                POLÍTICAS DE PRIVACIDAD
              </button>.
            </p>
          </div>
        </motion.div>

        <AnimatePresence>
          {legalContent && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col border border-slate-100 dark:border-slate-800"
              >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tight">
                    {legalContent.title}
                  </h3>
                  <button 
                    onClick={() => setLegalContent(null)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 lg:p-10 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                  <div className="markdown-body prose prose-slate dark:prose-invert max-w-none">
                    <ReactMarkdown>{legalContent.content}</ReactMarkdown>
                  </div>
                </div>
                <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <button 
                    onClick={() => setLegalContent(null)}
                    className="px-8 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-hover transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                  >
                    Entendido
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-white dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 64,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={() => !isSidebarOpen && setIsSidebarOpen(true)}
        className={`hidden lg:flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-50 overflow-hidden relative shrink-0 transition-colors ${!isSidebarOpen ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors' : ''}`}
      >
        <div className={`flex flex-col h-full ${isSidebarOpen ? 'items-stretch' : 'items-center'}`}>
          {/* Header */}
          <div className={`p-4 flex items-center ${isSidebarOpen ? 'justify-between' : 'justify-center border-b border-slate-100 dark:border-slate-800 mb-4'}`}>
            {isSidebarOpen ? (
              <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
                <Send className="w-7 h-7 text-brand-blue shrink-0" />
                <span className="font-bold text-brand-blue dark:text-blue-400 text-sm">Norma AI</span>
              </div>
            ) : (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="hover:scale-105 transition-transform"
              >
                <Send className="w-7 h-7 text-brand-blue shrink-0" />
              </button>
            )}
            {isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Colapsar"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 w-full flex flex-col px-3 gap-6 overflow-hidden">
            {/* New Chat Icon/Button */}
            <div className="flex justify-center">
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  newChat(); 
                }}
                className={`flex items-center gap-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-full transition-all font-medium text-sm shadow-sm active:scale-95 overflow-hidden ${
                  isSidebarOpen ? 'px-4 w-full justify-start' : 'p-2.5 justify-center shrink-0 border-blue-100'
                }`}
                title="Nuevo Chat"
              >
                <Plus className="w-5 h-5 text-brand-blue shrink-0" />
                {isSidebarOpen && <span className="whitespace-nowrap">Nuevo Chat</span>}
              </button>
            </div>

            {/* Vertical Navigation Icons (Collapsed Mode) */}
            {!isSidebarOpen && (
              <div className="flex flex-col items-center gap-4 mt-2">
                <button 
                  onClick={() => setIsSidebarOpen(true)} 
                  className="p-3 text-slate-400 hover:text-brand-blue hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group"
                  title="Buscar"
                >
                  <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
                <button 
                  onClick={() => setIsSidebarOpen(true)} 
                  className="p-3 text-slate-400 hover:text-brand-blue hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group"
                  title="Historial"
                >
                  <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            )}

            {/* Full sidebar content */}
            {isSidebarOpen && (
              <div className="flex-1 flex flex-col gap-5 overflow-hidden">
                <div className="space-y-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">Accesos Rápidos</h3>
                  <button 
                    onClick={() => setSelectedPdf({ url: guiaUrl, title: 'Guía Operativa 2025-2026' })}
                    className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
                  >
                    <div className="w-6 h-6 rounded flex items-center justify-center text-lg shrink-0">📘</div>
                    <span className="truncate">Guía Operativa</span>
                  </button>
                  <div className="space-y-1">
                    <button 
                      onClick={() => setIsProtocolExpanded(!isProtocolExpanded)}
                      className="flex items-center justify-between w-full p-3 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-medium"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 flex items-center justify-center text-lg shrink-0">📙</div>
                        <span>Protocolos</span>
                      </div>
                      {isProtocolExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                    <AnimatePresence>
                      {isProtocolExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden flex flex-col gap-1 pl-9"
                        >
                          {[
                            { label: 'Prevención Escolar', url: prevencionUrl },
                            { label: 'Maltrato Escolar', url: maltratoUrl },
                            { label: 'Violencia Sexual', url: violenciaUrl }
                          ].map((sub) => (
                            <button
                              key={sub.label}
                              onClick={() => setSelectedPdf({ url: sub.url, title: `Protocolo: ${sub.label}` })}
                              className="block w-full text-left py-2 text-slate-500 dark:text-slate-400 hover:text-brand-blue text-[13px] transition-colors"
                            >
                              {sub.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  <div className="px-3 pb-2 mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">Recientes</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1 px-1 scrollbar-none">
                    {chatsHistory.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => setCurrentChatId(chat.id)}
                        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left transition-all ${
                          currentChatId === chat.id 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-brand-blue font-bold shadow-sm' 
                            : 'hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <span className="text-[13px] truncate leading-tight flex-1">{chat.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer / Profile */}
          <div className={`p-3 border-t border-slate-200 dark:border-slate-800 ${isSidebarOpen ? 'w-full px-4' : 'flex justify-center'}`}>
            <div className="relative w-full flex justify-center">
              <AnimatePresence>
                {isProfileOpen && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setIsProfileOpen(false); }} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className={`absolute bottom-full mb-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-2xl z-[70] p-1.5 min-w-[200px] ${isSidebarOpen ? 'left-0 right-0' : 'left-0'}`}
                    >
                      <button 
                        onClick={() => { 
                          setIsProfileOpen(false); 
                          setLegalContent({ title: 'Política de Privacidad', content: PRIVACY_POLICY }); 
                        }} 
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl transition-all font-medium group"
                      >
                        <Shield className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-400" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Política de privacidad</span>
                      </button>
                      <button onClick={() => { logout(); setIsProfileOpen(false); }} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all font-medium group">
                        <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Cerrar sesión</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setIsProfileOpen(!isProfileOpen); 
                }}
                className={`flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:ring-4 hover:ring-brand-blue/10 shrink-0 ${
                  isSidebarOpen 
                    ? 'w-full p-1 rounded-full justify-between' 
                    : 'p-0 rounded-full hover:scale-110 active:scale-95'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <img src={user.photoURL || ''} alt="" className="w-9 h-9 rounded-full border border-slate-100 dark:border-slate-700 object-cover" />
                  </div>
                  {isSidebarOpen && (
                    <div className="flex flex-col overflow-hidden text-left">
                      <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">{user.displayName}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-none font-medium">Personal Autorizado</span>
                    </div>
                  )}
                </div>
                {isSidebarOpen && <ChevronUp className={`w-4 h-4 text-slate-400 mr-2 transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />}
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed top-0 bottom-0 left-0 w-[280px] bg-slate-50 dark:bg-slate-900 z-50 border-r border-slate-200 dark:border-slate-800 flex flex-col p-4"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Send className="w-7 h-7 text-brand-blue shrink-0" />
                  <span className="font-bold text-brand-blue dark:text-blue-400 text-sm">Norma AI</span>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 rounded-lg"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <button 
                  onClick={() => { newChat(); setIsSidebarOpen(false); }}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-bold text-sm shadow-sm active:scale-95 transition-all"
                >
                  <Plus className="w-5 h-5 text-brand-blue" />
                  <span>Nuevo Chat</span>
                </button>

                <div className="space-y-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">Recursos</h3>
                  <button 
                    onClick={() => { setSelectedPdf({ url: guiaUrl, title: 'Guía Operativa 2025-2026' }); setIsSidebarOpen(false); }}
                    className="flex items-center gap-3 w-full p-4 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
                  >
                    📘 Guía Operativa
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 scrollbar-none">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">Recientes</h3>
                  {chatsHistory.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => { setCurrentChatId(chat.id); setIsSidebarOpen(false); }}
                      className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-left text-sm transition-all ${
                        currentChatId === chat.id ? 'bg-blue-50 dark:bg-blue-900/30 text-brand-blue font-bold border-l-2 border-brand-blue' : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="truncate">{chat.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
                <button 
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-3 w-full p-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-full shadow-sm"
                >
                  <img src={user.photoURL || ''} alt="" className="w-9 h-9 rounded-full border border-slate-100 dark:border-slate-700 object-cover" />
                  <div className="flex flex-col text-left overflow-hidden flex-1">
                    <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">{user.displayName}</span>
                    <span className="text-[10px] text-slate-500 truncate uppercase tracking-widest font-bold">Sesión Activa</span>
                  </div>
                  <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {isProfileOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <button 
                        onClick={() => { 
                          setIsProfileOpen(false); 
                          setLegalContent({ title: 'Política de Privacidad', content: PRIVACY_POLICY }); 
                        }} 
                        className="flex items-center gap-4 w-full p-4 mt-2 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all"
                      >
                        <Shield className="w-5 h-5 text-slate-400" />
                        <span>Política de privacidad</span>
                      </button>
                      <button 
                        onClick={logout}
                        className="flex items-center gap-4 w-full p-4 mt-2 text-rose-500 bg-rose-50/50 dark:bg-rose-900/10 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all"
                      >
                        <LogOut className="w-5 h-5" />
                        <span>Cerrar sesión</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative w-full h-full overflow-hidden bg-white dark:bg-slate-950">
        {/* Mobile Navbar with toggle */}
        <header className="lg:hidden h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-20 shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-brand-blue dark:text-blue-400 text-lg">Norma AI</span>
          <button 
            onClick={toggleDarkMode}
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all active:scale-95"
            title={isDarkMode ? "Modo claro" : "Modo oscuro"}
          >
            {isDarkMode ? <Sun className="w-6 h-6 text-amber-400" /> : <Moon className="w-6 h-6 text-slate-500" />}
          </button>
        </header>

        {/* Global Desktop Theme Toggle - Fixed Right */}
        <div className="hidden lg:flex fixed top-4 right-4 z-40">
          <button 
            onClick={toggleDarkMode}
            className="p-2 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all active:scale-95"
            title={isDarkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-500" />}
          </button>
        </div>

        {/* Messages Hub */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 space-y-8">
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full text-center max-w-xl mx-auto"
              >
              <div className="w-20 h-20 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl rounded-2xl flex items-center justify-center mb-8">
                <Send className="w-10 h-10 text-brand-blue" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-4">¿Cómo puedo apoyarle hoy?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed px-6">
                Consultas sobre protocolos de actuación, la Guía Operativa o medidas de protección escolar basadas en la normativa AEFCM.
              </p>
              
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {[
                  'Créame un oficio sobre un reporte de incidencias...', 
                  '¿Qué dice la normativa sobre el maltrato escolar?', 
                  'Ayúdame a redactar un acta de hechos para...', 
                  '¿Cuáles son los pasos para el protocolo de...'
                ].map((q) => (
                  <button 
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:border-brand-blue dark:hover:border-blue-400 hover:text-brand-blue dark:hover:text-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 text-left transition-all shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg`}
              >
                {msg.role === 'model' && (
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm">
                    <Send className="w-5 h-5 text-brand-blue" />
                  </div>
                )}
                
                <div className={`max-w-[90%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`p-5 rounded-2xl shadow-sm text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-brand-blue text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-tl-none'
                  }`}>
                    {msg.role === 'user' ? (
                      <div className="markdown-body prose prose-slate max-w-none prose-invert">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <TypewriterContent 
                        content={msg.content} 
                        isLast={idx === messages.length - 1} 
                      />
                    )}
                  </div>
                  
                  {msg.role === 'model' && (
                    <div className="flex justify-start pt-2 px-1">
                      <button 
                        onClick={() => speak(msg.content, msg.id)}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all border ${
                          currentlySpeakingId === msg.id
                            ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                            : 'text-slate-400 hover:text-brand-blue hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent hover:border-slate-100 dark:hover:border-slate-700'
                        }`}
                        title={currentlySpeakingId === msg.id ? "Pausar lectura" : "Escuchar mensaje"}
                      >
                        {currentlySpeakingId === msg.id ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start items-start gap-4"
            >
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-none p-5 shadow-sm flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-tight">Consultando la normativa...</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

        <section className="p-4 lg:px-8 lg:pb-6 lg:pt-2 bg-white dark:bg-slate-950 shrink-0">
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            <form 
              onSubmit={handleSend}
              className="relative flex items-center group"
            >
              <div className="relative flex-1 flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escriba su consulta aquí..."
                  className={`w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-full py-4 px-6 pr-28 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all shadow-sm dark:text-white ${
                    isListening ? 'opacity-0 select-none' : 'opacity-100'
                  }`}
                  disabled={isLoading || isListening}
                />

                <AnimatePresence>
                  {isListening && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="absolute inset-0 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-full py-4 px-6 pr-28 flex items-center justify-between pointer-events-none"
                    >
                      <div className="flex items-center gap-3">
                        <motion.div 
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                          className="w-2.5 h-2.5 bg-rose-500 rounded-full"
                        />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Grabando...</span>
                      </div>
                      <span className="text-sm font-mono font-bold text-rose-500">{formatTime(recordingTime)}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={toggleListening}
                  className={`absolute right-14 p-3 rounded-full transition-all z-20 flex-none ${
                    isListening 
                      ? 'bg-rose-500 text-white shadow-md scale-105' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-brand-blue dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={isListening ? "Detener grabación" : "Dictar consulta"}
                >
                  {isListening ? (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      <Mic className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                <button
                  id="btn-send-msg"
                  type="submit"
                  disabled={(!input.trim() && !isListening) || isLoading}
                  className={`absolute right-2 p-3 rounded-full transition-all z-20 ${
                    input.trim() && !isLoading && !isListening
                      ? 'bg-brand-blue text-white shadow-md hover:bg-brand-blue-hover' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                  }`}
                >
                  <Send className="w-5 h-5 flex-none" />
                </button>
              </div>
            </form>

            <div className="flex flex-col items-center text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
              <p>Nota: Este asistente apoya la consulta de la Guía Operativa y los Protocolos de Actuación AEFCM.</p>
              <p>Las decisiones corresponden siempre a las autoridades escolares competentes.</p>
            </div>

            <div className="flex items-center justify-center gap-6 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><Info className="w-3 h-3" /> Ámbito Educativo</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-green-500" /> Protocolo Validado</span>
            </div>
          </div>
        </section>
      </main>
      
      <AnimatePresence>
        {selectedPdf && (
          <PdfViewer 
            url={selectedPdf.url} 
            title={selectedPdf.title} 
            onClose={() => setSelectedPdf(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {legalContent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tight">
                  {legalContent.title}
                </h3>
                <button 
                  onClick={() => setLegalContent(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 lg:p-10 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <div className="markdown-body prose prose-slate dark:prose-invert max-w-none">
                  <ReactMarkdown>{legalContent.content}</ReactMarkdown>
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button 
                  onClick={() => setLegalContent(null)}
                  className="px-8 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-hover transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
