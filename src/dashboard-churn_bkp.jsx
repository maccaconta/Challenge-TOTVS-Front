import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import { AlertTriangle, Brain, ChevronRight, Filter, Info, RefreshCcw } from "lucide-react";

/** ------------------------------------------------------------------
 * Dashboard — Risco & Churn (wireframe funcional)
 * - Segue o storytelling: Quanto? Onde? Por quê? O que fazer? Está funcionando?
 * - Recharts somente (estável). Todos YAxis numéricos usam type="number".
 * - Eixos duplos no ComposedChart com yAxisId numérico (0/1) — evita erro #130.
 * - Cross-filter básico: clicar em Distribuição filtra a fila; slider de risco atualiza KPIs.
 * - Toggle % ↔ R$ na Distribuição.
 * - Scatter adicional por clusters.
 * ------------------------------------------------------------------ */

// ====== Utils ======
const safeNum = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
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

// ====== Mock data (coerente com os componentes) ======
const monthlyTrend = [
  { mes: "Jan", churnRate: 2.1, revChurn: 120000, grr: 96.8, nrr: 103.2 },
  { mes: "Fev", churnRate: 2.3, revChurn: 105000, grr: 96.5, nrr: 103.7 },
  { mes: "Mar", churnRate: 2.7, revChurn: 142000, grr: 96.1, nrr: 102.9 },
  { mes: "Abr", churnRate: 2.2, revChurn: 98000,  grr: 96.9, nrr: 104.1 },
  { mes: "Mai", churnRate: 2.5, revChurn: 131000, grr: 96.6, nrr: 103.3 },
  { mes: "Jun", churnRate: 2.9, revChurn: 155000, grr: 96.0, nrr: 102.5 },
  { mes: "Jul", churnRate: 2.4, revChurn: 117000, grr: 96.7, nrr: 103.8 },
];

const mrrWaterfall = [
  { etapa: "Início", valor: 5000000 },
  { etapa: "Novos", valor: 450000 },
  { etapa: "Expansão", valor: 380000 },
  { etapa: "Contração", valor: -220000 },
  { etapa: "Churn", valor: -155000 },
  { etapa: "Final", valor: 5465000 },
];

const clientes = [
  { id: 1, cliente: "Alpha Ltda", risco: 82, mrr: 210000, renovacao: 18, segmento: "Serviços", uf: "SP", faixa: "Faixa 07", cluster: "Queda de uso", uso30: "↓ forte", tickets30: 17, sla: 72, nps: 5, motivos: ["Baixa ativação X","Erros integração"], dono: "CSM Ana" },
  { id: 2, cliente: "Beta S/A",  risco: 68, mrr: 125000, renovacao: 35, segmento: "Comércio", uf: "RJ", faixa: "Faixa 08", cluster: "Oscilação de uso", uso30: "↔",       tickets30: 8,  sla: 83, nps: 7, motivos: ["Adoção parcial"], dono: "CSM Leo" },
  { id: 3, cliente: "Gamma",     risco: 41, mrr:  80000, renovacao: 62, segmento: "Manufatura", uf: "SC", faixa: "Faixa 11", cluster: "Saudável",         uso30: "↑",       tickets30: 3,  sla: 92, nps: 8, motivos: ["Sem alertas"], dono: "CSM Rui" },
  { id: 4, cliente: "Delta",     risco: 29, mrr:  30000, renovacao: 85, segmento: "Serviços", uf: "SP", faixa: "Faixa 07", cluster: "Saudável",         uso30: "↑",       tickets30: 1,  sla: 95, nps: 9, motivos: ["Sem alertas"], dono: "CSM Bia" },
  { id: 5, cliente: "Epsilon",   risco: 74, mrr: 165000, renovacao: 10, segmento: "Comércio", uf: "RJ", faixa: "Faixa 08", cluster: "Suporte crítico",   uso30: "↔",       tickets30: 21, sla: 64, nps: 4, motivos: ["Fila suporte","Sev alta"], dono: "CSM João" },
  { id: 6, cliente: "Zeta",      risco: 55, mrr:  95000, renovacao: 42, segmento: "Manufatura", uf: "SC", faixa: "Faixa 11", cluster: "NPS baixo",       uso30: "↓ leve",  tickets30: 9,  sla: 79, nps: 6, motivos: ["UX fiscal"], dono: "CSM Maria" },
];

// Distribuição por dimensões (contagem por nível de risco + MRR por nível)
const distBy = {
  Segmento: [
    { cat: "Serviços", baixo: 42, medio: 28, alto: 13, mrr_baixo: 980000, mrr_medio: 710000, mrr_alto: 380000 },
    { cat: "Comércio", baixo: 36, medio: 19, alto: 9,  mrr_baixo: 650000, mrr_medio: 490000, mrr_alto: 260000 },
    { cat: "Manufatura", baixo: 29, medio: 22, alto: 14, mrr_baixo: 720000, mrr_medio: 530000, mrr_alto: 310000 },
  ],
  UF: [
    { cat: "SP", baixo: 44, medio: 21, alto: 12, mrr_baixo: 1100000, mrr_medio: 560000, mrr_alto: 330000 },
    { cat: "RJ", baixo: 21, medio: 14, alto: 8,  mrr_baixo: 480000,  mrr_medio: 360000, mrr_alto: 220000 },
    { cat: "SC", baixo: 19, medio: 12, alto: 6,  mrr_baixo: 410000,  mrr_medio: 300000, mrr_alto: 150000 },
  ],
  "Faixa Faturamento": [
    { cat: "Faixa 07", baixo: 21, medio: 11, alto: 7, mrr_baixo: 520000, mrr_medio: 310000, mrr_alto: 280000 },
    { cat: "Faixa 08", baixo: 16, medio: 10, alto: 8, mrr_baixo: 480000, mrr_medio: 340000, mrr_alto: 295000 },
    { cat: "Faixa 11", baixo: 9,  medio: 8,  alto: 6, mrr_baixo: 380000, mrr_medio: 290000, mrr_alto: 260000 },
  ],
};

const drivers = [
  { driver: "Δ Uso 60d (queda)", importancia: 0.42 },
  { driver: "Tickets/Usuário", importancia: 0.28 },
  { driver: "NPS mínimo", importancia: 0.17 },
  { driver: "Recência de uso", importancia: 0.08 },
  { driver: "Reaberturas", importancia: 0.05 },
];

const ticketsTemas = [
  { tema: "Fiscal", qtd: 41 },
  { tema: "Financeiro", qtd: 33 },
  { tema: "Integração", qtd: 29 },
  { tema: "UX/Usabilidade", qtd: 21 },
  { tema: "Performance", qtd: 18 },
];

const npsPorRisco = [
  { risco: "Baixo", nps: 8.3 },
  { risco: "Médio", nps: 6.9 },
  { risco: "Alto", nps: 5.4 },
];

const renovacaoJanela = [
  { janela: "0–30", mrr: 620000, clientes: 33 },
  { janela: "31–60", mrr: 420000, clientes: 25 },
  { janela: "61–90", mrr: 310000, clientes: 19 },
];

// ====== Component ======
export default function RiscoChurnWireframe() {
  // Filtros (UI superior)
  const [periodo, setPeriodo] = useState("Últimos 6 meses");
  const [linha, setLinha] = useState("Todas");
  const [dim, setDim] = useState("Segmento");
  const [cat, setCat] = useState(null);
  const [faixa, setFaixa] = useState("Todas");
  const [uf, setUf] = useState("Todas");
  const [janela, setJanela] = useState("0–30");
  const [riskMin, setRiskMin] = useState(0);
  const [distMetric, setDistMetric] = useState("percent"); // "percent" | "mrr"
  const [selecionado, setSelecionado] = useState(null); // painel lateral

  // KPI: receita em risco (usa janela)
  const receitaEmRisco = useMemo(() => {
    const row = renovacaoJanela.find(r => r.janela === janela) || { mrr: 0 };
    return safeNum(row.mrr);
  }, [janela]);

  const churnMax = useMemo(() => Math.max(0, ...monthlyTrend.map(d => safeNum(d.churnRate))), []);
  const yLeftMax = Math.ceil(churnMax + 1);
  const wfVals = useMemo(() => mrrWaterfall.map(d => safeNum(d.valor)), []);
  const wfMin = useMemo(() => Math.min(0, ...wfVals), [wfVals]);
  const wfMax = useMemo(() => Math.max(0, ...wfVals), [wfVals]);

  // Distribuição transform (percentuais)
  const distData = useMemo(() => {
    const base = distBy[dim] || [];
    return base.map(r => {
      const total = safeNum(r.baixo) + safeNum(r.medio) + safeNum(r.alto);
      const baixo_pct = total ? (r.baixo / total) * 100 : 0;
      const medio_pct = total ? (r.medio / total) * 100 : 0;
      const alto_pct  = total ? (r.alto  / total) * 100 : 0;
      return {
        ...r,
        baixo_pct,
        medio_pct,
        alto_pct,
      };
    });
  }, [dim]);

  // Fila priorizada (wireframe: ordena por risco*MRR e filtra por risco mínimo + cat opcional)
  const fila = useMemo(() => {
    return clientes
      .filter(c => c.risco >= riskMin)
      .filter(c => (cat ? (c.segmento === cat || c.uf === cat || c.faixa === cat) : true))
      .sort((a,b) => (b.risco * b.mrr) - (a.risco * a.mrr));
  }, [riskMin, cat]);

  // Painel lateral (mini-sparklines fake)
  const spark = (n) => Array.from({ length: n }, (_, i) => 40 + Math.round(30 * Math.sin(i/2 + (n%5))));

  // Cores por cluster (scatter clusters)
  const clusterColors = {
    "Queda de uso": "#F28E2B",
    "Suporte crítico": "#D32F2F",
    "NPS baixo": "#9467BD",
    "Oscilação de uso": "#F9A825",
    "Saudável": "#2E7D32",
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
              <h2 className="text-xl font-semibold leading-tight">Desafio TOTVS - Riscos & Churn   </h2>
              <p className="text-xs text-slate-800">  TIME FUTURAMA  </p>
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
            <button className="px-2 py-1 rounded-md border border-slate-200 flex items-center gap-1"><Filter className="h-4 w-4"/> Filtros</button>
            <button className="px-2 py-1 rounded-md border border-slate-200 flex items-center gap-1"><RefreshCcw className="h-4 w-4"/> Atualizar</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {/* Linha 1 — KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Churn de logos", value: "2,4%", tip: "Cancelamentos ÷ base inicial do período." },
            { label: "Gross Rev. Churn", value: fmtBRL(155000), tip: "Perdas (churn + contração)." },
            { label: "GRR", value: "96,7%", tip: "(MRR_fim – expansão – novos) ÷ MRR_início." },
            { label: "NRR", value: "103,8%", tip: "(MRR_fim – novos) ÷ MRR_início." },
            { label: `Receita em Risco (${janela}d)`, value: fmtBRL(receitaEmRisco), tip: "MRR com score ≥ limiar e na janela selecionada." },
            { label: "Clientes em Risco / Save", value: `${33} / ${pct(36)}`, tip: "Qtde em risco e Save Rate." },
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
                  <YAxis yAxisId={0} type="number" domain={[0, Math.ceil(Math.max(...monthlyTrend.map(d=>d.churnRate))+1)]} />
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
                  <YAxis type="number" domain={[Math.min(0, ...mrrWaterfall.map(d=>d.valor))-100000, Math.max(0, ...mrrWaterfall.map(d=>d.valor))+100000]} tickFormatter={(v)=>fmtBRL(v)} />
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
                  <Scatter name="Contas" data={clientes.filter(c=>c.risco>=riskMin)}>
                    {clientes.filter(c=>c.risco>=riskMin).map((p, i)=> (
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
              <InfoBadge text="Variáveis que mais explicam o score de risco (ex.: SHAP)."/>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...drivers].sort((a,b)=>a.importancia-b.importancia)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={(v)=>pct(Number(v)*100,0)} />
                  <YAxis type="category" dataKey="driver" width={160} />
                  <Tooltip formatter={(v)=> pct(Number(v)*100,0)} />
                  <Bar dataKey="importancia" fill="#0F6CBD" radius={[8,8,8,8]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <h2 className="text-sm font-semibold">Tickets — temas & NPS por risco</h2>
                <InfoBadge text="Ranking de temas de tickets e NPS médio por nível de risco."/>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...ticketsTemas].sort((a,b)=>b.qtd-a.qtd)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="tema" width={140} />
                    <Tooltip />
                    <Bar dataKey="qtd" fill="#0F6CBD" radius={[8,8,8,8]} />
                  </BarChart>
                </ResponsiveContainer>
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
              <h2 className="text-sm font-semibold">Coortes (mock) — retenção por mês de entrada</h2>
              <InfoBadge text="Cada célula representa a retenção da coorte ao longo dos meses."/>
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
                <Scatter name="Clientes" data={clientes}>
                  {clientes.map((c, i)=> (
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
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${r.risco>=70?"bg-red-50 text-red-700":"" || r.risco>=40?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}>{r.risco}</span></td>
                    <td className="px-3 py-2">{r.cluster}</td>
                    <td className="px-3 py-2">{r.renovacao}</td>
                    <td className="px-3 py-2">{r.uso30}</td>
                    <td className="px-3 py-2">{r.tickets30}</td>
                    <td className="px-3 py-2">{r.sla}%</td>
                    <td className="px-3 py-2">{r.nps}</td>
                    <td className="px-3 py-2 text-slate-600">{r.motivos.join(", ")}</td>
                    <td className="px-3 py-2">Playbook sugerido</td>
                    <td className="px-3 py-2">{r.dono}</td>
                    <td className="px-3 py-2">Em aberto</td>
                    <td className="px-3 py-2">Contato 12/08</td>
                    <td className="px-3 py-2"><button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[#0F6CBD] text-white hover:opacity-90">Abrir <ChevronRight className="h-3 w-3"/></button></td>
                  </tr>
                ))}
                {fila.length === 0 && (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={15}>Nenhum registro com os filtros atuais.</td></tr>
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
                <p className="font-semibold">{selecionado.risco}</p>
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
                <p className="">Adoção guiada + reforço integração</p>
              </div>
            </div>
          </aside>
        )}

        {/* Rodapé — Definições de negócio */}
        <section className="text-xs text-slate-500 px-1">
          <p>*Definições:* Churn de logos = cancelamentos ÷ base inicial; Gross Revenue Churn = perdas (churn+contração); GRR = (MRR_fim – expansão – novos) ÷ MRR_início; NRR = (MRR_fim – novos) ÷ MRR_início; Receita em Risco = Σ MRR com score ≥ limiar e na janela; Save Rate = salvos ÷ em risco.</p>
        </section>
      </main>
    </div>
  );
}
