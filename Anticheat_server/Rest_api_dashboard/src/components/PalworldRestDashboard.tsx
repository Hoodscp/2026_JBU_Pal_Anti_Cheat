import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Server, Users, Save, Megaphone, Gauge, ShieldAlert, Clock3, Globe2, LogOut, Ban, Unlock, Power } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type ServerInfo = {
  version: string;
  servername: string;
  description: string;
  worldguid: string;
};

type Player = {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  ip: string;
  ping: number;
  location_x: number;
  location_y: number;
  level: number;
  building_count: number;
};

type PlayersResponse = {
  players: Player[];
};

type Metrics = {
  serverfps?: number;
  currentplayernum?: number;
  serverframetime?: number;
  maxplayernum?: number;
  uptime?: number;
  days?: number;
  basecampnum?: number;
};

type Settings = {
  ServerName?: string;
  ServerDescription?: string;
  ServerPlayerMaxNum?: number;
  PublicPort?: number;
  RESTAPIPort?: number;
  RCONEnabled?: boolean;
  RCONPort?: number;
  bIsPvP?: boolean;
  CoopPlayerMaxNum?: number;
  Difficulty?: string;
  ExpRate?: number;
  PalCaptureRate?: number;
  PalSpawnNumRate?: number;
  DayTimeSpeedRate?: number;
  NightTimeSpeedRate?: number;
  WorkSpeedRate?: number;
  DeathPenalty?: string;
  bEnableFastTravel?: boolean;
  bUseAuth?: boolean;
  [key: string]: any;
};

type JsonMap = Record<string, unknown>;

type LogItem = {
  time: string;
  type: "info" | "success" | "error";
  message: string;
};

type BannedPlayer = {
  userId: string;
  name: string;
  date: string;
};

const STORAGE_KEY = "palworld-rest-dashboard-config-v2";

function encodeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function formatUptime(seconds?: number) {
  if (seconds == null || Number.isNaN(seconds)) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [] as string[];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function maskGuid(value?: string) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatNumber(value?: number) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat().format(value);
}

export default function PalworldRestDashboard() {
  const [baseUrl, setBaseUrl] = useState("/v1/api");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("1234");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState(10000);
  const [filter, setFilter] = useState("");
  const [announcement, setAnnouncement] = useState("서버 저장을 시작합니다. 잠시만 기다려주세요.");
  const [bannedPlayers, setBannedPlayers] = useState<BannedPlayer[]>([]);
  const [manualUnbanId, setManualUnbanId] = useState("");
  const [shutdownWaitTime, setShutdownWaitTime] = useState(60);
  const [shutdownMessage, setShutdownMessage] = useState("서버 점검을 위해 종료됩니다.");

  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);

  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rawInfo, setRawInfo] = useState<JsonMap | null>(null);
  const [rawPlayers, setRawPlayers] = useState<JsonMap | null>(null);
  const [rawSettings, setRawSettings] = useState<JsonMap | null>(null);
  const [rawMetrics, setRawMetrics] = useState<JsonMap | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.baseUrl) setBaseUrl(parsed.baseUrl);
      if (parsed.username) setUsername(parsed.username);
      if (typeof parsed.password === "string") setPassword(parsed.password);
      if (typeof parsed.autoRefresh === "boolean") setAutoRefresh(parsed.autoRefresh);
      if (typeof parsed.refreshMs === "number") setRefreshMs(parsed.refreshMs);
      if (Array.isArray(parsed.bannedPlayers)) setBannedPlayers(parsed.bannedPlayers);
    } catch {
      // ignore broken local storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl, username, password, autoRefresh, refreshMs, bannedPlayers })
    );
  }, [baseUrl, username, password, autoRefresh, refreshMs, bannedPlayers]);

  const authHeader = useMemo(() => encodeBasicAuth(username, password), [username, password]);

  function addLog(type: LogItem["type"], message: string) {
    const item = {
      time: new Date().toLocaleTimeString(),
      type,
      message,
    } satisfies LogItem;
    setLogs((prev) => [item, ...prev].slice(0, 25));
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data ?? text);
      throw new Error(`${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
    }

    return data as T;
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);

    try {
      const [infoRes, playersRes, settingsRes, metricsRes] = await Promise.allSettled([
        request<ServerInfo>("/info"),
        request<PlayersResponse>("/players"),
        request<Settings>("/settings"),
        request<Metrics>("/metrics"),
      ]);

      if (infoRes.status === "fulfilled") {
        setInfo(infoRes.value);
        setRawInfo(infoRes.value as JsonMap);
      }
      if (playersRes.status === "fulfilled") {
        setPlayers(playersRes.value.players ?? []);
        setRawPlayers(playersRes.value as unknown as JsonMap);
      }
      if (settingsRes.status === "fulfilled") {
        setSettings(settingsRes.value);
        setRawSettings(settingsRes.value as JsonMap);
      }
      if (metricsRes.status === "fulfilled") {
        setMetrics(metricsRes.value);
        setRawMetrics(metricsRes.value as JsonMap);
      }

      const errors = [infoRes, playersRes, settingsRes, metricsRes]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message || "요청 실패");

      if (errors.length) {
        const merged = errors.join(" | ");
        setError(merged);
        addLog("error", merged);
      } else {
        addLog("success", "대시보드 데이터를 새로고침했습니다.");
      }

      setLastUpdated(new Date().toLocaleString());
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      setError(message);
      addLog("error", message);
    } finally {
      setLoading(false);
    }
  }

  async function saveWorld() {
    try {
      await request<unknown>("/save", { method: "POST" });
      addLog("success", "월드 저장 요청을 전송했습니다.");
      refreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "월드 저장 실패";
      setError(message);
      addLog("error", message);
    }
  }

  async function announceMessage() {
    try {
      if (!announcement.trim()) {
        addLog("info", "공지 메시지를 입력하세요.");
        return;
      }
      await request<unknown>("/announce", {
        method: "POST",
        body: JSON.stringify({ message: announcement.trim() }),
      });
      addLog("success", `공지 전송 완료: ${announcement.trim()}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "공지 전송 실패";
      setError(message);
      addLog("error", message);
    }
  }

  async function shutdownServer(waittime: number, message: string) {
    if (!confirm(`정말로 서버를 ${waittime}초 뒤에 종료(Shutdown)하시겠습니까?\n사유: ${message}`)) return;
    try {
      await request<unknown>("/shutdown", {
        method: "POST",
        body: JSON.stringify({ waittime, message: message.trim() || undefined }),
      });
      addLog("success", `서버 정상 종료 요청을 전송했습니다. (${waittime}초 후)`);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "종료 실패";
      setError(errorMsg);
      addLog("error", `서버 정상 종료 실패: ${errorMsg}`);
    }
  }

  async function forceShutdownServer() {
    if (!confirm(`경고: 지금 당장 강제 종료(Force Shutdown)하시겠습니까?\n진행중인 데이터가 손실될 수 있습니다!`)) return;
    try {
      await request<unknown>("/forceshutdown", {
        method: "POST",
      });
      addLog("success", `서버 강제 종료 요청을 전송했습니다.`);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "종료 실패";
      setError(errorMsg);
      addLog("error", `서버 강제 종료 실패: ${errorMsg}`);
    }
  }

  async function kickPlayer(userId: string, playerName: string) {
    if (!confirm(`정말로 "${playerName}" 플레이어를 추방하시겠습니까?`)) return;
    try {
      await request<unknown>("/kick", {
        method: "POST",
        body: JSON.stringify({ userid: userId, message: "관리자에 의해 추방되었습니다." }),
      });
      addLog("success", `${playerName} (${userId}) 추방 요청을 전송했습니다.`);
      refreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "플레이어 추방 실패";
      setError(message);
      addLog("error", `${playerName} 추방 실패: ${message}`);
    }
  }

  async function banPlayer(userId: string, playerName: string) {
    if (!confirm(`정말로 "${playerName}" 플레이어를 밴(Ban) 하시겠습니까?`)) return;
    try {
      await request<unknown>("/ban", {
        method: "POST",
        body: JSON.stringify({ userid: userId, message: "관리자에 의해 밴 되었습니다." }),
      });
      addLog("success", `${playerName} (${userId}) 밴 요청을 전송했습니다.`);
      setBannedPlayers((prev) => {
        if (prev.some(p => p.userId === userId)) return prev;
        return [...prev, { userId, name: playerName, date: new Date().toLocaleString() }];
      });
      refreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "플레이어 밴 실패";
      setError(message);
      addLog("error", `${playerName} 밴 실패: ${message}`);
    }
  }

  async function unbanPlayer(userId: string, playerName: string = "알 수 없음") {
    if (!confirm(`정말로 "${playerName}" (${userId}) 플레이어를 언밴(Unban) 하시겠습니까?`)) return;
    try {
      await request<unknown>("/unban", {
        method: "POST",
        body: JSON.stringify({ userid: userId }),
      });
      addLog("success", `${playerName} (${userId}) 언밴 요청을 전송했습니다.`);
      setBannedPlayers((prev) => prev.filter(p => p.userId !== userId));
      setManualUnbanId("");
      refreshAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "플레이어 언밴 실패";
      setError(message);
      addLog("error", `${playerName} 언밴 실패: ${message}`);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(refreshAll, Math.max(3000, refreshMs));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshMs, baseUrl, username, password]);

  const filteredPlayers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return players;
    return players.filter((player) =>
      [player.name, player.accountName, player.playerId, player.userId, player.ip]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [players, filter]);

  const statCards = [
    {
      label: "현재 접속자",
      value: metrics?.currentplayernum ?? players.length,
      hint: `최대 ${metrics?.maxplayernum ?? settings?.ServerPlayerMaxNum ?? "-"}명`,
      icon: Users,
    },
    {
      label: "서버 FPS",
      value: metrics?.serverfps ?? "-",
      hint: metrics?.serverframetime != null ? `${metrics.serverframetime} ms/frame` : "프레임타임 정보 없음",
      icon: Gauge,
    },
    {
      label: "업타임",
      value: formatUptime(metrics?.uptime),
      hint: metrics?.days != null ? `인게임 ${metrics.days}일째` : "업타임 정보 없음",
      icon: Clock3,
    },
    {
      label: "베이스 캠프",
      value: metrics?.basecampnum ?? "-",
      hint: `월드 GUID ${maskGuid(info?.worldguid)}`,
      icon: Globe2,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Server className="h-6 w-6" />
                Palworld REST Dashboard
              </CardTitle>
              <CardDescription>
                로컬 REST API 기반 서버 상태 확인, 저장 요청, 공지 전송용 대시보드
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refreshMs">Auto Refresh (ms)</Label>
                <Input
                  id="refreshMs"
                  type="number"
                  min={3000}
                  step={1000}
                  value={refreshMs}
                  onChange={(e) => setRefreshMs(Number(e.target.value) || 10000)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="autorefresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <Label htmlFor="autorefresh">자동 새로고침</Label>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button variant="outline" onClick={refreshAll} disabled={loading} className="rounded-2xl">
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  새로고침
                </Button>
                <Button onClick={saveWorld} className="rounded-2xl">
                  <Save className="mr-2 h-4 w-4" />
                  월드 저장
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="rounded-2xl shadow-sm h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  서버 공지
                </CardTitle>
                <CardDescription>REST API /announce 엔드포인트용 간단 전송</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={3}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="공지 메시지를 입력하세요"
                />
                <Button className="w-full rounded-2xl" onClick={announceMessage}>
                  공지 보내기
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <Power className="h-5 w-5" />
                  서버 전원 관리
                </CardTitle>
                <CardDescription>안전 종료 및 강제 종료</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>대기 시간 (초) & 공지 메시지</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="number" 
                      value={shutdownWaitTime} 
                      onChange={(e) => setShutdownWaitTime(Number(e.target.value) || 0)} 
                      className="w-20 shrink-0" 
                    />
                    <Input 
                      placeholder="종료 메시지" 
                      value={shutdownMessage} 
                      onChange={(e) => setShutdownMessage(e.target.value)} 
                      className="flex-1" 
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full rounded-2xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => shutdownServer(shutdownWaitTime, shutdownMessage)}
                  >
                    정상 종료 예약 (Save & Shutdown)
                  </Button>
                </div>
                
                <div className="pt-3 border-t border-dashed border-red-200">
                  <Button 
                    variant="destructive" 
                    className="w-full rounded-2xl"
                    onClick={forceShutdownServer}
                  >
                    강제 즉시 종료 (Force)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="rounded-2xl shadow-sm">
                <CardContent className="flex items-start justify-between p-6">
                  <div>
                    <div className="text-sm text-slate-500">{card.label}</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight">{card.value}</div>
                    <div className="mt-2 text-xs text-slate-500">{card.hint}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-200 p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>서버 개요</CardTitle>
              <CardDescription>REST API의 /info, /settings, /metrics 응답 요약</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <InfoRow label="서버 이름" value={info?.servername || settings?.ServerName || "-"} />
              <InfoRow label="버전" value={info?.version || "-"} />
              <InfoRow label="설명" value={info?.description || settings?.ServerDescription || "-"} />
              <InfoRow label="난이도" value={settings?.Difficulty || "-"} />
              <InfoRow label="공개 포트" value={String(settings?.PublicPort ?? "-")} />
              <InfoRow label="REST API 포트" value={String(settings?.RESTAPIPort ?? "-")} />
              <InfoRow label="PvP" value={settings?.bIsPvP ? "활성화" : "비활성화"} />
              <InfoRow label="빠른 이동" value={settings?.bEnableFastTravel ? "허용" : "비허용"} />
              <InfoRow label="경험치 배율" value={String(settings?.ExpRate ?? "-")} />
              <InfoRow label="포획 배율" value={String(settings?.PalCaptureRate ?? "-")} />
              <InfoRow label="팰 스폰 배율" value={String(settings?.PalSpawnNumRate ?? "-")} />
              <InfoRow label="작업 속도 배율" value={String(settings?.WorkSpeedRate ?? "-")} />
              <InfoRow label="최대 인원" value={String(metrics?.maxplayernum ?? settings?.ServerPlayerMaxNum ?? "-")} />
              <InfoRow label="코옵 최대" value={String(settings?.CoopPlayerMaxNum ?? "-")} />
              <InfoRow label="데스 페널티" value={settings?.DeathPenalty || "-"} />
              <InfoRow label="월드 GUID" value={info?.worldguid || "-"} mono />
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                상태 및 로그
              </CardTitle>
              <CardDescription>요청 결과와 최근 작업 기록</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border bg-white p-4 text-sm">
                <div><span className="font-medium">마지막 갱신:</span> {lastUpdated || "-"}</div>
                <div className="mt-2"><span className="font-medium">오류 상태:</span> {error || "없음"}</div>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                {logs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">아직 로그가 없습니다.</div>
                ) : (
                  logs.map((log, idx) => (
                    <div
                      key={`${log.time}-${idx}`}
                      className={`rounded-2xl border p-3 text-sm ${
                        log.type === "error"
                          ? "border-red-200 bg-red-50"
                          : log.type === "success"
                          ? "border-green-200 bg-green-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="mb-1 text-xs text-slate-500">{log.time}</div>
                      <div>{log.message}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>접속 플레이어</CardTitle>
                <CardDescription>/players 응답 기반 목록</CardDescription>
              </div>
              <div className="w-full md:w-80">
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름, ID, IP 검색" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3">이름</th>
                      <th className="px-4 py-3">계정</th>
                      <th className="px-4 py-3">레벨</th>
                      <th className="px-4 py-3">핑</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">건물 수</th>
                      <th className="px-4 py-3">Player ID</th>
                      <th className="px-4 py-3 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          표시할 플레이어가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredPlayers.map((player) => (
                        <tr key={player.playerId} className="border-t">
                          <td className="px-4 py-3 font-medium">{player.name || "-"}</td>
                          <td className="px-4 py-3">{player.accountName || "-"}</td>
                          <td className="px-4 py-3">{formatNumber(player.level)}</td>
                          <td className="px-4 py-3">{player.ping ?? "-"}</td>
                          <td className="px-4 py-3">{player.ip || "-"}</td>
                          <td className="px-4 py-3">{formatNumber(player.building_count)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{player.playerId || "-"}</td>
                          <td className="px-4 py-3 text-center relative pointer-events-auto">
                            <div className="relative z-50 flex justify-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="rounded-2xl cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  kickPlayer(player.userId, player.name || player.accountName || "알 수 없음");
                                }}
                              >
                                <LogOut className="mr-1 h-3.5 w-3.5" />
                                추방
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="rounded-2xl cursor-pointer bg-red-700 hover:bg-red-800"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  banPlayer(player.userId, player.name || player.accountName || "알 수 없음");
                                }}
                              >
                                <Ban className="mr-1 h-3.5 w-3.5" />
                                밴
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>블랙리스트 (밴 목록)</CardTitle>
                <CardDescription>대시보드에서 밴 한 플레이어 기록 및 언밴 기능</CardDescription>
              </div>
              <div className="flex w-full md:w-auto items-center gap-2">
                <Input
                  placeholder="Player ID (userid) 직접 입력"
                  value={manualUnbanId}
                  onChange={(e) => setManualUnbanId(e.target.value)}
                  className="w-full md:w-64"
                />
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    if (!manualUnbanId.trim()) return;
                    unbanPlayer(manualUnbanId.trim(), "수동 입력");
                  }}
                  className="shrink-0 rounded-2xl cursor-pointer"
                >
                  <Unlock className="mr-1 h-4 w-4" />
                  수동 언밴
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3">이름/계정</th>
                      <th className="px-4 py-3">Player ID (userid)</th>
                      <th className="px-4 py-3">밴 날짜 (로컬)</th>
                      <th className="px-4 py-3 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bannedPlayers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                          로컬에 기록된 밴 목록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      bannedPlayers.map((bp) => (
                        <tr key={bp.userId} className="border-t">
                          <td className="px-4 py-3 font-medium">{bp.name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{bp.userId}</td>
                          <td className="px-4 py-3 text-slate-500">{bp.date}</td>
                          <td className="px-4 py-3 text-center relative pointer-events-auto">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="rounded-2xl cursor-pointer"
                              onClick={() => unbanPlayer(bp.userId, bp.name)}
                            >
                              <Unlock className="mr-1 h-3.5 w-3.5" />
                              언밴
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <RawJsonCard title="Raw /info" data={rawInfo} />
          <RawJsonCard title="Raw /metrics" data={rawMetrics} />
          <RawJsonCard title="Raw /players" data={rawPlayers} />
          <RawJsonCard title="Raw /settings" data={rawSettings} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 break-all text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function RawJsonCard({ title, data }: { title: string; data: JsonMap | null }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[360px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(data, null, 2) || "데이터 없음"}
        </pre>
      </CardContent>
    </Card>
  );
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
