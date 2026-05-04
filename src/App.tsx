import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Mic, FileQuestion, MessageSquare, 
  Zap, BookMarked, HelpCircle, FileText, CheckCircle, Loader2, Play
} from 'lucide-react';
import { cn } from './lib/utils';
import { generateContentStream, generateSpeech } from './services/geminiService';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

const ACTIONS = [
  { id: 'podcast', title: 'Master Podcast', subtitle: 'Audio overview of all sources', icon: Mic, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { id: 'flashcards', title: 'Subject Flashcards', subtitle: 'Auto-generated for each subject', icon: BookMarked, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'study_guide', title: 'Study Guide', subtitle: 'Comprehensive high-yield notes', icon: BookOpen, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'quiz', title: 'Practice Quiz', subtitle: '50 questions from past papers', icon: FileQuestion, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { id: 'daily_revision', title: 'Daily Revision', subtitle: 'Specific topics for the day', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'qa', title: 'Interactive Q&A', subtitle: 'Chat with your notebook', icon: MessageSquare, color: 'text-purple-500', bg: 'bg-purple-500/10' },
] as const;

const FIXED_ACTIONS = ACTIONS;

const PROMPTS = {
  podcast: "Create a rich, conversational podcast script (like two hosts discussing) summarizing the following study materials and notes. Make it engaging, highlight the most important formulas, and speak directly to a student preparing for the E-CET exam.",
  flashcards: "Extract the most crucial formulas, concepts, and definitions from the text below and generate them as flashcards. Format as Q: [Question/Concept] and A: [Answer/Formula].",
  study_guide: "Create a structured, comprehensive study guide organized by subject/topic covering all high-frequency topics mentioned in the text. Use clear headings and bullet points.",
  quiz: "Create a practice quiz with 10 questions (with varying difficulty) based on the most repeated topics in the text. Provide the correct answers with explanations at the very end.",
  daily_revision: "Create a quick 10-minute revision summary covering the main points in the provided text. Make it crisp and focused on helping the student recall information quickly.",
  qa: "You are an expert tutor helping a student prepare for the E-CET exam based on their notes. Answer their question clearly and provide examples if helpful. Use their context below: \n\n"
};

export default function App() {
  const [context, setContext] = useState("");
  const [activeTab, setActiveTab] = useState<'home' | 'generate' | 'qa' | 'saved'>('home');
  
  const [counts, setCounts] = useState<{a: number, b: number, c: number, d: number}>(() => {
    try {
      const saved = localStorage.getItem('tapCounts');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { a: 0, b: 0, c: 0, d: 0 };
  });

  useEffect(() => {
    localStorage.setItem('tapCounts', JSON.stringify(counts));
  }, [counts]);

  const handleTap = (btn: 'a' | 'b' | 'c' | 'd') => {
    setCounts(prev => {
      if (prev[btn] < 50) {
        return { ...prev, [btn]: prev[btn] + 1 };
      }
      return prev;
    });
  };

  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Q&A State
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [inputMsg, setInputMsg] = useState("");

  const handleAction = async (actionId: string, customPromptSuffix?: string) => {
    if (!context.trim()) {
      alert("Please add some study materials or notes in the text area first!");
      return;
    }
    
    setActiveTask(actionId);
    setResult('');
    setIsGenerating(true);
    setShowModal(true);
    setAudioUrl(null);
    
    try {
      const actionDef = FIXED_ACTIONS.find(a => a.id === actionId);
      const basePrompt = PROMPTS[actionId as keyof typeof PROMPTS];
      const finalPrompt = customPromptSuffix ? `${basePrompt} ${customPromptSuffix}` : basePrompt;
      
      const systemInstruction = "You are an intelligent E-CET tutor and NotebookLM assistant. Format your responses in clean Markdown.";
      const prompt = `${finalPrompt}\n\n=== SOURCE CONTEXT ===\n${context}`;
      
      let generatedText = "";
      await generateContentStream(
        systemInstruction, 
        prompt, 
        (chunk) => {
          generatedText += chunk;
          setResult(prev => prev + chunk);
        }
      );

      if (actionId === 'podcast' || actionId === 'daily_revision') {
        const audioBase64 = await generateSpeech(generatedText.substring(0, 800) + "... [Audio preview truncated]"); // Don't TTS everything if it's too long, voice APIs have limits
        if (audioBase64) {
          const binary = atob(audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'audio/wav' });
          setAudioUrl(URL.createObjectURL(blob));
        }
      }
    } catch (err) {
      console.error(err);
      setResult("❌ An error occurred during generation. Make sure your API key is valid.");
    } finally {
      setIsGenerating(false);
    }
  };

  const playAudio = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      setIsPlayingAudio(true);
      audio.play();
      audio.onended = () => setIsPlayingAudio(false);
    }
  };

  const handleQASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const userMsg = inputMsg;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInputMsg("");
    
    const contextPrompt = context ? `\n\n=== STUDENT's NOTES ===\n${context}` : '';
    const prompt = `Student Question: ${userMsg}${contextPrompt}`;

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let generatedText = "";
    try {
      await generateContentStream(
        "You are a helpful E-CET tutor. Keep answers concise, clear, and encouraging. Use Markdown.",
        prompt,
        (chunk) => {
          generatedText += chunk;
          setMessages(prev => {
            const newArr = [...prev];
            newArr[newArr.length - 1].content = generatedText;
            return newArr;
          });
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col font-sans overflow-x-hidden">
      <header className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-900 sticky top-0 z-10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white leading-tight">E-CET Automation</h1>
            <p className="text-xs text-slate-400">Connected to NotebookLM API</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <nav className="flex space-x-1">
            <button 
              onClick={() => setActiveTab('home')}
              className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer", activeTab === 'home' ? "bg-slate-800 text-white shadow outline outline-1 outline-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50")}
            >
              Home
            </button>
            <button 
              onClick={() => setActiveTab('generate')}
              className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer", activeTab === 'generate' ? "bg-slate-800 text-white shadow outline outline-1 outline-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50")}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('qa')}
              className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer", activeTab === 'qa' ? "bg-slate-800 text-white shadow outline outline-1 outline-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50")}
            >
              Interactive Q&A
            </button>
          </nav>
          <div className="hidden sm:flex bg-[#312E81] text-[#818CF8] text-[11px] px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
            System Ready
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {activeTab === 'home' && (
          <div className="col-span-1 lg:col-span-12 flex flex-col items-center justify-center py-12">
            <div className="bg-slate-800 p-10 rounded-2xl border border-slate-700 max-w-3xl w-full text-center shadow-xl">
              <h2 className="text-3xl font-bold text-white mb-8">Tap Counters</h2>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-10">
                {['a', 'b', 'c', 'd'].map((btn) => (
                  <button
                    key={btn}
                    onClick={() => handleTap(btn as 'a'|'b'|'c'|'d')}
                    disabled={counts[btn as 'a'|'b'|'c'|'d'] >= 50}
                    className={cn(
                      "aspect-square rounded-2xl flex items-center justify-center text-4xl font-bold transition-all shadow-lg",
                      counts[btn as 'a'|'b'|'c'|'d'] >= 50 
                        ? "bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600" 
                        : "bg-indigo-500 hover:bg-indigo-400 hover:-translate-y-1 hover:shadow-indigo-500/25 text-white active:scale-95 cursor-pointer"
                    )}
                  >
                    {btn.toUpperCase()}
                  </button>
                ))}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-10">
                {['a', 'b', 'c', 'd'].map((btn) => (
                  <div key={`${btn}-count`} className="text-slate-300 flex flex-col items-center bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                     <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-2">Button {btn}</span>
                     <span className="text-2xl font-mono">
                       <span className={counts[btn as 'a'|'b'|'c'|'d'] === 50 ? "text-emerald-400" : "text-white"}>{counts[btn as 'a'|'b'|'c'|'d']}</span>
                       <span className="text-slate-500"> / 50</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-8 border-t border-slate-700 flex flex-col items-center">
                <span className="text-sm text-slate-400 mb-2 uppercase tracking-wide font-semibold">Total Taps Across All Buttons</span>
                <div className="text-5xl font-mono font-bold text-indigo-400 mb-6">
                  {Object.values(counts).reduce((a, b) => a + (b as number), 0)} <span className="text-slate-600 text-2xl">/ 200</span>
                </div>
                
                <button 
                  onClick={() => {
                    if(confirm('Are you sure you want to reset all counts?')) {
                      setCounts({a: 0, b: 0, c: 0, d: 0});
                    }
                  }}
                  className="text-sm text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 px-4 py-2 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-400/20"
                >
                  Reset All Counters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LEFT PANEL - Note Input */}
        <div className={cn("lg:col-span-4 flex-col gap-4", activeTab === 'home' ? 'hidden' : 'flex')}>
          <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden flex flex-col h-[600px] transition-all">
            <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              <h2 className="font-medium text-slate-200">Your Notebook Context</h2>
            </div>
            <div className="p-4 flex-1">
              <textarea 
                className="w-full h-full resize-none bg-transparent border-0 focus:ring-0 text-sm text-slate-50 placeholder-slate-500 outline-none"
                placeholder="Paste your syllabus, past paper questions, cheat codes, or study notes here... We'll use this content to generate your personalized study materials."
                value={context}
                onChange={e => setContext(e.target.value)}
              />
            </div>
            <div className="p-3 bg-slate-900/50 border-t border-slate-700 text-xs text-slate-400 flex justify-between items-center">
              <span>{context.length} characters</span>
              {context.length > 0 && <span className="text-emerald-400 flex items-center gap-1 font-medium"><CheckCircle className="w-3 h-3"/> Ready</span>}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Actions or Q&A */}
        <div className={cn("lg:col-span-8", activeTab === 'home' ? 'hidden' : 'block')}>
          {activeTab === 'generate' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {FIXED_ACTIONS.map(action => {
                if (action.id === 'qa') return null;
                const Icon = action.icon;
                return (
                  <div
                    key={action.id}
                    className="flex flex-col gap-4 p-6 bg-slate-800 rounded-2xl border border-slate-700 hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all text-left relative group select-none"
                  >
                    <div>
                      <h3 className="font-semibold text-lg text-white mb-2 flex items-center gap-2">
                        <Icon className="w-5 h-5 text-indigo-400" />
                        {action.title}
                      </h3>
                      <p className="text-[13px] text-slate-400 leading-relaxed mb-4">{action.subtitle}</p>
                    </div>
                    <div className="mt-auto flex gap-3">
                      <button 
                        onClick={() => handleAction(action.id)}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'qa' && (
            <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 h-[600px] flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
                <h2 className="font-medium text-slate-200">Interactive Q&A Session</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-900/30">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                    <HelpCircle className="w-12 h-12 text-slate-600" />
                    <p>Ask a question about your E-CET notes!</p>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "")}>
                       <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm shadow-sm", m.role === 'user' ? "bg-indigo-500 text-white" : "bg-slate-700 text-indigo-300 border border-slate-600")}>
                         {m.role === 'user' ? 'U' : 'AI'}
                       </div>
                       <div className={cn("max-w-[80%] rounded-2xl px-5 py-3 text-sm shadow-sm", m.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none")}>
                        {m.role === 'user' ? (
                          m.content
                        ) : (
                          <div className="markdown-body prose-invert prose-sm max-w-none text-slate-200">
                            <Markdown>{m.content}</Markdown>
                          </div>
                        )}
                       </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleQASubmit} className="p-4 bg-slate-800 border-t border-slate-700">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    placeholder="E.g., What are the most important calculus formulas?"
                    className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-100 placeholder-slate-500 outline-none transition-all"
                  />
                  <button type="submit" className="px-5 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 font-medium transition-colors shadow-sm cursor-pointer">
                    Ask
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* RESULT MODAL */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden relative z-10"
            >
              <div className="px-6 py-5 border-b border-slate-700 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-3">
                  {FIXED_ACTIONS.find(a => a.id === activeTask)?.icon({ className: "w-6 h-6 text-indigo-400" })}
                  <h2 className="text-xl font-semibold text-slate-100">
                    {FIXED_ACTIONS.find(a => a.id === activeTask)?.title}
                  </h2>
                  {isGenerating && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin ml-2" />}
                </div>
                <div className="flex gap-3">
                  {audioUrl && (
                    <button 
                      onClick={playAudio}
                      className={cn("px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium border cursor-pointer", isPlayingAudio ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-slate-800 text-indigo-400 hover:bg-slate-700 border-slate-600")}
                    >
                      <Play className="w-4 h-4" />
                      {isPlayingAudio ? "Playing..." : "Play Audio Preview"}
                    </button>
                  )}
                  <button 
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1 bg-slate-800 text-slate-200">
                <div className="markdown-body prose-invert max-w-none text-[#F8FAFC]">
                  {result ? (
                     <Markdown>{result}</Markdown>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-400" />
                      <p>Generating your study materials...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

