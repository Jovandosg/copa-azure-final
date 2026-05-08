import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trophy, BarChart3, MapPin, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamFlag } from '@/components/TeamFlag';
import api, { type StandingRow, type BracketMatch, type BracketSlot } from '@/lib/api';

// =====================================================
// Bracket sub-components
// =====================================================

const SlotRow: React.FC<{ slot: BracketSlot; isWinner: boolean }> = ({ slot, isWinner }) => {
  const hasTeam = !!slot.team_code;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${isWinner ? 'font-bold' : ''}`}>
      {hasTeam && slot.team_flag ? (
        <TeamFlag flag={slot.team_flag} name={slot.team_name!} size="sm" />
      ) : (
        <div className="w-6 h-4 rounded bg-muted/40" />
      )}
      <span className={hasTeam ? 'text-sm' : 'text-xs text-muted-foreground italic truncate'}>
        {hasTeam ? slot.team_code : slot.label}
      </span>
    </div>
  );
};

function formatMatchDate(d: string | null): string | null {
  if (!d) return null;
  // 'YYYY-MM-DD' → 'DD/MM'
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

const BracketCard: React.FC<{ match: BracketMatch }> = ({ match }) => {
  const isFinished =
    match.status === 'finished' && match.score1 !== null && match.score2 !== null;
  const winnerSlot = isFinished
    ? match.score1! > match.score2!
      ? 'slot1'
      : match.score1! < match.score2!
      ? 'slot2'
      : null
    : null;

  const dateLabel = formatMatchDate(match.date);
  const hasMeta = !!(dateLabel || match.time || match.stadium_name);

  return (
    <Card className="rounded-xl border-border overflow-hidden bg-card">
      <div className="bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between border-b border-border">
        <span className="font-medium">Jogo #{match.match_number}</span>
        {isFinished && (
          <Badge variant="default" className="text-xs h-5">
            Encerrado
          </Badge>
        )}
      </div>
      <div className="divide-y divide-border">
        <div
          className={`flex items-center justify-between ${
            winnerSlot === 'slot1' ? 'bg-primary/5' : ''
          }`}
        >
          <SlotRow slot={match.slot1} isWinner={winnerSlot === 'slot1'} />
          {isFinished && <span className="px-3 font-bold text-lg">{match.score1}</span>}
        </div>
        <div
          className={`flex items-center justify-between ${
            winnerSlot === 'slot2' ? 'bg-primary/5' : ''
          }`}
        >
          <SlotRow slot={match.slot2} isWinner={winnerSlot === 'slot2'} />
          {isFinished && <span className="px-3 font-bold text-lg">{match.score2}</span>}
        </div>
      </div>
      {hasMeta && (
        <div className="bg-muted/20 px-3 py-2 border-t border-border space-y-1">
          {(dateLabel || match.time) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {dateLabel}
                {dateLabel && match.time ? ' · ' : ''}
                {match.time}
              </span>
            </div>
          )}
          {match.stadium_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate" title={`${match.stadium_name}${match.stadium_city ? ' — ' + match.stadium_city : ''}`}>
                {match.stadium_name}
                {match.stadium_city ? ` — ${match.stadium_city}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const BracketPhase: React.FC<{
  matches: BracketMatch[];
  cols?: string;
  emptyMessage?: string;
}> = ({ matches, cols = 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4', emptyMessage }) => {
  if (!matches.length && emptyMessage) {
    return (
      <div className="text-center py-12 text-muted-foreground italic">{emptyMessage}</div>
    );
  }
  return (
    <div className={`grid ${cols} gap-4`}>
      {matches.map((m) => (
        <BracketCard key={m.match_id} match={m} />
      ))}
    </div>
  );
};

// =====================================================
// Main page
// =====================================================

const Standings: React.FC = () => {
  const [tab, setTab] = useState('groups');

  const { data: standingsData, isLoading: standingsLoading, isError: standingsError } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api.getStandings(),
    enabled: tab === 'groups',
  });

  const { data: bracketData, isLoading: bracketLoading, isError: bracketError } = useQuery({
    queryKey: ['bracket'],
    queryFn: () => api.getBracket(),
    enabled: tab !== 'groups',
  });

  useEffect(() => {
    if (standingsError) toast.error('Não foi possível carregar a tabela. Tente recarregar.');
  }, [standingsError]);

  useEffect(() => {
    if (bracketError) toast.error('Não foi possível carregar o mata-mata. Tente recarregar.');
  }, [bracketError]);

  const standings = standingsData?.data?.standings || {};
  const groups = Object.keys(standings).sort();
  const bracket = bracketData?.data?.bracket;

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm font-medium">Tabela e mata-mata</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl mb-3">
            <span className="gold-text">Tabela</span> da Copa 2026
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Atualizada conforme partidas são encerradas. Mata-mata cascateia automaticamente.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-4 sm:grid-cols-7 gap-1 max-w-3xl mx-auto mb-8 h-auto">
            <TabsTrigger value="groups">Grupos</TabsTrigger>
            <TabsTrigger value="r32">32 avos</TabsTrigger>
            <TabsTrigger value="r16">Oitavas</TabsTrigger>
            <TabsTrigger value="qf">Quartas</TabsTrigger>
            <TabsTrigger value="sf">Semis</TabsTrigger>
            <TabsTrigger value="third">3º/4º</TabsTrigger>
            <TabsTrigger value="final">Final</TabsTrigger>
          </TabsList>

          {/* === GROUPS === */}
          <TabsContent value="groups">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {standingsLoading
                ? [1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-72 w-full rounded-2xl" />
                  ))
                : groups.map((g) => (
                    <Card
                      key={g}
                      className="rounded-2xl bg-card border-border hover:border-primary/50 transition-all duration-300 overflow-hidden"
                    >
                      <CardHeader className="bg-gradient-to-r from-primary/20 to-primary/5 border-b border-border py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="font-display text-lg text-primary">{g}</span>
                          </div>
                          <CardTitle className="font-display text-base">Grupo {g}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <table className="w-full text-xs table-fixed">
                          <thead className="bg-muted/30 text-muted-foreground">
                            <tr>
                              <th className="px-1 py-2 text-center font-medium" style={{ width: '8%' }}>#</th>
                              <th className="px-1 py-2 text-left font-medium" style={{ width: '20%' }}>Time</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '8%' }}>J</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '8%' }}>V</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '8%' }}>E</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '8%' }}>D</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '9%' }}>GP</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '9%' }}>GC</th>
                              <th className="px-0 py-2 text-center font-medium" style={{ width: '10%' }}>SG</th>
                              <th className="px-1 py-2 text-center font-bold text-foreground" style={{ width: '12%' }}>P</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings[g].map((row: StandingRow, idx) => (
                              <tr
                                key={row.team_id}
                                className={`border-t border-border ${idx < 2 ? 'bg-primary/5' : ''}`}
                              >
                                <td className="px-1 py-2 text-center font-medium">
                                  {idx < 2 ? (
                                    <Trophy className="w-3 h-3 text-gold inline" />
                                  ) : (
                                    idx + 1
                                  )}
                                </td>
                                <td className="px-1 py-2 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <TeamFlag flag={row.team_flag} name={row.team_name} size="sm" />
                                    <span className="font-medium">{row.team_code}</span>
                                  </div>
                                </td>
                                <td className="px-0 py-2 text-center">{row.played}</td>
                                <td className="px-0 py-2 text-center">{row.won}</td>
                                <td className="px-0 py-2 text-center">{row.drawn}</td>
                                <td className="px-0 py-2 text-center">{row.lost}</td>
                                <td className="px-0 py-2 text-center">{row.gf}</td>
                                <td className="px-0 py-2 text-center">{row.ga}</td>
                                <td className="px-0 py-2 text-center">
                                  {row.gd >= 0 ? `+${row.gd}` : row.gd}
                                </td>
                                <td className="px-1 py-2 text-center font-bold">{row.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  ))}
            </div>
            <div className="mt-8 p-6 rounded-xl glass-card text-center text-sm text-muted-foreground">
              <strong className="text-foreground">Legenda:</strong> J = Jogos · V = Vitórias · E = Empates · D = Derrotas · GP = Gols Pró · GC = Gols Contra · SG = Saldo de Gols · P = Pontos
            </div>
          </TabsContent>

          {/* === R32 === */}
          <TabsContent value="r32">
            {bracketLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : (
              <BracketPhase matches={bracket?.round_of_32 || []} />
            )}
          </TabsContent>

          {/* === R16 === */}
          <TabsContent value="r16">
            <BracketPhase
              matches={bracket?.round_of_16 || []}
              cols="grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
              emptyMessage="Aguardando finalização do round of 32."
            />
          </TabsContent>

          {/* === QF === */}
          <TabsContent value="qf">
            <BracketPhase
              matches={bracket?.quarter_final || []}
              cols="grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
            />
          </TabsContent>

          {/* === SF === */}
          <TabsContent value="sf">
            <BracketPhase
              matches={bracket?.semi_final || []}
              cols="grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
            />
          </TabsContent>

          {/* === 3º/4º === */}
          <TabsContent value="third">
            <div className="max-w-md mx-auto">
              {bracket?.third_place ? (
                <BracketCard match={bracket.third_place} />
              ) : (
                <div className="text-center py-12 text-muted-foreground italic">
                  Aguardando finalização das semifinais.
                </div>
              )}
            </div>
          </TabsContent>

          {/* === FINAL === */}
          <TabsContent value="final">
            <div className="max-w-md mx-auto">
              <div className="text-center mb-4">
                <Trophy className="w-12 h-12 text-gold mx-auto mb-2" />
                <h2 className="font-display text-2xl gold-text">Final da Copa 2026</h2>
              </div>
              {bracket?.final ? (
                <BracketCard match={bracket.final} />
              ) : (
                <div className="text-center py-12 text-muted-foreground italic">
                  Aguardando finalização das semifinais.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Standings;
