const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');

/**
 * Lấy lịch sử 20 trận gần nhất của user
 */
const getPlayerHistory = async (userId) => {
  const matchPlayers = await MatchPlayer.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('matchId');

  return matchPlayers.map(mp => {
    const match = mp.matchId;
    return {
      match_id: mp.matchId?._id,
      role: mp.role,
      did_win: mp.didWin,
      is_infected: mp.isInfected,
      eliminated_round: mp.eliminatedRound,
      started_at: match?.startedAt,
      ended_at: match?.endedAt,
      winner_role: match?.winnerRole
    };
  });
};

module.exports = {
  getPlayerHistory,
};
