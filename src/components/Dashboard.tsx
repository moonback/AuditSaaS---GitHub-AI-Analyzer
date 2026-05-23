import React, { useState, useEffect } from 'react';
import { Search, Loader2, GitBranch, Shield, Activity, CheckCircle2, XCircle, ChevronRight, Clock, GitCompare, Trash2 } from 'lucide-react';
import { AuditReport, SUPPORTED_MODELS } from '../types';

export default function Dashboard() {
  const [repoUrl, setRepoUrl] = useState('');
  const [repoUrl2, setRepoUrl2] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [model, setModel] = useState(SUPPORTED_MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditReport[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('audit_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch(e) {}
    }
  }, []);

  const saveToHistory = (newReport: AuditReport) => {
    setHistory(prev => {
      const newHistory = [newReport, ...prev.filter(r => r.repoUrl !== newReport.repoUrl)].slice(0, 10);
      localStorage.setItem('audit_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };


  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('audit_history');
  };

  const loadHistory = (item: AuditReport) => {
    setReport(item);
    if (item.repoUrl.includes(" VS ")) {
       const parts = item.repoUrl.split(" VS ");
       setRepoUrl(parts[0]);
       setRepoUrl2(parts[1]);
       setIsComparing(true);
    } else {
       setRepoUrl(item.repoUrl);
       setRepoUrl2('');
       setIsComparing(false);
    }
    setError(null);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      let fetchedRepoDetails = undefined;
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        const owner = match[1];
        const repoName = match[2].replace(/\.git$/, '');
        try {
          const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`);
          if (ghRes.ok) {
            const ghData = await ghRes.json();
            fetchedRepoDetails = {
              stars: ghData.stargazers_count,
              forks: ghData.forks_count,
              language: ghData.language || 'Non spécifié',
              updatedAt: new Date(ghData.updated_at).toLocaleDateString(),
              description: ghData.description || 'Aucune description'
            };
          }
        } catch (e) {
          console.error("Error fetching repo details", e);
        }
      }

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, repoUrl2: isComparing ? repoUrl2 : undefined, model })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Échec de l'analyse du dépôt");
      }

      if (fetchedRepoDetails && !isComparing) {
        data.repoDetails = fetchedRepoDetails;
      }

      setReport(data);
      saveToHistory(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const ScoreRing = ({ score, label }: { score: number, label: string }) => {
    const colorClass = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-slate-900';
    return (
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
          <div className="text-3xl font-bold text-slate-900">{score}<span className="text-lg text-slate-400">/100</span></div>
        </div>
        <div className="relative flex items-center justify-center">
          <svg className="w-12 h-12 transform -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={20 * 2 * Math.PI} strokeDashoffset={20 * 2 * Math.PI * (1 - score / 100)} className={`${colorClass} transition-all duration-1000 ease-out`} />
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex border-8 border-slate-900 overflow-hidden text-left h-screen">
      {/* Sidebar: Historique */}
      <aside className="w-64 bg-slate-900 flex flex-col border-r border-slate-800 flex-shrink-0 relative z-20 hidden md:flex">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-white font-bold text-lg tracking-tight flex items-center gap-2">
            <span className="w-3 h-3 bg-indigo-500 rounded-sm"></span>
            AuditSaaS
          </h1>
          <p className="text-slate-500 text-xs mt-1">v2.4.0 • Édition Entreprise</p>
        </div>
        
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="text-[10px] uppercase font-bold text-slate-500 px-3 mb-2 tracking-widest flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Clock className="w-3 h-3" /> Analyses Récentes
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="text-slate-500 hover:text-rose-300 transition-colors"
                title="Effacer l'historique"
                aria-label="Effacer les analyses récentes"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {history.map(item => {
             const repoPath = item.repoUrl.replace('https://github.com/', '').replace('http://github.com/', '');
             return (
               <div key={item.id} onClick={() => loadHistory(item)} className={`p-3 rounded flex flex-col gap-1 transition-colors cursor-pointer border ${report?.id === item.id ? 'bg-slate-800 border-slate-700' : 'border-transparent hover:bg-slate-800 hover:border-slate-700'} text-slate-400`}>
                 <span className="text-xs truncate text-indigo-100 font-medium">{repoPath}</span>
                 <span className={`text-[10px] font-mono ${item.score >= 80 ? 'text-emerald-400' : item.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>Score: {item.score}/100</span>
               </div>
             );
          })}
          {history.length === 0 && (
             <div className="px-3 py-4 text-xs text-slate-500 italic">Aucun historique.</div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header / Top Control Bar */}
        <header className="h-20 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between flex-shrink-0 w-full relative z-10">
          <h1 className="text-lg tracking-tight font-bold text-slate-900 md:hidden flex items-center gap-2">
            <span className="w-3 h-3 bg-indigo-500 rounded-sm"></span>
            AuditSaaS
          </h1>
          <div className="flex items-center gap-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest hidden lg:flex ml-auto">
            <span>Édition Entreprise</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>Local Storage Activé</span>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0 max-w-6xl mx-auto w-full">
          {/* Form Controls Area */}
          <form onSubmit={handleAnalyze} className="mb-6 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4 w-full">
            <div className="flex flex-col lg:flex-row items-start lg:items-end gap-4 w-full">
              
              <div className="flex-1 w-full min-w-[240px] flex flex-col gap-3">
                <div>
                  <label htmlFor="repoUrl" className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter block mb-1">Dépôt {isComparing && "1"} Cible</label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-slate-400 mr-2 text-sm shrink-0">https://github.com/</span>
                    <input
                      type="text"
                      id="repoUrl"
                      className="bg-transparent border-none text-sm font-medium focus:ring-0 flex-1 p-0 outline-none w-full min-w-[100px]"
                      placeholder="facebook/react"
                      value={repoUrl.replace('https://github.com/', '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRepoUrl(val.startsWith('http') ? val : `https://github.com/${val}`);
                      }}
                      required
                    />
                  </div>
                </div>

                {isComparing && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label htmlFor="repoUrl2" className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter block mb-1">Dépôt 2 (À Comparer)</label>
                    <div className="flex items-center bg-slate-50 border border-indigo-200 rounded-lg px-3 py-2 ring-1 ring-indigo-100">
                      <span className="text-slate-400 mr-2 text-sm shrink-0">https://github.com/</span>
                      <input
                        type="text"
                        id="repoUrl2"
                        className="bg-transparent border-none text-sm font-medium focus:ring-0 flex-1 p-0 outline-none w-full min-w-[100px]"
                        placeholder="TanStack/router"
                        value={repoUrl2.replace('https://github.com/', '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRepoUrl2(val.startsWith('http') ? val : `https://github.com/${val}`);
                        }}
                        required={isComparing}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-start min-w-[180px] w-full lg:w-auto flex-shrink-0">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter block mb-1">Mode d'Analyse</label>
                <div className="flex items-center gap-2 h-[38px] cursor-pointer" onClick={() => setIsComparing(!isComparing)}>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${isComparing ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-transform ${isComparing ? 'translate-x-6' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <GitCompare className="w-3.5 h-3.5" /> Comparaison
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-start min-w-[200px] w-full lg:w-auto flex-shrink-0">
                <label htmlFor="model" className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter block mb-1">Modèle d'Analyse</label>
                <div className="relative w-full">
                  <select
                    id="model"
                    className="bg-white border border-slate-200 text-sm font-semibold py-2 px-3 pr-8 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full outline-none appearance-none"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {SUPPORTED_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 h-[38px] min-w-[150px] w-full lg:w-auto disabled:opacity-70 transition-colors flex-shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Audit...
                  </>
                ) : 'Lancer l\'Audit'}
              </button>
            </div>
          </form>

          {/* Error State */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-700 items-start shadow-sm">
              <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
              <span className="text-xs font-medium leading-relaxed">{error}</span>
            </div>
          )}

          {/* Empty State / Loading */}
          {!report && !error && !loading && (
            <div className="h-[40vh] flex flex-col items-center justify-center text-slate-400">
              <GitBranch className="w-12 h-12 text-slate-200 mb-4" />
              <p className="text-sm font-medium">Entrez l'URL d'un dépôt GitHub pour lancer un audit.</p>
            </div>
          )}
          
          {loading && (
             <div className="h-[40vh] flex flex-col items-center justify-center text-indigo-500">
                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Analyse Approfondie en cours...</p>
             </div>
          )}

          {/* Results */}
          {report && !loading && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
              
              {/* Repo Details Panel */}
              {report.repoDetails && (
                <div className="mb-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 break-all">{report.repoUrl}</h2>
                      <p className="text-xs text-slate-500 mt-1">{report.repoDetails.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-600 shrink-0">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Étoiles</span>
                        <span>⭐ {report.repoDetails.stars}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Forks</span>
                        <span>{report.repoDetails.forks}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Langage</span>
                        <span>{report.repoDetails.language}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Dernière MAJ</span>
                        <span>{report.repoDetails.updatedAt}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <ScoreRing score={report.score} label="Score de Santé" />
                <ScoreRing score={report.architecture.score} label="Architecture" />
                <ScoreRing score={report.security.score} label="Sécurité" />
              </div>

              {/* Main Analysis Split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Detailed Report */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Executive Summary */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                      <h2 className="font-bold text-xs uppercase tracking-widest text-slate-700 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-indigo-600" /> Résumé Exécutif
                      </h2>
                      <div className="flex gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                        <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                        <span className="w-2 h-2 rounded-full bg-slate-200"></span>
                      </div>
                    </div>
                    <div className="p-5 text-sm text-slate-700 leading-loose">
                      {report.summary}
                    </div>
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                      <div className="p-3 border-b border-slate-100 bg-emerald-50/50 rounded-t-xl flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 
                        <h4 className="font-bold text-[10px] uppercase tracking-widest text-emerald-800">Points Forts</h4>
                      </div>
                      <div className="p-4 flex-1">
                        <ul className="space-y-3">
                          {report.strengths.map((s, i) => (
                            <li key={i} className="text-emerald-800 text-[11px] flex items-start gap-2 leading-relaxed font-medium">
                              <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                      <div className="p-3 border-b border-slate-100 bg-amber-50/50 rounded-t-xl flex items-center gap-2">
                        <XCircle className="w-3.5 h-3.5 text-amber-600" /> 
                        <h4 className="font-bold text-[10px] uppercase tracking-widest text-amber-800">Points Faibles</h4>
                      </div>
                      <div className="p-4 flex-1">
                        <ul className="space-y-3">
                          {report.weaknesses.map((w, i) => (
                            <li key={i} className="text-amber-800 text-[11px] flex items-start gap-2 leading-relaxed font-medium">
                              <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Technical Audit Logs Style */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                      <h2 className="font-bold text-xs uppercase tracking-widest text-slate-700 flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-indigo-600" /> Détails Techniques
                      </h2>
                      <div className="flex gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      </div>
                    </div>
                    <div className="flex-1 p-5 font-mono text-[11px] leading-relaxed text-slate-600">
                      <div className="mb-4">
                        <span className="text-slate-400 mr-2">[ARCHITECTURE]</span> 
                        <span className="text-indigo-600 font-bold">INFO:</span> {report.architecture.notes}
                      </div>
                      <div className="mb-2">
                        <span className="text-slate-400 mr-2">[SÉCURITÉ]</span> 
                        <span className="text-emerald-600 font-bold">INFO:</span> {report.security.notes}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right: AI Recommendations */}
                <div className="bg-indigo-900 rounded-xl shadow-lg flex flex-col text-indigo-100 self-start sticky top-6">
                  <div className="p-4 border-b border-indigo-800">
                    <h2 className="font-bold text-xs uppercase tracking-widest text-white">Recommandations</h2>
                  </div>
                  <div className="flex-1 p-5 space-y-5">
                    {report.recommendations.map((r, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-6 h-6 rounded bg-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0 text-white">
                          {i + 1 < 10 ? `0${i+1}` : i+1}
                        </div>
                        <div>
                          <p className="text-sm opacity-90 leading-relaxed text-indigo-50">{r}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 mt-auto bg-white/5 border-t border-indigo-800 text-[10px] text-center text-indigo-300">
                    Modèle sélectionné: {SUPPORTED_MODELS.find(m => m.id === model)?.name || model}
                  </div>
                </div>
                
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}