// Rounds and the match. One round is a buy phase, a live phase and a short end banner;
// the match is first to five round wins. The module owns the clock, the phase, the
// planted sub-state and the score; main.js owns what a win or a loss does to the money.
// Phases: buy -> live -> over -> buy. PLANTED is a branch of live: while the bomb is
// planted the round clock freezes and only the fuse can end the round.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 3.5;
export const MATCH_WINS = 5;

export function createRounds() {
  const state = {
    round: 1,
    wins: 0,
    losses: 0,
    phase: 'buy', // buy | live | over
    phaseLeft: BUY_SECONDS,
    planted: false, // true from the plant until the round ends
    matchOver: false,
    matchWon: false,
    lastResult: null, // 'win' | 'loss' | null
    lastReason: '',
  };

  function resetMatch() {
    state.round = 1;
    state.wins = 0;
    state.losses = 0;
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.planted = false;
    state.matchOver = false;
    state.matchWon = false;
    state.lastResult = null;
    state.lastReason = '';
  }

  function nextRound() {
    state.round += 1;
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.planted = false;
    state.lastResult = null;
    state.lastReason = '';
  }

  function startLive() {
    state.phase = 'live';
    state.phaseLeft = ROUND_SECONDS;
  }

  // Called by main.js the moment the plant completes. From here the fuse, not the
  // round clock, decides the round.
  function setPlanted(value) {
    state.planted = value;
  }

  // Ends the round, records the win or loss and reports whether the match is over.
  // Returns 'match' when the match just ended, 'round' when only the round did, and
  // null when the round already ended — so the win/loss bonus is paid exactly once.
  function endRound(won, reason) {
    if (state.phase === 'over') return null;
    state.phase = 'over';
    state.phaseLeft = END_SECONDS;
    state.planted = false;
    state.lastResult = won ? 'win' : 'loss';
    state.lastReason = reason;
    if (won) state.wins += 1;
    else state.losses += 1;
    if (state.wins >= MATCH_WINS || state.losses >= MATCH_WINS) {
      state.matchOver = true;
      state.matchWon = state.wins >= MATCH_WINS;
      return 'match';
    }
    return 'round';
  }

  // Advances the clock. Returns 'live' on the frame the buy phase ends, 'next' on the
  // frame the end banner ends, else null. While the bomb is planted the clock freezes:
  // the fuse decides the round, so a timeout can never steal a planted round.
  function step(dt) {
    if (state.phase === 'over' && state.matchOver) return null;
    if (state.phase === 'live' && state.planted) return null;
    state.phaseLeft -= dt;
    if (state.phaseLeft > 0) return null;
    if (state.phase === 'buy') {
      startLive();
      return 'live';
    }
    if (state.phase === 'live') {
      return 'timeout';
    }
    if (state.phase === 'over') {
      nextRound();
      return 'next';
    }
    return null;
  }

  return { state, resetMatch, nextRound, startLive, setPlanted, endRound, step };
}
