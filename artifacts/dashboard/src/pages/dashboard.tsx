import React, { useState, useEffect } from "react";
import {
  useGetBotStatus,
  useGetCurrentMarket,
  useGetSignals,
  useStartBot,
  useStopBot,
  useTriggerAnalysis,
  getGetBotStatusQueryKey,
  getGetSignalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Play, Square, Activity, Clock, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function formatWIBTime(dateString: string) {
  try {
    const date = new Date(dateString);
    // Add 7 hours for WIB if needed, assuming the server sends ISO UTC strings
    // JS Date formats based on local tz. For a reliable display we can use date-fns.
    // If the local timezone isn't Asia/Jakarta, it will be offset. 
    return format(date, "dd MMM yyyy HH:mm:ss", { locale: id }) + " WIB";
  } catch (e) {
    return dateString;
  }
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const { data: marketData, isLoading: marketLoading } = useGetCurrentMarket({
    query: { refetchInterval: 3000 }
  });

  const { data: botStatus, isLoading: statusLoading } = useGetBotStatus({
    query: { refetchInterval: 5000 }
  });

  const { data: signals, isLoading: signalsLoading } = useGetSignals({ limit: 20 }, {
    query: { refetchInterval: 15000 }
  });

  const startBot = useStartBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });

  const stopBot = useStopBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });

  const triggerAnalysis = useTriggerAnalysis({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSignalsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });

  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (botStatus?.nextAnalysisIn !== undefined && botStatus?.nextAnalysisIn !== null) {
      setCountdown(botStatus.nextAnalysisIn);
    }
  }, [botStatus?.nextAnalysisIn]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const lastSignal = botStatus?.lastSignal;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <Activity className="w-6 h-6" />
              XAUUSD AI Agent Terminal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Sistem Perdagangan Otonom Real-time</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end mr-4">
              <span className="text-xs text-muted-foreground font-mono">STATUS BOT</span>
              {botStatus?.running ? (
                <Badge className="bg-green-600/20 text-green-500 border-green-600/30">AKTIF</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">BERHENTI</Badge>
              )}
            </div>

            <Button
              variant={botStatus?.running ? "destructive" : "default"}
              onClick={() => botStatus?.running ? stopBot.mutate() : startBot.mutate()}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Market & Status */}
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
                  <div className="text-xs text-muted-foreground font-mono mb-1">Analisis Terakhir</div>
                  <div className="text-sm font-mono">{botStatus?.lastAnalysis ? formatWIBTime(botStatus.lastAnalysis) : "-"}</div>
                </div>
                
                {botStatus?.running && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground font-mono">Analisis Berikutnya</span>
                      <span className="text-sm font-mono text-primary">{countdown !== null ? `${countdown}s` : "-"}</span>
                    </div>
                    <Progress value={countdown !== null ? ((60 - (countdown % 60)) / 60) * 100 : 0} className="h-1 bg-muted" />
                  </div>
                )}

                <Button 
                  className="w-full mt-2 font-mono text-xs" 
                  variant="outline"
                  onClick={() => triggerAnalysis.mutate()}
                  disabled={triggerAnalysis.isPending || !botStatus?.running}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${triggerAnalysis.isPending ? "animate-spin" : ""}`} />
                  ANALISIS SEKARANG
                </Button>
              </CardContent>
            </Card>

            {/* Signal Summary */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-mono">RINGKASAN</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Sinyal</span>
                  <span className="font-mono text-lg">{botStatus?.totalSignals ?? 0}</span>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Right Column: Signals History */}
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
                      <div className="flex items-center gap-3 mb-4">
                        {lastSignal.decision === "BUY" && <Badge className="text-lg px-3 py-1 bg-green-500/20 text-green-500 border-green-500/30 font-mono"><TrendingUp className="w-5 h-5 mr-1"/> BUY</Badge>}
                        {lastSignal.decision === "SELL" && <Badge className="text-lg px-3 py-1 bg-red-500/20 text-red-500 border-red-500/30 font-mono"><TrendingDown className="w-5 h-5 mr-1"/> SELL</Badge>}
                        {lastSignal.decision === "WAIT" && <Badge className="text-lg px-3 py-1 bg-gray-500/20 text-gray-400 border-gray-500/30 font-mono"><Minus className="w-5 h-5 mr-1"/> WAIT</Badge>}
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1">
                            <span>Keyakinan (Confidence)</span>
                            <span>{lastSignal.confidence}%</span>
                          </div>
                          <Progress 
                            value={lastSignal.confidence} 
                            className={`h-2 ${lastSignal.decision === 'BUY' ? 'bg-green-950 [&>div]:bg-green-500' : lastSignal.decision === 'SELL' ? 'bg-red-950 [&>div]:bg-red-500' : 'bg-gray-800 [&>div]:bg-gray-400'}`} 
                          />
                        </div>
                        
                        {lastSignal.decision !== "WAIT" && (
                          <div className="grid grid-cols-3 gap-2 text-center pt-2">
                            <div className="bg-background rounded p-2 border border-border">
                              <div className="text-[10px] text-muted-foreground mb-1">ENTRY</div>
                              <div className="text-sm font-mono">{formatCurrency(lastSignal.entry_price)}</div>
                            </div>
                            <div className="bg-background rounded p-2 border border-border">
                              <div className="text-[10px] text-green-500/70 mb-1">TAKE PROFIT</div>
                              <div className="text-sm font-mono text-green-400">{formatCurrency(lastSignal.take_profit)}</div>
                            </div>
                            <div className="bg-background rounded p-2 border border-border">
                              <div className="text-[10px] text-red-500/70 mb-1">STOP LOSS</div>
                              <div className="text-sm font-mono text-red-400">{formatCurrency(lastSignal.stop_loss)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-background border border-border rounded-md p-4 flex flex-col h-full">
                      <div className="text-xs text-muted-foreground font-mono mb-2 border-b border-border pb-2">ALASAN ANALISIS</div>
                      <p className="text-sm text-foreground/80 leading-relaxed overflow-y-auto max-h-[140px] pr-2 custom-scrollbar">
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
                    {signals.map((signal) => (
                      <Accordion type="single" collapsible key={signal.id} className="px-6">
                        <AccordionItem value={signal.id} className="border-none">
                          <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center w-full gap-4">
                              <div className="w-24 text-left">
                                {signal.decision === "BUY" && <Badge className="bg-green-500/20 text-green-500 border-green-500/30">BUY</Badge>}
                                {signal.decision === "SELL" && <Badge className="bg-red-500/20 text-red-500 border-red-500/30">SELL</Badge>}
                                {signal.decision === "WAIT" && <Badge variant="outline" className="text-muted-foreground">WAIT</Badge>}
                              </div>
                              <div className="flex-1 text-left grid grid-cols-2 md:grid-cols-4 gap-2 text-sm font-mono">
                                <div className="text-muted-foreground">{formatCurrency(signal.current_price)}</div>
                                <div className="hidden md:block text-muted-foreground">{signal.confidence}% Conf</div>
                                <div className="hidden md:block">
                                  {signal.decision !== "WAIT" && signal.entry_price && signal.take_profit ? (
                                    <span className="text-xs text-muted-foreground">
                                      RR 1:{Math.abs((signal.take_profit - signal.entry_price) / ((signal.entry_price - (signal.stop_loss || signal.entry_price)) || 1)).toFixed(1)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground font-mono text-right w-32 hidden sm:block">
                                {formatWIBTime(signal.timestamp).split(" ")[1]}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4 pt-0">
                            <div className="bg-background rounded p-4 border border-border text-sm text-foreground/80">
                              <div className="font-mono text-xs text-primary mb-2">Konteks Market:</div>
                              <p className="mb-4">{signal.market_context}</p>
                              
                              <div className="font-mono text-xs text-primary mb-2">Alasan Keputusan:</div>
                              <p>{signal.reasoning}</p>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    ))}
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
