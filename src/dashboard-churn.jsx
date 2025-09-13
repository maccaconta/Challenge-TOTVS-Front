import React, { useEffect, useMemo, useState } from "react";
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

// =====================
// Config
// =====================
const API_ROOT = import.meta.env.VITE_API_BASE
  ? `${import.meta.env.VITE_API_BASE}/api/churn`
  : "/api/churn";

// =====================
// Utils
// =====================
const safeNum = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(safeNum(v));
const pct = (v, d = 1) => `${Number(v ?? 0).toFixed(d)}%`;
const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

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

// debounce simples
function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function DashboardChurn() {
  // =====================
  // Estado: filtros principais
  // =====================
  const [periodo, setPeriodo] = useState("Últimos 6 meses");
  const [linha, setLinha] = useState("Todas");
  const [dim, setDim] = useState("Segmento");
  const [cat, setCat] = useState(null); // seleção em gráficos de distribuição
  const [faixa, setFaixa] = useState("Todas");
  const [uf, setUf] = useState("Todas");
  const [janela, setJanela] = useState("0–30");
  const [riskMin, setRiskMin] = useState(0);
  const [distMetric, setDistMetric] = useState("percent"); // percent | mrr
  const [selecionado, setSelecionado] = useState(null); // detalhe lateral

  // =====================
  // Estado: filtros da Fila (/queue)
  // =====================
  const [mrrMin, setMrrMin] = useState(0);
  const [mrrMax, setMrrMax] = useState(999_999_999);
  const [riscoMin, setRiscoMin] = useState(0);
  const [riscoMax, setRiscoMax] = useState(100);
  const [renovacaoMin, setRenovacaoMin] = useState(0);
  const [renovacaoMax, setRenovacaoMax] = useState(3650);
  const [estado, setEstado] = useState("Todas");

  // manter riscoMin global sincronizado com riscoMin da fila quando o slider mudar
  useEffect(() => setRiscoMin(riskMin), [riskMin]);

  // =====================
  // Paginação
  // =====================

  const VIEW_PAGE_SIZE = 50;    // paginação da tabela (front)
  const QUEUE_BATCH = 100;      // lotes de /queue
  const QUEUE_CAP = 1000;       // limite total de /queue
  const limit = VIEW_PAGE_SIZE; // antes era 50 fixo


  const [page, setPage] = useState(0);
    const [totalClientes, setTotalClientes] = useState(0);

  // =====================
  // Dados
  // =====================
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [mrrWaterfall, setMrrWaterfall] = useState([]);
  const [distBy, setDistBy] = useState({ Segmento: [], UF: [], "Faixa Faturamento": [] });
  const [clientes, setClientes] = useState([]); // base para scatter/fila
  const [npsPorRisco, setNpsPorRisco] = useState([]);
  const [renovacaoJanela, setRenovacaoJanela] = useState([]);
  const [kpisExtra, setKpisExtra] = useState(null);

  // =====================
  // UI
  // =====================
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // =====================
  // Helpers
  // =====================
  // rowKey original do Marcelo (mantida)
  const rowKey = (o) => [
    String(o.id ?? o.cliente ?? "_"),
    String(o.uf ?? ""),
    String(o.renovacao ?? ""),
    String(o.mrr ?? ""),
    String(o.risco ?? ""),
  ].join("|");

  // monta querystring para /queue, com saneamento
  const buildQueueParams = (newPage = 0) => {
    const p = new URLSearchParams();

    const mrrMinV = clamp(toNum(mrrMin, 0), 0, 999_999_999);
    const mrrMaxV = clamp(toNum(mrrMax, 999_999_999), 0, 999_999_999);
    const riscoMinV = clamp(toNum(riscoMin, 0), 0, 100);
    const riscoMaxV = clamp(toNum(riscoMax, 100), 0, 100);
    const renovacaoMinV = clamp(toNum(renovacaoMin, 0), 0, 3650);
    const renovacaoMaxV = clamp(toNum(renovacaoMax, 3650), 0, 3650);

    p.set("limit", String(limit));
    p.set("offset", String(newPage * limit));
    p.set("mrr_min", String(mrrMinV));
    p.set("mrr_max", String(mrrMaxV));
    p.set("risco_min", String(riscoMinV));
    p.set("risco_max", String(riscoMaxV));
    p.set("renovacao_min", String(renovacaoMinV));
    p.set("renovacao_max", String(renovacaoMaxV));
    if (estado && estado !== "Todas") p.set("uf", estado);

    return p;
  };

// =====================
// Fetch
// =====================
// Carrega APENAS os datasets "estáticos" (1x no mount ou no botão Atualizar)
const fetchStaticOnce = async () => {
  const assertOk = async (r) => { if (!r.ok) throw new Error(`${r.url} → ${r.status} ${r.statusText}`); return r.json(); };
  const [kpis, trend, wf, bySeg, byUF, byFx, nps, ren] = await Promise.all([
  fetch(`${API_ROOT}/kpis`).then(assertOk).catch(() => ({})),
  fetch(`${API_ROOT}/trend`).then(assertOk).catch(() => ([])),
  fetch(`${API_ROOT}/waterfall`).then(assertOk).catch(() => ([])),
  fetch(`${API_ROOT}/summary?dim=segmento`).then(assertOk).catch(() => ([])),
  fetch(`${API_ROOT}/summary?dim=uf`).then(assertOk).catch(() => ([])),
  fetch(`${API_ROOT}/summary?dim=faixa`).then(assertOk).catch(() => ([])),
  fetch(`${API_ROOT}/nps_risco`).then(assertOk).catch(() => ([])),
  fetch(`${API_ROOT}/renovacao`).then(assertOk).catch(() => ([])),
  ]);
  console.log("/kpis linhas:", Object.keys(kpis||{}).length);
  console.log("/trend linhas:", Array.isArray(trend)? trend.length:0);
  console.log("/waterfall linhas:", Array.isArray(wf)? wf.length:0);
  console.log("/summary?dim=segmento linhas:", Array.isArray(bySeg)? bySeg.length:0);
  console.log("/summary?dim=uf linhas:", Array.isArray(byUF)? byUF.length:0);
  console.log("/summary?dim=faixa linhas:", Array.isArray(byFx)? byFx.length:0);
  console.log("/nps_risco linhas:", Array.isArray(nps)? nps.length:0);
  console.log("/renovacao linhas:", Array.isArray(ren)? ren.length:0);
  setKpisExtra(kpis || null);
  setMonthlyTrend(Array.isArray(trend) ? trend : []);
  setMrrWaterfall(Array.isArray(wf) ? wf : []);
  setDistBy({
  Segmento: Array.isArray(bySeg) ? bySeg : [],
  UF: Array.isArray(byUF) ? byUF : [],
  "Faixa Faturamento": Array.isArray(byFx) ? byFx : [],
  });
  setNpsPorRisco(Array.isArray(nps) ? nps : []);
  setRenovacaoJanela(Array.isArray(ren) ? ren : []);
};


// Carrega a QUEUE em lotes de 100 até 1000 (ou total menor), no mount, no refresh e quando filtros da fila mudarem
const fetchQueueBatched = async () => {
let offset = 0;
const batchLimit = QUEUE_BATCH;
const cap = QUEUE_CAP;
let allItems = [];
let total = 0;


while (offset < cap) {
const qs = buildQueueParams({ offset, limit: batchLimit }).toString();
const url = `${API_ROOT}/queue?${qs}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
const data = await res.json();


// primeira iteração: pega o total do backend
if (offset === 0) total = Number(data?.total ?? 0) || 0;


const items = (data?.items || []).map((it, idx) => ({
...it,
_rowid: [rowKey(it), String(offset), String(idx)].join("|")
}));


allItems = allItems.concat(items);


// decide se para: se trouxe menos que o lote, ou já atingiu cap, ou já cobriu o total
if (items.length < batchLimit) break;
offset += batchLimit;
if (offset >= cap) break;
if (offset >= total) break;
}


setClientes(allItems);
setTotalClientes(total);
console.log("/queue total:", total, "linhas carregadas:", allItems.length);
};

  // =====================
  // Fetch
  // =====================
  const fetchAll = async (newPage = 0) => {
    setLoading(true);
    setErrMsg("");
    try {
      const queueUrl = `${API_ROOT}/queue?${buildQueueParams(newPage).toString()}`;
      const [
        kpisRes,
        trendRes,
        wfRes,
        bySegRes,
        byUFRes,
        byFxRes,
        queueRes,
        npsRes,
        renRes,
      ] = await Promise.all([
        fetch(`${API_ROOT}/kpis`),
        fetch(`${API_ROOT}/trend`),
        fetch(`${API_ROOT}/waterfall`),
        fetch(`${API_ROOT}/summary?dim=segmento`),
        fetch(`${API_ROOT}/summary?dim=uf`),
        fetch(`${API_ROOT}/summary?dim=faixa`),
        fetch(queueUrl),
        fetch(`${API_ROOT}/nps_risco`),
        fetch(`${API_ROOT}/renovacao`),
      ]);

      const assertOk = async (r) => {
        if (!r.ok) throw new Error(`${r.url} → ${r.status} ${r.statusText}`);
        return r.json();
      };

      const [kpis, trend, wf, bySeg, byUF, byFx, queueData, nps, ren] = await Promise.all([
        assertOk(kpisRes).catch(() => ({})),
        assertOk(trendRes).catch(() => ([])),
        assertOk(wfRes).catch(() => ([])),
        assertOk(bySegRes).catch(() => ([])),
        assertOk(byUFRes).catch(() => ([])),
        assertOk(byFxRes).catch(() => ([])),
        assertOk(queueRes).catch(() => ({ items: [], total: 0 })),
        assertOk(npsRes).catch(() => ([])),
        assertOk(renRes).catch(() => ([])),
      ]);

      setKpisExtra(kpis || null);
      setMonthlyTrend(Array.isArray(trend) ? trend : []);
      setMrrWaterfall(Array.isArray(wf) ? wf : []);
      setDistBy({
        Segmento: Array.isArray(bySeg) ? bySeg : [],
        UF: Array.isArray(byUF) ? byUF : [],
        "Faixa Faturamento": Array.isArray(byFx) ? byFx : [],
      });

      // Gera _rowid único por item pra usar como key no React (imune a duplicatas)
      const items = (queueData.items || []).map((it, idx) => ({
        ...it,
        _rowid: [rowKey(it), String(newPage), String(idx)].join("|"),
      }));
      setClientes(items);
      setTotalClientes(queueData.total || 0);
      setNpsPorRisco(Array.isArray(nps) ? nps : []);
      setRenovacaoJanela(Array.isArray(ren) ? ren : []);
    } catch (e) {
      setErrMsg(`Erro ao carregar dados: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // // primeira carga
  // useEffect(() => {
  //   fetchAll(0);
  // }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrMsg("");
      try {
        await fetchStaticOnce();
        await fetchQueueBatched();
      } catch (e) {
        setErrMsg(`Erro ao carregar dados: ${e.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);



  // refetch quando filtros da fila mudarem (com debounce)
  const debouncedDeps = useDebounce(
    { mrrMin, mrrMax, riscoMin, riscoMax, renovacaoMin, renovacaoMax, estado },
    350
  );
  useEffect(() => {
    setPage(0);
    fetchAll(0);
  }, [debouncedDeps]);

  // paginação
  const handleNext = () => {
    const next = page + 1;
    if (next * limit < totalClientes) {
      setPage(next);
      fetchAll(next);
    }
  };
  const handlePrev = () => {
    const prev = page - 1;
    if (prev >= 0) {
      setPage(prev);
      fetchAll(prev);
    }
  };

  // =====================
  // Derivados / Métricas
  // =====================
  const receitaEmRisco = useMemo(() => {
    const row = renovacaoJanela.find((r) => r.janela === janela) || { mrr: 0 };
    return safeNum(row.mrr);
  }, [janela, renovacaoJanela]);

  const churnMax = useMemo(
    () => Math.max(0, ...monthlyTrend.map((d) => safeNum(d.churnRate))),
    [monthlyTrend]
  );
  const yLeftMax = Math.ceil(churnMax + 1);

  const wfVals = useMemo(() => mrrWaterfall.map((d) => safeNum(d.valor)), [mrrWaterfall]);
  const wfMin = useMemo(() => Math.min(0, ...wfVals), [wfVals]);
  const wfMax = useMemo(() => Math.max(0, ...wfVals), [wfVals]);

  const fila = useMemo(() =>
          (clientes || [])
              .filter((c) => safeNum(c.risco) >= riskMin)
              .filter((c) => (cat ? c.segmento === cat || c.uf === cat || c.faixa === cat : true))
              .sort((a, b) => b.risco * b.mrr - a.risco * a.mrr),
      [clientes, riskMin, cat]);

  const riskBadgeClass = (r) =>
      r >= 70 ? "bg-red-50 text-red-700" : r >= 40 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";

  const distData = useMemo(() => {
    const base = distBy[dim] || [];
    return base.map((r) => {
      const baixo = safeNum(r.baixo), medio = safeNum(r.medio), alto = safeNum(r.alto);
      const total = baixo + medio + alto;
      const baixo_pct = total ? (baixo / total) * 100 : 0;
      const medio_pct = total ? (medio / total) * 100 : 0;
      const alto_pct = total ? (alto / total) * 100 : 0;
      return { ...r, baixo_pct, medio_pct, alto_pct };
    });
  }, [dim, distBy]);

  // =====================
  // Render
  // =====================
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Linha 0 — Título + ação */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-[#0F6CBD] shadow-sm flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold leading-tight">Desafio TOTVS - Riscos & Churn</h2>
                <p className="text-xs text-slate-800">TIME FUTURAMA</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                    setLoading(true);
                    setErrMsg("");
                    try { await fetchStaticOnce(); await fetchQueueBatched(); }
                    catch(e){ setErrMsg(`Erro ao recarregar: ${e.message}`);}
                    finally { setLoading(false);}
                  }}

                className="px-2 py-1 rounded-md border border-slate-200 flex items-center gap-1 text-xs"
                title="Recarregar dados do backend"
              >
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </button>
            </div>
          </div>

          {/* Linha 1 — Filtros (desktop: wrap; não sai da tela) */}
          <div className="hidden lg:block mt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="shrink-0 whitespace-nowrap">
                <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>Últimos 6 meses</option>
                  <option>Últimos 12 meses</option>
                </select>
              </div>
              <div className="shrink-0 whitespace-nowrap">
                <select value={linha} onChange={(e) => setLinha(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>Todas</option>
                  <option>Série T</option>
                  <option>Backoffice</option>
                </select>
              </div>
              <div className="shrink-0 whitespace-nowrap">
                <select value={dim} onChange={(e) => { setDim(e.target.value); setCat(null); }} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>Segmento</option>
                  <option>UF</option>
                  <option>Faixa Faturamento</option>
                </select>
              </div>
              <div className="shrink-0 whitespace-nowrap">
                <select value={uf} onChange={(e) => setUf(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>Todas</option>
                  <option>SP</option>
                  <option>RJ</option>
                  <option>SC</option>
                </select>
              </div>
              <div className="shrink-0 whitespace-nowrap">
                <select value={faixa} onChange={(e) => setFaixa(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>Todas</option>
                  <option>Faixa 07</option>
                  <option>Faixa 08</option>
                  <option>Faixa 11</option>
                </select>
              </div>
              <div className="shrink-0 whitespace-nowrap">
                <select value={janela} onChange={(e) => setJanela(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>0–30</option>
                  <option>31–60</option>
                  <option>61–90</option>
                </select>
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>Limiar:</span>
                <input type="range" min={0} max={100} value={riskMin} onChange={(e) => setRiskMin(Number(e.target.value) || 0)} />
                <span className="w-6 text-right font-medium">{riskMin}</span>
              </div>

              {/* Novos filtros */}
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>MRR Min:</span>
                <input type="number" min={0} max={999999999} value={mrrMin} onChange={(e) => setMrrMin(clamp(toNum(e.target.value, 0), 0, 999999999))} className="border border-slate-200 rounded-md px-2 py-1 w-24" />
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>MRR Max:</span>
                <input type="number" min={0} max={999999999} value={mrrMax} onChange={(e) => setMrrMax(clamp(toNum(e.target.value, 999999999), 0, 999999999))} className="border border-slate-200 rounded-md px-2 py-1 w-24" />
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>Risco Min:</span>
                <input type="number" min={0} max={100} value={riscoMin} onChange={(e) => setRiscoMin(clamp(toNum(e.target.value, 0), 0, 100))} className="border border-slate-200 rounded-md px-2 py-1 w-20" />
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>Risco Max:</span>
                <input type="number" min={0} max={100} value={riscoMax} onChange={(e) => setRiscoMax(clamp(toNum(e.target.value, 100), 0, 100))} className="border border-slate-200 rounded-md px-2 py-1 w-20" />
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>Dias Renov. Min:</span>
                <input type="number" min={0} max={3650} value={renovacaoMin} onChange={(e) => setRenovacaoMin(clamp(toNum(e.target.value, 0), 0, 3650))} className="border border-slate-200 rounded-md px-2 py-1 w-24" />
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>Dias Renov. Max:</span>
                <input type="number" min={0} max={3650} value={renovacaoMax} onChange={(e) => setRenovacaoMax(clamp(toNum(e.target.value, 3650), 0, 3650))} className="border border-slate-200 rounded-md px-2 py-1 w-24" />
              </div>
              <div className="shrink-0 whitespace-nowrap flex items-center gap-2">
                <span>Estado:</span>
                <select value={estado} onChange={(e) => setEstado(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1">
                  <option>Todas</option>
                  <option>SP</option>
                  <option>RJ</option>
                  <option>SC</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {!!errMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4">
            {errMsg}
          </div>
        )}

        {/* Linha 1 — KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-1">
              <h2 className="text-sm font-semibold">Churn de Logos</h2>
              <InfoBadge text="Cancelamentos ÷ base inicial; inclui apenas churn." />
            </div>
            <p className="text-3xl font-bold">{pct(kpisExtra?.churn_logos_pct, 1)}</p>
            <p className="text-xs text-slate-500">vs. benchmark: 5%</p>
          </div>
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-1">
              <h2 className="text-sm font-semibold">Receita em Risco</h2>
              <InfoBadge text="MRR agregado com risco ≥ limiar e na janela selecionada." />
            </div>
            <p className="text-3xl font-bold">{fmtBRL(receitaEmRisco)}</p>
            <p className="text-xs text-slate-500">Clientes em risco: {safeNum(kpisExtra?.clientes_em_risco)}</p>
          </div>
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-1">
              <h2 className="text-sm font-semibold">Save Rate</h2>
              <InfoBadge text="Salvamentos ÷ receita em risco; métrica de sucesso do playbook." />
            </div>
            <p className="text-3xl font-bold">{pct(kpisExtra?.save_rate_pct, 1)}</p>
            <p className="text-xs text-slate-500">vs. target: 20%</p>
          </div>
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-1">
              <h2 className="text-sm font-semibold">NRR</h2>
              <InfoBadge text="Net Revenue Retention; (MRR_fim – novos) ÷ MRR_início." />
            </div>
            <p className="text-3xl font-bold">{pct(kpisExtra?.nrr_pct, 1)}</p>
            <p className="text-xs text-slate-500">vs. benchmark: 105%</p>
          </div>
        </section>

        {/* Linha 2 — Tendência & Waterfall */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Tendência mensal</h2>
              <InfoBadge text="Churn de logos e receita (eixo esq.); GRR e NRR (eixo dir.)." />
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" />
                  <YAxis yAxisId="left" domain={[0, yLeftMax]} />
                  <YAxis yAxisId="right" orientation="right" domain={[50, 150]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="churnRate" yAxisId="left" name="Churn Logos" fill="#D32F2F" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="revChurn" yAxisId="left" name="Churn Receita" fill="#F28E2B" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="grr" yAxisId="right" name="GRR" stroke="#2E7D32" strokeWidth={2} />
                  <Line type="monotone" dataKey="nrr" yAxisId="right" name="NRR" stroke="#0F6CBD" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Waterfall MRR</h2>
              <InfoBadge text="Movimentação de MRR: início → churn/contração → expansão/novos → fim." />
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mrrWaterfall}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="etapa" />
                  <YAxis type="number" domain={[wfMin * 1.1, wfMax * 1.1]} tickFormatter={(v) => fmtBRL(v)} />
                  <Tooltip formatter={(v) => fmtBRL(v)} />
                  <Bar dataKey="valor" name="Valor" radius={[6, 6, 0, 0]}>
                    {mrrWaterfall.map((d, i) => (
                      <Cell key={`wf-${i}`} fill={d.valor >= 0 ? "#2E7D32" : "#D32F2F"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Linha 3 — Distribuição por dimensão */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
          <div className="flex items-center mb-2">
            <h2 className="text-sm font-semibold">Distribuição de risco por {dim}</h2>
            <InfoBadge text="Clientes/MRR por categoria de risco, segmentado por dimensão." />
            <select value={distMetric} onChange={(e) => setDistMetric(e.target.value)} className="ml-auto border border-slate-200 rounded-md px-2 py-1 text-xs">
              <option value="percent">Porcentagem</option>
              <option value="mrr">MRR</option>
            </select>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="cat" />
                <YAxis type="number" domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey={distMetric === "percent" ? "baixo_pct" : "mrr_baixo"} stackId="a" name="Baixo" fill="#2E7D32" />
                <Bar dataKey={distMetric === "percent" ? "medio_pct" : "mrr_medio"} stackId="a" name="Médio" fill="#F9A825" />
                <Bar dataKey={distMetric === "percent" ? "alto_pct" : "mrr_alto"} stackId="a" name="Alto" fill="#D32F2F" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Linha 4 — Temas & NPS por risco */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Top temas de risco</h2>
              <InfoBadge text="Ranking de motivos de risco, com % de contribuição." />
            </div>
            <div className="h-56 flex items-center justify-center text-xs text-slate-500">
              Sem ranking de temas no momento.
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">NPS por risco</h2>
              <InfoBadge text="NPS médio por categoria de risco." />
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={npsPorRisco}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="risco" />
                  <YAxis type="number" domain={[0, 10]} />
                  <Tooltip />
                  <Bar dataKey="nps" name="NPS" radius={[6, 6, 0, 0]}>
                    {npsPorRisco.map((r, i) => (
                      <Cell key={`nps-${r.risco}-${i}`} fill={r.risco === "Alto" ? "#D32F2F" : r.risco === "Médio" ? "#F9A825" : "#2E7D32"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Linha 5 — Coortes & Renovação */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Coortes (mock) — retenção por mês de entrada</h2>
              <InfoBadge text="Placeholder visual; substitua por dados reais quando disponíveis." />
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px]">
              {Array.from({ length: 7 }).map((_, r) => (
                <React.Fragment key={`c-frag-${r}`}>
                  {Array.from({ length: 7 }).map((_, c) => {
                    const val = Math.max(0.4, 1 - (r * 0.09 + c * 0.06));
                    const bg = `rgba(15,108,189,${val})`;
                    return (
                      <div key={`c-${r}-${c}`} className="h-8 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: bg }}>
                        {Math.round(val * 100)}%
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
              <InfoBadge text="MRR agregado por janela (0–30 / 31–60 / 61–90)." />
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={renovacaoJanela}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="janela" />
                  <YAxis type="number" tickFormatter={(v) => fmtBRL(v)} />
                  <Tooltip formatter={(v) => fmtBRL(v)} />
                  <Bar dataKey="mrr" name="MRR em risco" fill="#F28E2B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Linha extra — Scatter com clusters de clientes (usa base da fila) */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
          <div className="flex items-center mb-2">
            <h2 className="text-sm font-semibold">Clusters — Dispersão de clientes (Risco × MRR)</h2>
            <InfoBadge text="Pontos coloridos por cluster; auxilia a ver padrões/segmentação." />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis type="number" dataKey="risco" name="Risco" domain={[0, 100]} />
                <YAxis type="number" dataKey="mrr" name="MRR" tickFormatter={(v) => fmtBRL(v)} />
                <ZAxis type="number" dataKey="mrr" range={[60, 200]} />
                <Tooltip formatter={(v, n) => (n === "mrr" ? fmtBRL(v) : String(v))} />
                <Scatter name="Clientes" data={clientes}>
                  {clientes.map((c, i) => (
                    <Cell key={`sc-${c._rowid ?? i}`} fill="#0F6CBD" />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Linha 6 — Fila priorizada */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200">
          <div className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="text-sm font-semibold">Fila priorizada — agir agora</h2>
              <InfoBadge text="Ordenada por impacto (Risco × MRR)." />
            </div>
            <div className="text-xs text-slate-500">ordenada por Risco × MRR</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  {[
                    "Cliente",
                    "MRR",
                    "Risco",
                    "Cluster",
                    "Dias p/ renov.",
                    "Uso 30d",
                    "Tickets 30d",
                    "%SLA",
                    "NPS",
                    "Top motivos",
                    "Playbook",
                    "Dono",
                    "Status",
                    "Últ. ação",
                    "Próx. passo",
                  ].map((h, i) => (
                    <th key={`th-${i}`} className="px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fila.map((r, i) => (
                  <tr key={`row-${r._rowid ?? i}`}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelecionado(r)}>
                    <td className="px-3 py-2 font-medium">{r.cliente}</td>
                    <td className="px-3 py-2">{fmtBRL(r.mrr)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${riskBadgeClass(r.risco)}`}>{r.risco}</span>
                    </td>
                    <td className="px-3 py-2">{r.cluster}</td>
                    <td className="px-3 py-2">{r.renovacao}</td>
                    <td className="px-3 py-2">{r.uso30 ?? "-"}</td>
                    <td className="px-3 py-2">{r.tickets30 ?? "-"}</td>
                    <td className="px-3 py-2">{r.sla != null ? `${r.sla}%` : "-"}</td>
                    <td className="px-3 py-2">{r.nps ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{Array.isArray(r.motivos) ? r.motivos.join(', ') : (String(r.motivos ?? '').replace(/;/g, ', ') || '—')}</td>
                    <td className="px-3 py-2">{r.playbook || '—'}</td>
                    <td className="px-3 py-2">{r.dono || '—'}</td>
                    <td className="px-3 py-2">Em aberto</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2">
                      <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[#0F6CBD] text-white hover:opacity-90">
                        Abrir <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {fila.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={15}>
                      Nenhum registro com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 flex justify-between items-center text-sm">
            <button onClick={handlePrev} disabled={page === 0} className="px-3 py-1.5 bg-slate-100 rounded-md disabled:opacity-50">
              Anterior
            </button>
            <span>Página {page + 1} de {Math.max(1, Math.ceil(totalClientes / limit))}</span>
            <button onClick={handleNext} disabled={(page + 1) * limit >= totalClientes} className="px-3 py-1.5 bg-slate-100 rounded-md disabled:opacity-50">
              Próximo
            </button>
          </div>
        </section>

        {/* Painel lateral de detalhes */}
        {selecionado && (
          <aside className="fixed right-3 bottom-3 top-16 w-[380px] bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">{selecionado.cliente}</h3>
                <p className="text-xs text-slate-500">{selecionado.segmento} • {selecionado.uf} • {selecionado.faixa}</p>
              </div>
              <button onClick={() => setSelecionado(null)} className="text-xs px-2 py-1 rounded-md border border-slate-200">
                Fechar
              </button>
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
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={`sp-1-${i}`} className="w-3 bg-[#0F6CBD] rounded" style={{ height: `${40 + Math.round(30 * Math.sin(i / 2 + 3))}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500 mb-1">Tickets 90d (sparkline)</p>
                <div className="flex gap-1 items-end h-12">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={`sp-2-${i}`} className="w-3 bg-slate-400 rounded" style={{ height: `${60 + Math.round(30 * Math.sin(i / 2 + 1))}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500">Playbook recomendado</p>
                <p>{selecionado.playbook || "—"}</p>
              </div>
            </div>
          </aside>
        )}

        {/* Rodapé API_ROOT— Definições */}
        <section className="text-xs text-slate-500 px-1">
          <p>
            *Definições:* Churn de logos = cancelamentos ÷ base inicial; Gross Revenue Churn = perdas
            (churn+contração); GRR = (MRR_fim – expansão – novos) ÷ MRR_início; NRR = (MRR_fim – novos) ÷
            MRR_início; Receita em Risco = Σ MRR com score ≥ limiar e na janela; Save Rate = salvos ÷ em risco.
          </p>
        </section>
      </main>
    </div>
  );
}
