import React, { useState, useEffect } from "react";
import {
  useGetBotStatus,
  useGetCurrentMarket,
  useGetSignals,
  useGetCalendar,
  useStartBot,
  useStopBot,
  useTriggerAnalysis,
  getGetBotStatusQueryKey,
  getGetSignalsQueryKey,
  getGetCurrentMarketQueryKey,
  getGetCalendarQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Play, Square, Activity, Clock, TrendingUp, TrendingDown, Minus,
  RefreshCw, Target, Shield, AlertTriangle, CheckCircle, Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(value);
}

function formatWIBTime(dateString: string) {
  try {
    return format(new Date(dateString), "dd MMM yyyy HH:mm", { locale: id }) + " WIB";
  } catch {
    return dateString;
  }
}

function formatWIBShort(dateString: string) {
  try {
    return format(new Date(dateString), "HH:mm", { locale: id }) + " WIB";
  } catch {
    return dateString;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeBadge({ mode, paused }: { mode?: string; paused?: boolean }) {
  if (paused) {
    return (
      <Badge className="text-sm px-3 py-1 bg-yellow-600/20 text-yellow-400 border-yellow-600/30 font-mono">
        ⏸ DIJEDA
      </Badge>
    );
  }
  if (mode === "MONITORING") {
    return (
      <Badge className="text-sm px-3 py-1 bg-orange-500/20 text-orange-400 border-orange-500/30 font-mono animate-pulse">
        🔭 MONITORING
      </Badge>
    );
  }
  return (
    <Badge className="text-sm px-3 py-1 bg-blue-500/20 text-blue-400 border-blue-500/30 font-mono animate-pulse">
      🔍 ANALYZING
    </Badge>
  );
}

function WinRateBadge({ wins, losses, rate }: { wins: number; losses: number; rate: number }) {
  const color = rate >= 60 ? "text-green-400" : rate >= 40 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-3">
      <div className="text-center">
        <div className="text-xl font-bold font-mono text-green-400">{wins}W</div>
        <div className="text-xs text-muted-foreground">WIN</div>
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{rate}%</div>
      <div className="text-center">
        <div className="text-xl font-bold font-mono text-red-400">{losses}L</div>
        <div className="text-xs text-muted-foreground">LOSS</div>
      </div>
    </div>
  );
}

// ─── Active Signal Monitor Panel ──────────────────────────────────────────────

function ActiveSignalMonitor({
  activeSignal,
  monitorState,
  currentPrice,
}: {
  activeSignal: { decision: string; entry_price?: number | null; take_profit?: number | null; stop_loss?: number | null; timestamp: string } | null;
  monitorState: { tp1: number; tp2: number; trailingSL: number; tp1Hit: boolean } | null;
  currentPrice?: number;
}) {
  if (!activeSignal || !monitorState) return null;

  const entry = activeSignal.entry_price ?? 0;
  const { tp1, tp2, trailingSL, tp1Hit } = monitorState;
  const current = currentPrice ?? entry;
  const isBuy = activeSignal.decision === "BUY";

  // Progress calculation: how far price has moved toward TP2 from entry
  const totalRange = Math.abs(tp2 - entry);
  const currentMove = isBuy ? current - entry : entry - current;
  const progressToTP2 = totalRange > 0 ? Math.max(0, Math.min(100, (currentMove / totalRange) * 100)) : 0;
  const progressToTP1 = totalRange > 0 ? Math.max(0, Math.min(100, (Math.abs((isBuy ? tp1 : entry - (entry - tp1)) - entry) / totalRange) * 100)) : 50;

  const pipsSoFar = isBuy ? current - entry : entry - current;
  const pipsToTP2 = isBuy ? tp2 - current : current - tp2;

  return (
    <Card className="border-orange-500/30 bg-orange-500/5 shadow-lg shadow-orange-500/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono text-orange-400 flex items-center gap-2">
            <Target className="w-4 h-4 animate-pulse" />
            MONITORING AKTIF — {activeSignal.decision} XAUUSD
          </CardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            Sejak {formatWIBShort(activeSignal.timestamp)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-background/50 rounded p-2 border border-border">
            <div className="text-[10px] text-muted-foreground font-mono mb-1">ENTRY</div>
            <div className="text-sm font-mono font-bold">{formatCurrency(entry)}</div>
          </div>
          <div className={`rounded p-2 border ${tp1Hit ? "bg-green-500/20 border-green-500/40" : "bg-background/50 border-border"}`}>
            <div className="text-[10px] text-yellow-400/70 font-mono mb-1">TP1 (50%)</div>
            <div className="text-sm font-mono font-bold text-yellow-300">{formatCurrency(tp1)}</div>
            {tp1Hit && <div className="text-[9px] text-green-400 font-mono">✅ HIT</div>}
          </div>
          <div className="bg-green-500/10 rounded p-2 border border-green-500/30">
            <div className="text-[10px] text-green-400/70 font-mono mb-1">TP2 (FINAL)</div>
            <div className="text-sm font-mono font-bold text-green-300">{formatCurrency(tp2)}</div>
          </div>
          <div className={`rounded p-2 border ${tp1Hit ? "bg-blue-500/20 border-blue-500/40" : "bg-red-500/10 border-red-500/30"}`}>
            <div className="text-[10px] font-mono mb-1" style={{ color: tp1Hit ? "#60a5fa" : "#f87171", fontSize: "9px" }}>
              {tp1Hit ? "SL (BREAKEVEN)" : "STOP LOSS"}
            </div>
            <div className={`text-sm font-mono font-bold ${tp1Hit ? "text-blue-300" : "text-red-300"}`}>
              {formatCurrency(trailingSL)}
            </div>
            {tp1Hit && <div className="text-[9px] text-blue-400 font-mono">🛡️ Modal aman</div>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>Progress ke TP2</span>
            <span className={pipsSoFar >= 0 ? "text-green-400" : "text-red-400"}>
              {pipsSoFar >= 0 ? "+" : ""}{pipsSoFar.toFixed(2)} pip ({pipsToTP2.toFixed(2)} lagi)
            </span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            {/* TP1 marker at 50% */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/60 z-10" style={{ left: "50%" }} />
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(progressToTP2, 100)}%`,
                background: tp1Hit
                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                  : "linear-gradient(90deg, #f59e0b, #fbbf24)",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>Entry</span>
            <span className="text-yellow-400">TP1</span>
            <span className="text-green-400">TP2</span>
          </div>
        </div>

        {currentPrice && (
          <div className="flex items-center justify-between border-t border-border/50 pt-2">
            <span className="text-xs text-muted-foreground font-mono">Harga Sekarang</span>
            <span className={`text-base font-bold font-mono ${pipsSoFar >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatCurrency(currentPrice)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Calendar Card ────────────────────────────────────────────────────────────

function CalendarCard() {
  const { data: calendar } = useGetCalendar({ query: { queryKey: getGetCalendarQueryKey(), refetchInterval: 5 * 60 * 1000 } });

  if (!calendar) return null;

  const alertColor =
    calendar.alertLevel === "HIGH_ALERT"
      ? "border-red-500/40 bg-red-500/5"
      : calendar.alertLevel === "CAUTION"
        ? "border-yellow-500/40 bg-yellow-500/5"
        : "border-green-500/20 bg-green-500/5";

  const alertBadge =
    calendar.alertLevel === "HIGH_ALERT" ? (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono">🚨 HIGH ALERT</Badge>
    ) : calendar.alertLevel === "CAUTION" ? (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-mono">⚡ CAUTION</Badge>
    ) : (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono">✅ CLEAR</Badge>
    );

  const upcoming = calendar.upcomingEvents?.slice(0, 3) ?? [];
  const today = calendar.todayEvents?.slice(0, 5) ?? [];

  return (
    <Card className={`border ${alertColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground font-mono flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            KALENDER EKONOMI
          </CardTitle>
          {alertBadge}
        </div>
        {calendar.alertMessage && (
          <p className="text-xs text-muted-foreground mt-1">{calendar.alertMessage}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.length > 0 && (
          <div>
            <div className="text-[10px] font-mono text-orange-400 mb-1">⏰ DALAM 4 JAM KE DEPAN:</div>
            {upcoming.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                <span className="font-mono text-foreground/80 flex-1 truncate">{e.title}</span>
                <Badge className="ml-2 text-[9px] bg-red-500/20 text-red-400 border-red-500/20">{e.country}</Badge>
              </div>
            ))}
          </div>
        )}
        {today.length > 0 && upcoming.length === 0 && (
          <div>
            <div className="text-[10px] font-mono text-muted-foreground mb-1">HIGH IMPACT HARI INI:</div>
            {today.slice(0, 4).map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                <span className="font-mono text-foreground/60 flex-1 truncate">{e.title}</span>
                <Badge className="ml-2 text-[9px]" variant="outline">{e.country}</Badge>
              </div>
            ))}
          </div>
        )}
        {upcoming.length === 0 && today.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono">Tidak ada event high-impact hari ini.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: marketData } = useGetCurrentMarket({ query: { queryKey: getGetCurrentMarketQueryKey(), refetchInterval: 3000 } });
  const { data: botStatus, isLoading: statusLoading } = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 5000 } });
  const { data: signals, isLoading: signalsLoading } = useGetSignals({ limit: 20 }, { query: { queryKey: getGetSignalsQueryKey({ limit: 20 }), refetchInterval: 10000 } });

  const startBot = useStartBot({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() }) },
  });
  const stopBot = useStopBot({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() }) },
  });
  const triggerAnalysis = useTriggerAnalysis({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSignalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
    },
  });

  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (botStatus?.nextAnalysisIn !== undefined && botStatus?.nextAnalysisIn !== null) {
      setCountdown(botStatus.nextAnalysisIn);
    }
  }, [botStatus?.nextAnalysisIn]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => setCountdown((p) => (p ? p - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const isMonitoring = botStatus?.mode === "MONITORING";
  const lastSignal = botStatus?.lastSignal;
  const winRate = botStatus?.winRate;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <Activity className="w-6 h-6" />
              XAUUSD AI Agent Terminal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Atlas — Sistem Perdagangan Otonom Real-time</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Mode Badge */}
            <ModeBadge mode={botStatus?.mode} paused={botStatus?.paused} />

            {/* Status */}
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground font-mono">STATUS</span>
              {botStatus?.running ? (
                <Badge className="bg-green-600/20 text-green-500 border-green-600/30">AKTIF</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">BERHENTI</Badge>
              )}
            </div>

            <Button
              variant={botStatus?.running ? "destructive" : "default"}
              onClick={() => (botStatus?.running ? stopBot.mutate() : startBot.mutate())}
              disabled={startBot.isPending || stopBot.isPending || statusLoading}
              className="font-mono text-xs w-32"
            >
              {botStatus?.running ? (
                <><Square className="w-4 h-4 mr-2" /> HENTIKAN</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> JALANKAN</>
              )}
            </Button>
          </div>
        </header>

        {/* Active Signal Monitor — full width when MONITORING */}
        {isMonitoring && botStatus?.activeSignal && (
          <ActiveSignalMonitor
            activeSignal={botStatus.activeSignal}
            monitorState={botStatus.monitorState ?? null}
            currentPrice={marketData?.current_price}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column */}
          <div className="lg:col-span-1 space-y-6">

            {/* Market Data */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-mono">MARKET XAUUSD</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold font-mono tracking-tighter text-primary">
                  {marketData ? formatCurrency(marketData.current_price) : "..."}
                </div>
                <div className="flex gap-4 mt-4 text-sm font-mono border-t border-border pt-4">
                  <div>
                    <span className="text-muted-foreground block text-xs">BID</span>
                    <span className="text-red-400">{marketData?.bid ? formatCurrency(marketData.bid) : "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">ASK</span>
                    <span className="text-green-400">{marketData?.ask ? formatCurrency(marketData.ask) : "-"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Status */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground font-mono">STATUS ANALISIS</CardTitle>
                <Clock className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground font-mono mb-1">Mode Saat Ini</div>
                  <ModeBadge mode={botStatus?.mode} paused={botStatus?.paused} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono mb-1">Analisis Terakhir</div>
                  <div className="text-sm font-mono">
                    {botStatus?.lastAnalysis ? formatWIBTime(botStatus.lastAnalysis) : "-"}
                  </div>
                </div>

                {botStatus?.running && !isMonitoring && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground font-mono">Analisis Berikutnya</span>
                      <span className="text-sm font-mono text-primary">{countdown !== null ? `${countdown}s` : "-"}</span>
                    </div>
                    <Progress value={countdown !== null ? ((60 - (countdown % 60)) / 60) * 100 : 0} className="h-1 bg-muted" />
                  </div>
                )}

                {isMonitoring && (
                  <div className="text-xs text-orange-400 font-mono animate-pulse">
                    ⏳ Menunggu TP1/TP2/SL trigger...
                  </div>
                )}

                <Button
                  className="w-full mt-2 font-mono text-xs"
                  variant="outline"
                  onClick={() => triggerAnalysis.mutate()}
                  disabled={triggerAnalysis.isPending || !botStatus?.running || isMonitoring}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${triggerAnalysis.isPending ? "animate-spin" : ""}`} />
                  ANALISIS SEKARANG
                </Button>
              </CardContent>
            </Card>

            {/* Win Rate */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-mono">PERFORMA ATLAS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {winRate && (winRate.wins + winRate.losses) > 0 ? (
                  <>
                    <div className="flex justify-center py-2">
                      <WinRateBadge wins={winRate.wins} losses={winRate.losses} rate={winRate.rate} />
                    </div>
                    <div className="relative h-2 bg-red-900/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-500"
                        style={{ width: `${winRate.rate}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground text-center font-mono">
                      {winRate.wins + winRate.losses} sinyal ditutup
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2 text-sm text-muted-foreground font-mono">
                    Belum ada sinyal ditutup
                  </div>
                )}

                <div className="flex items-center justify-between py-2 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total Sinyal</span>
                  <span className="font-mono text-lg">{botStatus?.totalSignals ?? 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Calendar */}
            <CalendarCard />

          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Last Signal Hero */}
            <Card className="border-border bg-card shadow-lg shadow-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-mono">SINYAL TERAKHIR</CardTitle>
              </CardHeader>
              <CardContent>
                {lastSignal ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-3 mb-4 flex-wrap">
                        {lastSignal.decision === "BUY" && (
                          <Badge className="text-lg px-3 py-1 bg-green-500/20 text-green-500 border-green-500/30 font-mono">
                            <TrendingUp className="w-5 h-5 mr-1" /> BUY
                          </Badge>
                        )}
                        {lastSignal.decision === "SELL" && (
                          <Badge className="text-lg px-3 py-1 bg-red-500/20 text-red-500 border-red-500/30 font-mono">
                            <TrendingDown className="w-5 h-5 mr-1" /> SELL
                          </Badge>
                        )}
                        {lastSignal.decision === "WAIT" && (
                          <Badge className="text-lg px-3 py-1 bg-gray-500/20 text-gray-400 border-gray-500/30 font-mono">
                            <Minus className="w-5 h-5 mr-1" /> WAIT
                          </Badge>
                        )}
                        {/* Result badge */}
                        {(lastSignal as { result?: string }).result === "WIN" && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono">
                            <CheckCircle className="w-3 h-3 mr-1" /> WIN
                          </Badge>
                        )}
                        {(lastSignal as { result?: string }).result === "LOSS" && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono">
                            <AlertTriangle className="w-3 h-3 mr-1" /> LOSS
                          </Badge>
                        )}
                        {(lastSignal as { status?: string }).status === "active" && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 font-mono animate-pulse">
                            ⏳ AKTIF
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1">
                            <span>Keyakinan (Confidence)</span>
                            <span>{Math.round(lastSignal.confidence * 100)}%</span>
                          </div>
                          <Progress
                            value={lastSignal.confidence * 100}
                            className={`h-2 ${lastSignal.decision === "BUY" ? "bg-green-950 [&>div]:bg-green-500" : lastSignal.decision === "SELL" ? "bg-red-950 [&>div]:bg-red-500" : "bg-gray-800 [&>div]:bg-gray-400"}`}
                          />
                        </div>

                        {lastSignal.decision !== "WAIT" && (
                          <div className="grid grid-cols-3 gap-2 text-center pt-2">
                            <div className="bg-background rounded p-2 border border-border">
                              <div className="text-[10px] text-muted-foreground mb-1">ENTRY</div>
                              <div className="text-sm font-mono">{formatCurrency(lastSignal.entry_price)}</div>
                            </div>
                            <div className="bg-background rounded p-2 border border-green-500/20">
                              <div className="text-[10px] text-green-500/70 mb-1">TAKE PROFIT</div>
                              <div className="text-sm font-mono text-green-400">{formatCurrency(lastSignal.take_profit)}</div>
                            </div>
                            <div className="bg-background rounded p-2 border border-red-500/20">
                              <div className="text-[10px] text-red-500/70 mb-1">STOP LOSS</div>
                              <div className="text-sm font-mono text-red-400">{formatCurrency(lastSignal.stop_loss)}</div>
                            </div>
                          </div>
                        )}

                        {/* Exit price if closed */}
                        {(lastSignal as { exit_price?: number }).exit_price && (
                          <div className="bg-background rounded p-2 border border-border text-center">
                            <div className="text-[10px] text-muted-foreground mb-1">EXIT PRICE</div>
                            <div className={`text-sm font-mono font-bold ${(lastSignal as { result?: string }).result === "WIN" ? "text-green-400" : "text-red-400"}`}>
                              {formatCurrency((lastSignal as { exit_price?: number }).exit_price)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-background border border-border rounded-md p-4 flex flex-col h-full">
                      <div className="text-xs text-muted-foreground font-mono mb-2 border-b border-border pb-2">
                        ALASAN ANALISIS
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed overflow-y-auto max-h-[140px] pr-2">
                        {lastSignal.reasoning}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    Belum ada sinyal. Bot sedang mengumpulkan data.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Signal Feed */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground font-mono">RIWAYAT SINYAL (20 TERAKHIR)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {signalsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Memuat riwayat sinyal...</div>
                ) : !signals || signals.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">Bot sedang memulai analisis pertama...</div>
                ) : (
                  <div className="divide-y divide-border">
                    {signals.map((signal) => {
                      const s = signal as typeof signal & { result?: string; status?: string; exit_price?: number };
                      return (
                        <Accordion type="single" collapsible key={signal.id} className="px-6">
                          <AccordionItem value={signal.id} className="border-none">
                            <AccordionTrigger className="hover:no-underline py-4">
                              <div className="flex items-center w-full gap-3">
                                {/* Decision */}
                                <div className="w-16 text-left">
                                  {signal.decision === "BUY" && (
                                    <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">BUY</Badge>
                                  )}
                                  {signal.decision === "SELL" && (
                                    <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-xs">SELL</Badge>
                                  )}
                                  {signal.decision === "WAIT" && (
                                    <Badge variant="outline" className="text-muted-foreground text-xs">WAIT</Badge>
                                  )}
                                </div>

                                {/* Result badge */}
                                <div className="w-16">
                                  {s.result === "WIN" && (
                                    <Badge className="bg-green-500/20 text-green-400 border-green-500/20 text-xs">✅ WIN</Badge>
                                  )}
                                  {s.result === "LOSS" && (
                                    <Badge className="bg-red-500/20 text-red-400 border-red-500/20 text-xs">❌ LOSS</Badge>
                                  )}
                                  {s.status === "active" && (
                                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/20 text-xs animate-pulse">⏳</Badge>
                                  )}
                                </div>

                                {/* Price + conf */}
                                <div className="flex-1 text-left grid grid-cols-2 md:grid-cols-3 gap-2 text-sm font-mono">
                                  <div className="text-muted-foreground">{formatCurrency(signal.current_price)}</div>
                                  <div className="hidden md:block text-muted-foreground">
                                    {Math.round(signal.confidence * 100)}% conf
                                  </div>
                                  <div className="hidden md:block">
                                    {signal.decision !== "WAIT" && signal.entry_price && signal.take_profit ? (
                                      <span className="text-xs text-muted-foreground">
                                        RR 1:{Math.abs((signal.take_profit - signal.entry_price) / ((signal.entry_price - (signal.stop_loss ?? signal.entry_price)) || 1)).toFixed(1)}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Time */}
                                <div className="text-xs text-muted-foreground font-mono text-right w-20 hidden sm:block">
                                  {formatWIBShort(signal.timestamp)}
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 pt-0">
                              <div className="bg-background rounded p-4 border border-border text-sm text-foreground/80 space-y-3">
                                {signal.decision !== "WAIT" && (
                                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                                    <div>
                                      <div className="text-muted-foreground">Entry</div>
                                      <div>{formatCurrency(signal.entry_price)}</div>
                                    </div>
                                    <div>
                                      <div className="text-green-400/70">TP</div>
                                      <div className="text-green-400">{formatCurrency(signal.take_profit)}</div>
                                    </div>
                                    <div>
                                      <div className="text-red-400/70">SL</div>
                                      <div className="text-red-400">{formatCurrency(signal.stop_loss)}</div>
                                    </div>
                                  </div>
                                )}
                                {s.exit_price && (
                                  <div className={`text-xs font-mono text-center ${s.result === "WIN" ? "text-green-400" : "text-red-400"}`}>
                                    Exit: {formatCurrency(s.exit_price)} ({s.result})
                                  </div>
                                )}
                                <div>
                                  <div className="font-mono text-xs text-primary mb-1">Konteks:</div>
                                  <p className="text-xs">{signal.market_context}</p>
                                </div>
                                <div>
                                  <div className="font-mono text-xs text-primary mb-1">Alasan:</div>
                                  <p className="text-xs">{signal.reasoning}</p>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
