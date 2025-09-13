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

const API = import.meta.env.VITE_API_BASE
  ? `${import.meta.env.VITE_API_BASE}/api/churn`
  : `/api/churn`;

// ====== Utils ======
const safeNum = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(safeNum(v));
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

  // DATA (carregados via API)
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [mrrWaterfall, setMrrWaterfall] = useState([]);
  const [distBy, setDistBy] = useState({ Segmento: [], UF: [], "Faixa Faturamento": [] });
  const [clientes, setClientes] = useState([]); // fila priorizada
  const [npsPorRisco, setNpsPorRisco] = useState([]);
  const [renovacaoJanela, setRenovacaoJanela] = useState([]);
  const [kpisExtra, setKpisExtra] = useState(null); // opcional (kpis_summary)

  // Loading & erro
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  console.log("Iniciou carregamento");

  const fetchAll = async () => {
    setLoading(true);
    setErrMsg("");
    try {
      console.log("Iniciando requisições para APIs...");
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
        fetch(`${API}/kpis`).then(res => {
          console.log(`Resposta /kpis: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/trend`).then(res => {
          console.log(`Resposta /trend: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/waterfall`).then(res => {
          console.log(`Resposta /waterfall: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/summary?dim=segmento`).then(res => {
          console.log(`Resposta /summary?dim=segmento: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/summary?dim=uf`).then(res => {
          console.log(`Resposta /summary?dim=uf: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/summary?dim=faixa`).then(res => {
          console.log(`Resposta /summary?dim=faixa: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/queue`).then(res => {
          console.log(`Resposta /queue: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/nps_risco`).then(res => {
          console.log(`Resposta /nps_risco: Status ${res.status}`, res);
          return res;
        }),
        fetch(`${API}/renovacao`).then(res => {
          console.log(`Resposta /renovacao: Status ${res.status}`, res);
          return res;
        }),
      ]);

      // 404/500 → lança para cair no catch
      const assertOk = async (r, endpoint) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = await r.json();
        console.log(`Dados recebidos de ${endpoint}:`, data);
        return data;
      };

      const [
        kpis,
        trend,
        wf,
        bySeg,
        byUF,
        byFx,
        queue,
        nps,
        ren,
      ] = await Promise.all([
        assertOk(kpisRes, '/kpis').catch(e => {
          console.error(`Erro ao processar /kpis: ${e.message}`);
          return {};
        }),
        assertOk(trendRes, '/trend').catch(e => {
          console.error(`Erro ao processar /trend: ${e.message}`);
          return [];
        }),
        assertOk(wfRes, '/waterfall').catch(e => {
          console.error(`Erro ao processar /waterfall: ${e.message}`);
          return [];
        }),
        assertOk(bySegRes, '/summary?dim=segmento').catch(e => {
          console.error(`Erro ao processar /summary?dim=segmento: ${e.message}`);
          return [];
        }),
        assertOk(byUFRes, '/summary?dim=uf').catch(e => {
          console.error(`Erro ao processar /summary?dim=uf: ${e.message}`);
          return [];
        }),
        assertOk(byFxRes, '/summary?dim=faixa').catch(e => {
          console.error(`Erro ao processar /summary?dim=faixa: ${e.message}`);
          return [];
        }),
        assertOk(queueRes, '/queue').catch(e => {
          console.error(`Erro ao processar /queue: ${e.message}`);
          return [];
        }),
        assertOk(npsRes, '/nps_risco').catch(e => {
          console.error(`Erro ao processar /nps_risco: ${e.message}`);
          return [];
        }),
        assertOk(renRes, '/renovacao').catch(e => {
          console.error(`Erro ao processar /renovacao: ${e.message}`);
          return [];
        }),
      ]);

      setKpisExtra(kpis || null);
      console.log('Estado kpisExtra atualizado:', kpis || null);
      setMonthlyTrend(Array.isArray(trend) ? trend : []);
      console.log('Estado monthlyTrend atualizado:', Array.isArray(trend) ? trend : []);
      setMrrWaterfall(Array.isArray(wf) ? wf : []);
      console.log('Estado mrrWaterfall atualizado:', Array.isArray(wf) ? wf : []);
      setDistBy({
        Segmento: Array.isArray(bySeg) ? bySeg : [],
        UF: Array.isArray(byUF) ? byUF : [],
        "Faixa Faturamento": Array.isArray(byFx) ? byFx : [],
      });
      console.log('Estado distBy atualizado:', {
        Segmento: Array.isArray(bySeg) ? bySeg : [],
        UF: Array.isArray(byUF) ? byUF : [],
        "Faixa Faturamento": Array.isArray(byFx) ? byFx : [],
      });
      setClientes(Array.isArray(queue) ? queue : []);
      console.log('Estado clientes atualizado:', Array.isArray(queue) ? queue : []);
      setNpsPorRisco(Array.isArray(nps) ? nps : []);
      console.log('Estado npsPorRisco atualizado:', Array.isArray(nps) ? nps : []);
      setRenovacaoJanela(Array.isArray(ren) ? ren : []);
      console.log('Estado renovacaoJanela atualizado:', Array.isArray(ren) ? ren : []);
    } catch (e) {
      setErrMsg(`Erro ao carregar dados: ${e.message}`);
      console.error('Erro geral no fetchAll:', e.message);
    } finally {
      setLoading(false);
      console.log('Carregamento finalizado, loading:', false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KPI: receita em risco (usa janela da tabela renovacao)
  const receitaEmRisco = useMemo(() => {
    const row = renovacaoJanela.find((r) => r.janela === janela) || { mrr: 0 };
    return safeNum(row.mrr);
  }, [janela, renovacaoJanela]);

  // Tendência
  const churnMax = useMemo(
    () => Math.max(0, ...monthlyTrend.map((d) => safeNum(d.churnRate))),
    [monthlyTrend]
  );
  const yLeftMax = Math.ceil(churnMax + 1);
  const wfVals = useMemo(() => mrrWaterfall.map((d) => safeNum(d.valor)), [mrrWaterfall]);
  const wfMin = useMemo(() => Math.min(0, ...wfVals), [wfVals]);
  const wfMax = useMemo(() => Math.max(0, ...wfVals), [wfVals]);

  // Distribuição transform (percentuais)
  const distData = useMemo(() => {
    const base = distBy[dim] || [];
    return base.map((r) => {
      const baixo = safeNum(r.baixo);
      const medio = safeNum(r.medio);
      const alto = safeNum(r.alto);
      const total = baixo + medio + alto;
      const baixo_pct = total ? (baixo / total) * 100 : 0;
      const medio_pct = total ? (medio / total) * 100 : 0;
      const alto_pct = total ? (alto / total) * 100 : 0;
      return {
        ...r,
        baixo_pct,
        medio_pct,
        alto_pct,
      };
    });
  }, [dim, distBy]);

  // Fila priorizada (ordena por risco*MRR e filtra por risco mínimo + cat opcional)
  const fila = useMemo(() => {
    return (clientes || [])
      .filter((c) => safeNum(c.risco) >= riskMin)
      .filter((c) => (cat ? c.segmento === cat || c.uf === cat || c.faixa === cat : true))
      .sort((a, b) => b.risco * b.mrr - a.risco * a.mrr);
  }, [clientes, riskMin, cat]);

  // Badge de risco
  const riskBadgeClass = (r) =>
    r >= 70
      ? "bg-red-50 text-red-700"
      : r >= 40
      ? "bg-amber-50 text-amber-700"
      : "bg-emerald-50 text-emerald-700";

  // Painel lateral (mini-sparklines fake)
  const spark = (n) =>
    Array.from({ length: n }, (_, i) => 40 + Math.round(30 * Math.sin(i / 2 + (n % 5))));

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
              <h2 className="text-xl font-semibold leading-tight">Desafio TOTVS - Riscos & Churn</h2>
              <p className="text-xs text-slate-800">TIME FUTURAMA</p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1"
            >
              <option>Últimos 6 meses</option>
              <option>Últimos 12 meses</option>
            </select>
            <select
              value={linha}
              onChange={(e) => setLinha(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1"
            >
              <option>Todas</option>
              <option>Série T</option>
              <option>Backoffice</option>
            </select>
            <select
              value={dim}
              onChange={(e) => {
                setDim(e.target.value);
                setCat(null);
              }}
              className="border border-slate-200 rounded-md px-2 py-1"
            >
              <option>Segmento</option>
              <option>UF</option>
              <option>Faixa Faturamento</option>
            </select>
            <select
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1"
            >
              <option>Todas</option>
              <option>SP</option>
              <option>RJ</option>
              <option>SC</option>
            </select>
            <select
              value={faixa}
              onChange={(e) => setFaixa(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1"
            >
              <option>Todas</option>
              <option>Faixa 07</option>
              <option>Faixa 08</option>
              <option>Faixa 11</option>
            </select>
            <select
              value={janela}
              onChange={(e) => setJanela(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1"
            >
              <option>0–30</option>
              <option>31–60</option>
              <option>61–90</option>
            </select>
            <div className="flex items-center gap-2">
              <span>Limiar:</span>
              <input
                type="range"
                min={0}
                max={100}
                value={riskMin}
                onChange={(e) => setRiskMin(+e.target.value)}
              />
              <span className="w-6 text-right font-medium">{riskMin}</span>
            </div>
            <button
              onClick={() => {}}
              className="px-2 py-1 rounded-md border border-slate-200 flex items-center gap-1"
              title="Mais filtros visuais (placeholder)"
            >
              <Filter className="h-4 w-4" /> Filtros
            </button>
            <button
              onClick={fetchAll}
              className="px-2 py-1 rounded-md border border-slate-200 flex items-center gap-1"
              title="Recarregar dados do backend"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {/* Erro de dados */}
        {!!errMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4">
            {errMsg}
          </div>
        )}
        {/* Resto do JSX permanece inalterado */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
            <div className="flex items-center mb-2">
              <h2 className="text-sm font-semibold">Coortes (mock visual) — retenção por mês de entrada</h2>
              <InfoBadge text="Representação visual placeholder; dados reais podem substituir futuramente." />
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px]">
              {[...Array(7)].map((_, r) => (
                <React.Fragment key={r}>
                  {[...Array(7)].map((_, c) => {
                    const val = Math.max(0.4, 1 - (r * 0.09 + c * 0.06));
                    const bg = `rgba(15,108,189,${val})`;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className="h-8 rounded-md flex items-center justify-center text-white"
                        style={{ backgroundColor: bg }}
                      >
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

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
          <div className="flex items-center mb-2">
            <h2 className="text-sm font-semibold">Clusters — Dispersão de clientes (Risco × MRR)</h2>
            <InfoBadge text="Pontos coloridos por cluster; ajuda a ver padrões e separação dos grupos." />
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
                    <Cell key={i} fill={clusterColors[c.cluster] || "#0F6CBD"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="text-sm font-semibold">Fila priorizada — agir agora</h2>
              <InfoBadge text="Ordenada por impacto (Risco × MRR). Ações rápidas: playbook, contato, follow-up." />
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
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fila.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelecionado(r)}
                  >
                    <td className="px-3 py-2 font-medium">{r.cliente}</td>
                    <td className="px-3 py-2">{fmtBRL(r.mrr)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${riskBadgeClass(r.risco)}`}>
                        {r.risco}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.cluster}</td>
                    <td className="px-3 py-2">{r.renovacao}</td>
                    <td className="px-3 py-2">{r.uso30 ?? "-"}</td>
                    <td className="px-3 py-2">{r.tickets30 ?? "-"}</td>
                    <td className="px-3 py-2">{r.sla ?? "-"}{r.sla != null ? "%" : ""}</td>
                    <td className="px-3 py-2">{r.nps ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {Array.isArray(r.motivos)
                        ? r.motivos.join(", ")
                        : (String(r.motivos ?? "").replace(/;/g, ", ") || "—")}
                    </td>
                    <td className="px-3 py-2">{r.playbook || "—"}</td>
                    <td className="px-3 py-2">{r.dono || "—"}</td>
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
        </section>

        {selecionado && (
          <aside className="fixed right-3 bottom-3 top-16 w-[380px] bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">{selecionado.cliente}</h3>
                <p className="text-xs text-slate-500">
                  {selecionado.segmento} • {selecionado.uf} • {selecionado.faixa}
                </p>
              </div>
              <button
                onClick={() => setSelecionado(null)}
                className="text-xs px-2 py-1 rounded-md border border-slate-200"
              >
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
                  {spark(20).map((h, i) => (
                    <div key={i} className="w-3 bg-[#0F6CBD] rounded" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500 mb-1">Tickets 90d (sparkline)</p>
                <div className="flex gap-1 items-end h-12">
                  {spark(20).map((h, i) => (
                    <div key={i} className="w-3 bg-slate-400 rounded" style={{ height: `${100 - h}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 col-span-2">
                <p className="text-slate-500">Playbook recomendado</p>
                <p className="">{selecionado.playbook || "—"}</p>
              </div>
            </div>
          </aside>
        )}

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