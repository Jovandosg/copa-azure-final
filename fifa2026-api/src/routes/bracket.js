const express = require('express');
const { query, getConnection, sql } = require('../config/database');

const router = express.Router();

// =====================================================
// Estrutura oficial FIFA 2026 — Bracket de mata-mata
// =====================================================
// Source: Annex C / Knockout Bracket FIFA Competition Regulations
// Ver: docs/stories/0.8.story.md para tabela completa.

// R32: cada match (73-88) tem 2 sides — função que recebe o contexto e
// retorna o slot resolvido (team object ou label placeholder).
const R32_BRACKET = {
  73: { side1: ctx => ctx.runnerUp('A'), side2: ctx => ctx.runnerUp('B') },
  74: { side1: ctx => ctx.winner('E'),    side2: ctx => ctx.thirdAtSlot(74) },
  75: { side1: ctx => ctx.winner('F'),    side2: ctx => ctx.runnerUp('C') },
  76: { side1: ctx => ctx.winner('C'),    side2: ctx => ctx.runnerUp('F') },
  77: { side1: ctx => ctx.winner('I'),    side2: ctx => ctx.thirdAtSlot(77) },
  78: { side1: ctx => ctx.runnerUp('E'), side2: ctx => ctx.runnerUp('I') },
  79: { side1: ctx => ctx.winner('A'),    side2: ctx => ctx.thirdAtSlot(79) },
  80: { side1: ctx => ctx.winner('L'),    side2: ctx => ctx.thirdAtSlot(80) },
  81: { side1: ctx => ctx.winner('D'),    side2: ctx => ctx.thirdAtSlot(81) },
  82: { side1: ctx => ctx.winner('G'),    side2: ctx => ctx.thirdAtSlot(82) },
  83: { side1: ctx => ctx.runnerUp('K'), side2: ctx => ctx.runnerUp('L') },
  84: { side1: ctx => ctx.winner('H'),    side2: ctx => ctx.runnerUp('J') },
  85: { side1: ctx => ctx.winner('B'),    side2: ctx => ctx.thirdAtSlot(85) },
  86: { side1: ctx => ctx.winner('J'),    side2: ctx => ctx.runnerUp('H') },
  87: { side1: ctx => ctx.winner('K'),    side2: ctx => ctx.thirdAtSlot(87) },
  88: { side1: ctx => ctx.runnerUp('D'), side2: ctx => ctx.runnerUp('G') },
};

// Slots de "best 3rd" no R32 com grupos elegíveis FIFA
const R32_THIRD_SLOTS = [
  { matchNum: 74, eligibleGroups: ['A', 'B', 'C', 'D', 'F'] },
  { matchNum: 77, eligibleGroups: ['C', 'D', 'F', 'G', 'H'] },
  { matchNum: 79, eligibleGroups: ['C', 'E', 'F', 'H', 'I'] },
  { matchNum: 80, eligibleGroups: ['E', 'H', 'I', 'J', 'K'] },
  { matchNum: 81, eligibleGroups: ['B', 'E', 'F', 'I', 'J'] },
  { matchNum: 82, eligibleGroups: ['A', 'E', 'H', 'I', 'J'] },
  { matchNum: 85, eligibleGroups: ['E', 'F', 'G', 'I', 'J'] },
  { matchNum: 87, eligibleGroups: ['D', 'E', 'I', 'J', 'L'] },
];

const R16_PAIRS = [
  { num: 89, w1: 74, w2: 77 }, { num: 90, w1: 73, w2: 75 },
  { num: 91, w1: 76, w2: 78 }, { num: 92, w1: 79, w2: 80 },
  { num: 93, w1: 83, w2: 84 }, { num: 94, w1: 81, w2: 82 },
  { num: 95, w1: 86, w2: 88 }, { num: 96, w1: 85, w2: 87 },
];
const QF_PAIRS = [
  { num: 97, w1: 89, w2: 90 }, { num: 98, w1: 91, w2: 92 },
  { num: 99, w1: 93, w2: 94 }, { num: 100, w1: 95, w2: 96 },
];
const SF_PAIRS = [
  { num: 101, w1: 97, w2: 98 }, { num: 102, w1: 99, w2: 100 },
];
const THIRD_PLACE_NUM = 103; // L101 vs L102
const FINAL_NUM = 104;       // W101 vs W102

// =====================================================
// Helpers
// =====================================================

function teamSlot(team) {
  if (!team) return null;
  return {
    team_id: team.id,
    team_code: team.code,
    team_name: team.name,
    team_flag: team.flag,
    label: team.code,
  };
}

function placeholderSlot(label) {
  return { label };
}

// Calcula classificação de cada grupo (mesma lógica do /api/standings,
// mas devolvendo objetos completos de team).
function computeStandings(teams, groupMatches) {
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, {
      ...t,
      played: 0, won: 0, drawn: 0, lost: 0,
      gf: 0, ga: 0, gd: 0, points: 0,
    });
  }
  for (const m of groupMatches) {
    if (m.status !== 'finished' || m.home_score === null || m.away_score === null) continue;
    const home = stats.get(m.home_team_id);
    const away = stats.get(m.away_team_id);
    if (!home || !away) continue;
    home.played++; away.played++;
    home.gf += m.home_score; home.ga += m.away_score;
    away.gf += m.away_score; away.ga += m.home_score;
    if (m.home_score > m.away_score) { home.won++; home.points += 3; away.lost++; }
    else if (m.home_score < m.away_score) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; home.points += 1; away.drawn++; away.points += 1; }
  }
  for (const s of stats.values()) s.gd = s.gf - s.ga;

  // Agrupa por group_name e ordena
  const byGroup = {};
  for (const s of stats.values()) {
    if (!s.group_name) continue;
    if (!byGroup[s.group_name]) byGroup[s.group_name] = [];
    byGroup[s.group_name].push(s);
  }
  for (const g of Object.keys(byGroup)) {
    byGroup[g].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }
  return byGroup;
}

// Verifica se um grupo tem todos os matches encerrados (suficiente para
// confiar no top-3 da classificação).
function isGroupComplete(groupName, groupMatches) {
  const ofGroup = groupMatches.filter(m => m.group_name === groupName);
  if (ofGroup.length === 0) return false;
  return ofGroup.every(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null);
}

// Matching bipartite com backtrack: 8 melhores 3ºs → 8 slots elegíveis FIFA.
function matchThirdsToSlots(top8Thirds) {
  const assignments = new Map(); // matchNum → third
  const slotsAvailable = new Set(R32_THIRD_SLOTS.map(s => s.matchNum));

  function backtrack(idx) {
    if (idx === top8Thirds.length) return true;
    const third = top8Thirds[idx];
    for (const slot of R32_THIRD_SLOTS) {
      if (!slotsAvailable.has(slot.matchNum)) continue;
      if (!slot.eligibleGroups.includes(third.group_name)) continue;
      assignments.set(slot.matchNum, third);
      slotsAvailable.delete(slot.matchNum);
      if (backtrack(idx + 1)) return true;
      assignments.delete(slot.matchNum);
      slotsAvailable.add(slot.matchNum);
    }
    return false;
  }

  if (top8Thirds.length === 8 && !backtrack(0)) {
    console.warn('[bracket] matching bipartite falhou — combinação dos 8 melhores 3ºs sem alocação válida');
    return new Map();
  }
  return assignments;
}

// Determina vencedor/perdedor de um match. Em mata-mata, empate sem critério
// de desempate (penalties) — admin precisa colocar placar diferente.
function pickWinnerLoser(match, knockoutTeamMap) {
  if (match.status !== 'finished' || match.home_score === null || match.away_score === null) return null;
  if (match.home_score === match.away_score) return null; // empate sem suporte
  const home = knockoutTeamMap.get(match.home_team_id);
  const away = knockoutTeamMap.get(match.away_team_id);
  if (!home || !away) return null;
  if (match.home_score > match.away_score) return { winner: home, loser: away };
  return { winner: away, loser: home };
}

// =====================================================
// GET /api/bracket
// =====================================================
router.get('/', async (req, res) => {
  try {
    // 1) Carregar dados
    const teamsRes = await query(`
      SELECT id, name, code, flag, group_name
      FROM teams
      WHERE group_name IS NOT NULL
      ORDER BY group_name, name
    `);
    const teams = teamsRes.recordset;

    const matchesRes = await query(`
      SELECT m.id, m.home_team_id, m.away_team_id, m.group_name, m.stage,
             m.home_score, m.away_score, m.status,
             CONVERT(varchar(10), m.date, 23) AS match_date,
             CONVERT(varchar(5), m.time, 108) AS time,
             s.name AS stadium_name,
             s.city AS stadium_city
      FROM matches m
      LEFT JOIN stadiums s ON s.id = m.stadium_id
      ORDER BY m.id
    `);
    const allMatches = matchesRes.recordset;

    const groupMatches = allMatches.filter(m => m.group_name && m.stage === 'Fase de Grupos');
    const knockoutMatches = allMatches.filter(m => m.stage !== 'Fase de Grupos' && m.stage);

    // 2) Standings
    const standings = computeStandings(teams, groupMatches);

    // 3) Top-2 dos grupos completos + best 3rd ranking
    const top2 = {}; // group_name → { winner, runnerUp }
    const allThirds = [];
    for (const g of Object.keys(standings)) {
      if (!isGroupComplete(g, groupMatches)) continue;
      const sorted = standings[g];
      if (sorted.length < 4) continue;
      top2[g] = { winner: sorted[0], runnerUp: sorted[1] };
      allThirds.push(sorted[2]);
    }

    // Ranquear globalmente os 3ºs (mesmos critérios) e pegar top-8
    allThirds.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    const top8Thirds = allThirds.slice(0, 8);

    // 4) Matching bipartite: alloc 3ºs aos slots FIFA
    const thirdAssignments = top8Thirds.length === 8
      ? matchThirdsToSlots(top8Thirds)
      : new Map();

    // 5) Resolver R32 — cada match recebe slot1/slot2 baseado em top2 + thirds
    const ctx = {
      winner: (g) => top2[g] ? top2[g].winner : null,
      runnerUp: (g) => top2[g] ? top2[g].runnerUp : null,
      thirdAtSlot: (matchNum) => thirdAssignments.get(matchNum) || null,
    };

    // Mapa knockout match_number → row do DB
    // Os 32 knockout matches foram inseridos em ordem (R32 73-88, R16 89-96, etc.)
    // Vou usar a ordem para inferir match_number.
    const r32Rows = knockoutMatches.filter(m => m.stage === 'round_of_32');
    const r16Rows = knockoutMatches.filter(m => m.stage === 'round_of_16');
    const qfRows = knockoutMatches.filter(m => m.stage === 'quarter_final');
    const sfRows = knockoutMatches.filter(m => m.stage === 'semi_final');
    const thirdPlaceRow = knockoutMatches.find(m => m.stage === 'third_place');
    const finalRow = knockoutMatches.find(m => m.stage === 'final');

    // match_number = position in stage + start offset
    const matchNumberMap = new Map(); // match_id → match_number
    r32Rows.forEach((m, i) => matchNumberMap.set(m.id, 73 + i));
    r16Rows.forEach((m, i) => matchNumberMap.set(m.id, 89 + i));
    qfRows.forEach((m, i) => matchNumberMap.set(m.id, 97 + i));
    sfRows.forEach((m, i) => matchNumberMap.set(m.id, 101 + i));
    if (thirdPlaceRow) matchNumberMap.set(thirdPlaceRow.id, 103);
    if (finalRow) matchNumberMap.set(finalRow.id, 104);

    // Reverse: match_number → DB row
    const knockoutByNumber = new Map();
    for (const m of knockoutMatches) {
      const num = matchNumberMap.get(m.id);
      if (num) knockoutByNumber.set(num, m);
    }

    // Resolved teams por match_number (slot1, slot2)
    const resolved = new Map(); // match_number → { side1, side2 }

    // R32 first
    for (const num of Object.keys(R32_BRACKET).map(Number)) {
      const def = R32_BRACKET[num];
      resolved.set(num, {
        side1: def.side1(ctx),
        side2: def.side2(ctx),
      });
    }

    // Cascade R16-Final: precisa olhar o vencedor do match anterior
    // Knockout team map: id → team object para fast lookup
    const knockoutTeamMap = new Map();
    for (const t of teams) knockoutTeamMap.set(t.id, t);

    function resolveCascadeRound(pairs) {
      for (const p of pairs) {
        const m1 = knockoutByNumber.get(p.w1);
        const m2 = knockoutByNumber.get(p.w2);
        const r1 = pickWinnerLoser(m1, knockoutTeamMap);
        const r2 = pickWinnerLoser(m2, knockoutTeamMap);
        resolved.set(p.num, {
          side1: r1 ? r1.winner : null,
          side2: r2 ? r2.winner : null,
        });
      }
    }
    resolveCascadeRound(R16_PAIRS);
    resolveCascadeRound(QF_PAIRS);
    resolveCascadeRound(SF_PAIRS);

    // 3rd place: perdedores das semis (101, 102)
    const sf101 = pickWinnerLoser(knockoutByNumber.get(101), knockoutTeamMap);
    const sf102 = pickWinnerLoser(knockoutByNumber.get(102), knockoutTeamMap);
    resolved.set(THIRD_PLACE_NUM, {
      side1: sf101 ? sf101.loser : null,
      side2: sf102 ? sf102.loser : null,
    });
    resolved.set(FINAL_NUM, {
      side1: sf101 ? sf101.winner : null,
      side2: sf102 ? sf102.winner : null,
    });

    // 6) Persistir teams resolvidos no DB (UPDATE só se ainda NULL e agora resolvido)
    const pool = await getConnection();
    const updatesPromises = [];
    for (const [num, slots] of resolved.entries()) {
      const dbMatch = knockoutByNumber.get(num);
      if (!dbMatch) continue;
      const newHome = slots.side1?.id ?? null;
      const newAway = slots.side2?.id ?? null;
      const currentHome = dbMatch.home_team_id;
      const currentAway = dbMatch.away_team_id;
      const homeChanged = (newHome !== null && currentHome !== newHome);
      const awayChanged = (newAway !== null && currentAway !== newAway);
      if (homeChanged || awayChanged) {
        const reqUp = pool.request()
          .input('id', sql.Int, dbMatch.id)
          .input('home', sql.Int, newHome)
          .input('away', sql.Int, newAway);
        updatesPromises.push(
          reqUp.query('UPDATE matches SET home_team_id = @home, away_team_id = @away WHERE id = @id')
        );
        // Atualiza snapshot in-memory para a resposta
        dbMatch.home_team_id = newHome;
        dbMatch.away_team_id = newAway;
      }
    }
    await Promise.all(updatesPromises);

    // 7) Montar response — labels com placeholders quando team é null
    function buildLabel(num, slotKey, ctxKnow) {
      // Labels específicos por match_number
      const PLACEHOLDERS = {
        73: { side1: '2º Grupo A', side2: '2º Grupo B' },
        74: { side1: '1º Grupo E', side2: 'Melhor 3º (A/B/C/D/F)' },
        75: { side1: '1º Grupo F', side2: '2º Grupo C' },
        76: { side1: '1º Grupo C', side2: '2º Grupo F' },
        77: { side1: '1º Grupo I', side2: 'Melhor 3º (C/D/F/G/H)' },
        78: { side1: '2º Grupo E', side2: '2º Grupo I' },
        79: { side1: '1º Grupo A', side2: 'Melhor 3º (C/E/F/H/I)' },
        80: { side1: '1º Grupo L', side2: 'Melhor 3º (E/H/I/J/K)' },
        81: { side1: '1º Grupo D', side2: 'Melhor 3º (B/E/F/I/J)' },
        82: { side1: '1º Grupo G', side2: 'Melhor 3º (A/E/H/I/J)' },
        83: { side1: '2º Grupo K', side2: '2º Grupo L' },
        84: { side1: '1º Grupo H', side2: '2º Grupo J' },
        85: { side1: '1º Grupo B', side2: 'Melhor 3º (E/F/G/I/J)' },
        86: { side1: '1º Grupo J', side2: '2º Grupo H' },
        87: { side1: '1º Grupo K', side2: 'Melhor 3º (D/E/I/J/L)' },
        88: { side1: '2º Grupo D', side2: '2º Grupo G' },
      };
      if (PLACEHOLDERS[num]) return PLACEHOLDERS[num][slotKey];
      // R16+: "Vencedor M73" etc.
      const findOpponent = (pairs) => pairs.find(p => p.num === num);
      const r16 = findOpponent(R16_PAIRS);
      if (r16) return slotKey === 'side1' ? `Vencedor M${r16.w1}` : `Vencedor M${r16.w2}`;
      const qf = findOpponent(QF_PAIRS);
      if (qf) return slotKey === 'side1' ? `Vencedor M${qf.w1}` : `Vencedor M${qf.w2}`;
      const sf = findOpponent(SF_PAIRS);
      if (sf) return slotKey === 'side1' ? `Vencedor M${sf.w1}` : `Vencedor M${sf.w2}`;
      if (num === THIRD_PLACE_NUM) return slotKey === 'side1' ? 'Perdedor M101' : 'Perdedor M102';
      if (num === FINAL_NUM) return slotKey === 'side1' ? 'Vencedor M101' : 'Vencedor M102';
      return 'TBD';
    }

    function buildMatchResponse(num) {
      const dbMatch = knockoutByNumber.get(num);
      if (!dbMatch) return null;
      const slots = resolved.get(num) || { side1: null, side2: null };
      return {
        match_id: dbMatch.id,
        match_number: num,
        slot1: slots.side1 ? teamSlot(slots.side1) : placeholderSlot(buildLabel(num, 'side1')),
        slot2: slots.side2 ? teamSlot(slots.side2) : placeholderSlot(buildLabel(num, 'side2')),
        score1: dbMatch.home_score,
        score2: dbMatch.away_score,
        status: dbMatch.status,
        date: dbMatch.match_date,
        time: dbMatch.time,
        stadium_name: dbMatch.stadium_name,
        stadium_city: dbMatch.stadium_city,
      };
    }

    const response = {
      bracket: {
        round_of_32: Array.from({ length: 16 }, (_, i) => buildMatchResponse(73 + i)).filter(Boolean),
        round_of_16: Array.from({ length: 8 }, (_, i) => buildMatchResponse(89 + i)).filter(Boolean),
        quarter_final: Array.from({ length: 4 }, (_, i) => buildMatchResponse(97 + i)).filter(Boolean),
        semi_final: Array.from({ length: 2 }, (_, i) => buildMatchResponse(101 + i)).filter(Boolean),
        third_place: buildMatchResponse(THIRD_PLACE_NUM),
        final: buildMatchResponse(FINAL_NUM),
      },
    };

    res.json(response);
  } catch (err) {
    console.error('Erro ao calcular bracket:', err);
    res.status(500).json({ error: 'Erro ao calcular bracket' });
  }
});

module.exports = router;
