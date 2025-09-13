import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid, ComposedChart, ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";
import { AlertTriangle, Brain, ChevronRight, Filter, Info, RefreshCcw } from "lucide-react";

const API = import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/churn` : `/api/churn`;
// substitua os mocks por estados:
const [monthlyTrend, setMonthlyTrend] = useState([]);
const [mrrWaterfall, setMrrWaterfall] = useState([]);
const [clientes, setClientes] = useState([]);             // fila
const [distBy, setDistBy] = useState({ Segmento:[], UF:[], "Faixa Faturamento":[] });
const [drivers] = useState([]);                           // (se quiser, alimente por /model_churn_coeffs)
const [ticketsTemas] = useState([]);                      // (não temos no schema; mantém vazio)
const [npsPorRisco, setNpsPorRisco] = useState([]);
const [renovacaoJanela, setRenovacaoJanela] = useState([]);

// ====== Utils ======
const safeNum = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : (v==null?d:Number(v)||d));
const fmtBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(safeNum(v));
const pct = (v, d = 1) => `${Number(v ?? 0).toFixed(d)}%`;

function InfoBadge({ text }) {
  return (
    <span className="relative group inline-flex items-center ml-2 align-middle">
      <Info className="h-4 w-4 text-slate-400 cursor-help" />
      <span className="pointer-events-none absolute z-30 hidden group-hover:block w-72 sm:w-80 -right-2 top-5 bg-white border border-slate-200 shadow-xl p-2 text-[11px] leading-snug rounded-md text-slate-700">
        {text}
      </span>
    </span>
  );
}

useEffect(() => {
  const API = "/api/analytics";

  async function fetchAll() {
    // KPIs (preenche os cards superiores)
    const kpis = await fetch(`${API}/kpis`).then(r => r.json()).catch(()=>({}));
    // Tendência mensal
    const trend = await fetch(`${API}/trend`).then(r => r.json()).catch(()=>[]);
    // Waterfall
    const wf = await fetch(`${API}/waterfall`).then(r => r.json()).catch(()=>[]);
    // Distribuições por dimensão
    const bySeg = await fetch(`${API}/summary?dim=segmento`).then(r=>r.json()).catch(()=>[]);
    const byUF  = await fetch(`${API}/summary?dim=uf`).then(r=>r.json()).catch(()=>[]);
    const byFx  = await fetch(`${API}/summary?dim=faixa`).then(r=>r.json()).catch(()=>[]);
    // Fila priorizada
    const q = await fetch(`${API}/queue`).then(r => r.json()).catch(()=>[]);
    // NPS por risco
    const nps = await fetch(`${API}/nps_risco`).then(r => r.json()).catch(()=>[]);
    // Renovação
    const ren = await fetch(`${API}/renovacao`).then(r => r.json()).catch(()=>[]);

    // set states
    setMonthlyTrend(Array.isArray(trend) ? trend : []);
    setMrrWaterfall(Array.isArray(wf) ? wf : []);
    setDistBy({
      "Segmento": bySeg,
      "UF": byUF,
      "Faixa Faturamento": byFx,
    });
    setClientes(q);
    setNpsPorRisco(nps);
    setRenovacaoJanela(ren);

    // também podemos usar kpis.receitaEmRisco e kpis.clientesEmRisco nos cards
    // (no seu componente os cards já usam `renovacaoJanela`; mantenho assim para não alterar o layout)
  }
  fetchAll();
}, []);

// ====== Component ======
export default function RiscoChurnWireframe() {
  // Filtros (UI superior)
  const [periodo, setPeriodo] = useState("Últimos 6 meses");
  const [linha, setLinha] = useState("Todas");
  const [dim, setDim] = useState("Segmento"); // "Segmento" | "UF" | "Faixa Faturamento"
  const [cat, setCat] = useState(null);
  const [faixa, setFaixa] = useState("Todas");
  const [uf, setUf] = useState("Todas");
  const [janela, setJanela] = useState("0–30");
  const [riskMin, setRiskMin] = useState(0);
  const [distMetric, setDistMetric] = useState("percent"); // "percent" | "mrr"
  const [selecionado, setSelecionado] = useState(null); // painel lateral

  // DATA (sem mocks)
  const [monthlyTrend, setMonthlyTrend] = useState([]);  // {mes,label}, churnRate, revChurn, grr, nrr
  const [mrrWaterfall, setMrrWaterfall] = useState([]); // {etapa, valor}
  const [distSegmento, setDistSegmento] = useState([]); // {cat, baixo, medio, alto, mrr_*}
  const [distUF, setDistUF] = useState([]);
  const [distFaixa, setDistFaixa] = useState([]);
  const [queue, setQueue] = useState([]);               // lista priorizada (cliente)
  const [npsPorRisco, setNpsPorRisco] = useState([]);   // [{risco,nps}]
  const [renovacaoJanela, setRenovacaoJanela] = useState([]); // [{janela,mrr,clientes}]
  const [clusters, setClusters] = useState([]);         // scatter

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const fetchJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  };

  const toMon = (isoDate) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    } catch { return String(isoDate); }
  };

  const loadAll = async () => {
    setLoading(true); setErr(null);
    try {
      const [
        trend, wf, distSeg, distUf, distFx, fila, npsR, ren, clst
      ] = await Promise.all([
        fetchJSON(`${API}/trend`),
        fetchJSON(`${API}/waterfall`),
        fetchJSON(`${API}/summary_risco?dim=segmento`),
        fetchJSON(`${API}/summary_risco?dim=uf`),
        fetchJSON(`${API}/summary_risco?dim=fat_faixa`),
        fetchJSON(`${API}/queue`),
        fetchJSON(`${API}/nps_por_risco`),
        fetchJSON(`${API}/renovacao`),
        fetchJSON(`${API}/clusters_scatter`),
      ]);

      setMonthlyTrend(trend.map(r => ({
        mes: toMon(r.mes),
        churnRate: safeNum(r.churn_logos_pct),
        revChurn: safeNum(r.revenue_churn),
        grr: safeNum(r.grr_pct),
        nrr: safeNum(r.nrr_pct),
      })));

      setMrrWaterfall(wf.map(r => ({ etapa: r.etapa, valor: safeNum(r.valor) })));

      setDistSegmento((distSeg||[]).map(r => ({
        cat: r.cat, baixo: safeNum(r.baixo), medio: safeNum(r.medio), alto: safeNum(r.alto),
        mrr_baixo: safeNum(r.mrr_baixo), mrr_medio: safeNum(r.mrr_medio), mrr_alto: safeNum(r.mrr_alto),
      })));
      setDistUF((distUf||[]).map(r => ({
        cat: r.cat, baixo: safeNum(r.baixo), medio: safeNum(r.medio), alto: safeNum(r.alto),
        mrr_baixo: safeNum(r.mrr_baixo), mrr_medio: safeNum(r.mrr_medio), mrr_alto: safeNum(r.mrr_alto),
      })));
      setDistFaixa((distFx||[]).map(r => ({
        cat: r.cat, baixo: safeNum(r.baixo), medio: safeNum(r.medio), alto: safeNum(r.alto),
        mrr_baixo: safeNum(r.mrr_baixo), mrr_medio: safeNum(r.mrr_medio), mrr_alto: safeNum(r.mrr_alto),
      })));

      setQueue((fila||[]).map(r => ({
        id: r.id ?? r.cliente,
        cliente: r.cliente,
        mrr: safeNum(r.mrr),
        risco: safeNum(r.risco),
        cluster: r.cluster || "—",
        renovacao: safeNum(r.renovacao),
        uso30: r.uso30 ?? "-",
        tickets30: r.tickets30 ?? "-",
        sla: r.sla ?? null,
        nps: r.nps ?? null,
        motivos: Array.isArray(r.motivos) ? r.motivos : String(r.motivos||"").split(";").filter(Boolean),
        playbook: r.playbook || "—",
        dono: r.dono || "—",
        segmento: r.segmento || "—",
        uf: r.uf || "—",
        faixa: r.faixa || "—",
      })));

      setNpsPorRisco((npsR||[]).map(r => ({ risco: r.risco, nps: safeNum(r.nps) })));
      setRenovacaoJanela((ren||[]).map(r => ({ janela: r.janela, mrr: safeNum(r.mrr), clientes: Number(r.clientes||0) })));

      setClusters((clst||[]).map(r => ({
        id: r.id ?? r.cliente,
        cliente: r.cliente,
        risco: safeNum(r.risco),
        mrr: safeNum(r.mrr),
        cluster: r.cluster || "—",
        renovacao: Number(r.renovacao || 90),
      })));
    } catch (e) {
      console.error(e);
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // KPI: receita em risco (usa janela selecionada)
  const receitaEmRisco = useMemo(() => {
    const row = renovacaoJanela.find(r => r.janela === janela) || { mrr: 0 };
    return safeNum(row.mrr);
  }, [janela, renovacaoJanela]);

  const churnMax = useMemo(() => Math.max(0, ...monthlyTrend.map(d => safeNum(d.churnRate))), [monthlyTrend]);
  const yLeftMax = Math.ceil(churnMax + 1);
  const wfVals = useMemo(() => mrrWaterfall.map(d => safeNum(d.valor)), [mrrWaterfall]);
  const wfMin = useMemo(() => Math.min(0, ...wfVals, 0), [wfVals]);
  const wfMax = useMemo(() => Math.max(0, ...wfVals, 0), [wfVals]);

  // Distribuição (por dimensão selecionada)
  const distBy = useMemo(() => ({
    "Segmento": distSegmento,
    "UF": distUF,
    "Faixa Faturamento": distFaixa,
  }), [distSegmento, distUF, distFaixa]);

  const distData = useMemo(() => {
    const base = distBy[dim] || [];
    return base.map(r => {
      const total = safeNum(r.baixo) + safeNum(r.medio) + safeNum(r.alto);
      const baixo_pct = total ? (r.baixo / total) * 100 : 0;
      const medio_pct = total ? (r.medio / total) * 100 : 0;
      const alto_pct  = total ? (r.alto  / total) * 100 : 0;
      return { ...r, baixo_pct, medio_pct, alto_pct };
    });
  }, [distBy, dim]);

  // Fila priorizada (risco mínimo + filtro por categoria clicada)
  const fila = useMemo(() => {
    return queue
      .filter(c => safeNum(c.risco) >= riskMin)
      .filter(c => (cat ? (c.segmento === cat || c.uf === cat || c.faixa === cat) : true))
      .sort((a,b) => (safeNum(b.risco) * safeNum(b.mrr)) - (safeNum(a.risco) * safeNum(a.mrr)));
  }, [queue, riskMin, cat]);

  const spark = (n) => Array.from({ length: n }, (_, i) => 40 + Math.round(30 * Math.sin(i/2 + (n%5))));

  const clusterColors = {
    "Queda de uso": "#F28E2B",
    "Suporte crítico": "#D32F2F",
    "NPS baixo": "#9467BD",
    "Oscilação de uso": "#F9A825",
    "Saudável": "#2E7D32",
    "—": "#0F6CBD",
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      {/* Barra superior (filtros) */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-[#0F6CBD] shadow-sm flex items-center justify-center">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold leading-tight">Desafio TOTVS - Riscos & Churn</h2>
              <p className="text-xs text-slate-800">TIME FUTURAMA</p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <select value={periodo} onChange={(e)=>setPeriodo(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1"><option>Últimos 6 meses</option><option>Últimos 12 meses</option></select>
            <select value={linha} onChange={(e)=>setLinha(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1"><option>Todas</option><option>Série T</option><option>Backoffice</option></select>
            <select value={dim} onChange={(e)=>{setDim(e.target.value); setCat(null);}} className="border border-slate-200 rounded-md px-2 py-1"><option>Segmento</option><option>UF</option><option>Faixa Faturamento</option></select>
            <select value={uf} onChange={(e)=>setUf(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1"><option>Todas</option><option>SP</option><option>RJ</option><option>SC</option></select>
            <select value={faixa} onChange={(e)=>setFaixa(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1"><option>Todas</option><option>Faixa 07</option><option>Faixa 08</option><option>Faixa 11</option></select>
            <select value={janela} onChange={(e)=>setJanela(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1"><option>0–30</option><option>31–60</option><option>61–90</option></select>
            <div className="flex items-center gap-2">
              <span>Limiar:</span>
              <input type="range" min={0} max={100} value={riskMin} onChange={(e)=>setRiskMin(+e.target.value)} />
              <span className="w-6 text-right font-medium">{riskMin}</span>
            </div>
            <button onClick={loadAll} className="px-2 py-1 rounded-md border border-slate-200 flex items-center gap-1"><RefreshCcw className="h-4 w-4"/> Atualizar</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {err && <div className="text-red-700 text-xs border border-red-200 bg-red-50 p-2 rounded-md">Erro ao carregar dados: {err}</div>}

        {/* Linha 1 — KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Churn de logos", value: "—", tip: "Cancelamentos ÷ base inicial do período." },
            { label: "Gross Rev. Churn", value: monthlyTrend.length? fmtBRL(monthlyTrend.at(-1).revChurn): "—", tip: "Perdas (churn + contração)." },
            { label: "GRR", value: monthlyTrend.length? pct(monthlyTrend.at(-1).grr,1): "—", tip: "(MRR_fim – expansão – novos) ÷ MRR_início." },
            { label: "NRR", value: monthlyTrend.length? pct(monthlyTrend.at(-1).nrr,1): "—", tip: "(MRR_fim – novos) ÷ MRR_início." },
            { label: `Receita em Risco (${janela}d)`, value: fmtBRL(receitaEmRisco), tip: "MRR com score ≥ limiar e na janela selecionada." },
            { label: "Clientes em Risco", value: String(renovacaoJanela.find(r=>r.janela===janela)?.clientes ?? 0), tip: "Qtde com score ≥ limiar na janela." },
          ].map((kpi, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm border border-slate-200 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center">{kpi.label}<InfoBadge text={kpi.tip}/></p>
              <p className="text-lg md:text-xl font-semibold mt-1">{kpi.value}</p>
            </div>
          ))}
        </section>

        {/* Linha 2 — Tendência e Waterfall */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Tendência Mensal — Churn (%) × Revenue Churn (R$)</h2>
              <InfoBadge text="Linha: churn de logos (%). Barras: perdas em R$."/>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" />
                  <YAxis yAxisId={0} type="number" domain={[0, yLeftMax]} />
                  <YAxis yAxisId={1} type="number" orientation="right" tickFormatter={(v)=>fmtBRL(v)} />
                  <Tooltip formatter={(v, n) => (n && String(n).toLowerCase().includes("churn") ? pct(v) : fmtBRL(v))} />
                  <Legend />
                  <Bar yAxisId={1} dataKey="revChurn" name="Revenue Churn" fill="#0F6CBD" radius={[6,6,0,0]} />
                  <Line yAxisId={0} type="monotone" dataKey="churnRate" name="Churn %" stroke="#F28E2B" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">MRR Waterfall</h2>
              <InfoBadge text="Início → Novos → Expansão → Contração → Churn → Final."/>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mrrWaterfall}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="etapa" />
                  <YAxis type="number" domain={[wfMin - 100000, wfMax + 100000]} tickFormatter={(v)=>fmtBRL(v)} />
                  <Tooltip formatter={(v)=>fmtBRL(v)} />
                  <Bar dataKey="valor" name="Variação">
                    {mrrWaterfall.map((e, i) => (
                      <Cell key={i} fill={e.valor < 0 ? "#D32F2F" : i === 0 || i === mrrWaterfall.length-1 ? "#4B5563" : "#59A14F"} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Linha 3 — Onde está o risco */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Mapa de risco */}
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Mapa de Risco — Risco × MRR</h2>
              <InfoBadge text="X: risco (0–100); Y: MRR; bolha: MRR; cor: dias para renovação (quente = próximo)."/>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid stroke="#e5e7eb" />
                  <XAxis type="number" dataKey="risco" name="Risco" domain={[0,100]} />
                  <YAxis type="number" dataKey="mrr" name="MRR" tickFormatter={(v)=>fmtBRL(v)} />
                  <ZAxis type="number" dataKey="mrr" range={[60,200]} />
                  <Tooltip formatter={(v, n) => (n === "mrr" ? fmtBRL(v) : String(v))} />
                  <Scatter name="Contas" data={queue.filter(c=>safeNum(c.risco)>=riskMin)}>
                    {queue.filter(c=>safeNum(c.risco)>=riskMin).map((p, i)=> (
                      <Cell key={i} fill={p.renovacao <= 30 ? "#D32F2F" : p.renovacao <= 60 ? "#F9A825" : "#2E7D32"} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição com toggle % ↔ R$ */}
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <h2 className="text-sm font-semibold">Distribuição do Risco por {dim}</h2>
                <InfoBadge text="Empilhado por nível de risco. Toggle para ver % de clientes ou MRR por nível."/>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={()=>setDistMetric("percent")} className={`px-2 py-1 rounded-md border ${distMetric==="percent"?"bg-[#0F6CBD] text-white border-[#0F6CBD]":"bg-white border-slate-200"}`}>% clientes</button>
                <button onClick={()=>setDistMetric("mrr")} className={`px-2 py-1 rounded-md border ${distMetric==="mrr"?"bg-[#0F6CBD] text-white border-[#0F6CBD]":"bg-white border-slate-200"}`}>MRR (R$)</button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData} onClick={(e)=>{const lbl=e&&e.activeLabel; if(lbl) setCat(lbl);}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="cat" />
                  {distMetric === "percent" ? (
                    <YAxis type="number" domain={[0,100]} tickFormatter={(v)=>`${v}%`} />
                  ) : (
                    <YAxis type="number" tickFormatter={(v)=>fmtBRL(v)} />
                  )}
                  <Tooltip formatter={(v)=> distMetric==="percent"? `${Number(v).toFixed(1)}%` : fmtBRL(v)} />
                  <Legend />
                  {distMetric === "percent" ? (
                    <>
                      <Bar dataKey="alto_pct" stackId="a" name="Alto (%)" fill="#D32F2F" radius={[6,6,0,0]} />
                      <Bar dataKey="medio_pct" stackId="a" name="Médio (%)" fill="#F9A825" />
                      <Bar dataKey="baixo_pct" stackId="a" name="Baixo (%)" fill="#2E7D32" />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="mrr_alto" stackId="a" name="Alto (R$)" fill="#D32F2F" radius={[6,6,0,0]} />
                      <Bar dataKey="mrr_medio" stackId="a" name="Médio (R$)" fill="#F9A825" />
                      <Bar dataKey="mrr_baixo" stackId="a" name="Baixo (R$)" fill="#2E7D32" />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {cat && <div className="mt-2 text-xs text-slate-600">Filtro ativo: <b>{dim}</b> = <b>{cat}</b> (clique em outra barra para alterar)</div>}
          </div>
        </section>

        {/* Linha 4 — Por que está acontecendo (drivers) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Top drivers (importância)</h2>
              <InfoBadge text="(placeholder) — quando tiver explicabilidade do modelo, pluga aqui."/>
            </div>
            <div className="h-56 flex items-center justify-center text-xs text-slate-500">
              Em breve: importâncias do modelo (ex.: SHAP) a partir de analytics.model_churn_coeffs
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <h2 className="text-sm font-semibold">Tickets — temas & NPS por risco</h2>
                <InfoBadge text="NPS médio por nível de risco (de analytics.nps_por_risco)."/>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="h-56 flex items-center justify-center text-xs text-slate-500">
                Em breve: temas de tickets (fonte: trusted.tickets)
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={npsPorRisco}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="risco" />
                    <YAxis type="number" domain={[0,10]} />
                    <Tooltip />
                    <Bar dataKey="nps" name="NPS" radius={[6,6,0,0]}>
                      {npsPorRisco.map((r, i) => (
                        <Cell key={i} fill={r.risco === "Alto" ? "#D32F2F" : r.risco === "Médio" ? "#F9A825" : "#2E7D32"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* Linha 5 — Coortes & Renovação */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Coortes (mock visual)</h2>
              <InfoBadge text="Exemplo visual até a coorte real ser calculada."/>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px]">
              {[...Array(7)].map((_, r) => (
                <React.Fragment key={r}>
                  {[...Array(7)].map((_, c) => {
                    const val = Math.max(0.4, 1 - (r*0.09 + c*0.06));
                    const bg = `rgba(15,108,189,${val})`;
                    return (
                      <div key={`${r}-${c}`} className="h-8 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: bg }}>
                        {Math.round(val*100)}%
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Janela de Renovação — Receita em risco</h2>
              <InfoBadge text="MRR agregado por janela (0–30 / 31–60 / 61–90)."/>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={renovacaoJanela}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="janela" />
                  <YAxis type="number" tickFormatter={(v)=>fmtBRL(v)} />
                  <Tooltip formatter={(v)=>fmtBRL(v)} />
                  <Bar dataKey="mrr" name="MRR em risco" fill="#F28E2B" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Linha extra — Scatter com clusters de clientes */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
          <div className="flex items-center mb-2">
            <h2 className="text-sm font-semibold">Clusters — Dispersão de clientes (Risco × MRR)</h2>
            <InfoBadge text="Pontos coloridos por cluster; ajuda a ver padrões e separação dos grupos."/>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis type="number" dataKey="risco" name="Risco" domain={[0,100]} />
                <YAxis type="number" dataKey="mrr" name="MRR" tickFormatter={(v)=>fmtBRL(v)} />
                <ZAxis type="number" dataKey="mrr" range={[60, 200]} />
                <Tooltip formatter={(v, n) => (n === "mrr" ? fmtBRL(v) : String(v))} />
                <Scatter name="Clientes" data={clusters}>
                  {clusters.map((c, i)=> (
                    <Cell key={i} fill={clusterColors[c.cluster] || "#0F6CBD"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Linha 6 — Ação (fila priorizada) + painel lateral */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="text-sm font-semibold">Fila priorizada — agir agora</h2>
              <InfoBadge text="Ordenada por impacto (Risco × MRR). Ações rápidas: playbook, contato, follow-up."/>
            </div>
            <div className="text-xs text-slate-500">ordenada por Risco × MRR</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  {["Cliente","MRR","Risco","Cluster","Dias p/ renov.","Uso 30d","Tickets 30d","%SLA","NPS","Top motivos","Playbook","Dono","Status","Últ. ação","Próx. passo"].map((h) => (
                    <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fila.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={()=>setSelecionado(r)}>
                    <td className="px-3 py-2 font-medium">{r.cliente}</td>
                    <td className="px-3 py-2">{fmtBRL(r.mrr)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        r.risco>=70 ? "bg-red-50 text-red-700" :
                        r.risco>=40 ? "bg-amber-50 text-amber-700" :
                                      "bg-emerald-50 text-emerald-700"
                      }`}>{Math.round(r.risco)}</span>
                    </td>
                    <td className="px-3 py-2">{r.cluster}</td>
                    <td className="px-3 py-2">{r.renovacao}</td>
                    <td className="px-3 py-2">{r.uso30 ?? "-"}</td>
                    <td className="px-3 py-2">{r.tickets30 ?? "-"}</td>
                    <td className="px-3 py-2">{r.sla ?? "-"}{r.sla!=null?"%":""}</td>
                    <td className="px-3 py-2">{r.nps ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{Array.isArray(r.motivos)? r.motivos.join(", ") : String(r.motivos||"")}</td>
                    <td className="px-3 py-2">{r.playbook || "—"}</td>
                    <td className="px-3 py-2">{r.dono || "—"}</td>
                    <td className="px-3 py-2">Em aberto</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2"><button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[#0F6CBD] text-white hover:opacity-90">Abrir <ChevronRight className="h-3 w-3"/></button></td>
                  </tr>
                ))}
                {fila.length === 0 && (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={15}>{loading ? "Carregando..." : "Nenhum registro com os filtros atuais."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Painel lateral (detalhe do cliente selecionado) */}
        {selecionado && (
          <aside className="fixed right-3 bottom-3 top-16 w-[380px] bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">{selecionado.cliente}</h3>
                <p className="text-xs text-slate-500">{selecionado.segmento} • {selecionado.uf} • {selecionado.faixa}</p>
              </div>
              <button onClick={()=>setSelecionado(null)} className="text-xs px-2 py-1 rounded-md border border-slate-200">Fechar</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">MRR</p>
                <p className="font-semibold">{fmtBRL(selecionado.mrr)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Risco</p>
                <p className="font-semibold">{Math.round(selecionado.risco)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500 mb-1">Uso 90d (sparkline)</p>
                <div className="flex gap-1 items-end h-12">
                  {spark(20).map((h,i)=> (<div key={i} className="w-3 bg-[#0F6CBD] rounded" style={{height:`${h}%`}}/>))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500 mb-1">Tickets 90d (sparkline)</p>
                <div className="flex gap-1 items-end h-12">
                  {spark(20).map((h,i)=> (<div key={i} className="w-3 bg-slate-400 rounded" style={{height:`${(100-h)}%`}}/>))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500">Playbook recomendado</p>
                <p className="">{selecionado.playbook || "—"}</p>
              </div>
            </div>
          </aside>
        )}

        {/* Rodapé — Definições de negócio */}
        <section className="text-xs text-slate-500 px-1">
          <p>*Definições:* Churn de logos = cancelamentos ÷ base inicial; Gross Revenue Churn = perdas (churn+contração); GRR = (MRR_fim – expansão – novos) ÷ MRR_início; NRR = (MRR_fim – novos) ÷ MRR_início; Receita em Risco = Σ MRR com score ≥ limiar e na janela.</p>
        </section>
      </main>
    </div>
  );
}
