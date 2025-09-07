const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Game state
let gameState = {
  phase: 'voting', // Always 'voting' or 'results'
  gameNumber: 1,
  timeLeft: 30,
  team1: {
    players: [],
    votes: { rock: 0, paper: 0, scissors: 0 },
    choice: null,
    score: 0
  },
  team2: {
    players: [],
    votes: { rock: 0, paper: 0, scissors: 0 },
    choice: null,
    score: 0
  },
  winner: null,
  timer: null
};

const GAME_DURATION = 30;
const RESULTS_DURATION = 5;
const TICK_INTERVAL = 1000; // internal ticking every second
const BROADCAST_INTERVAL = 5; // send time updates every 5 seconds
const INACTIVE_TIMEOUT = 1200000;   // 2m
const HEARTBEAT_INTERVAL = 60000; // 60s
const BOT_COUNT = 10; // number of bots
const bots = [];
const CHOICES = ['rock', 'paper', 'scissors'];

function botVote(bot) {
  if (gameState.phase === "voting") {
    const choice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    const teamObj = bot.team === 1 ? gameState.team1 : gameState.team2;

    teamObj.votes[choice]++;
    console.log(`🤖 Bot ${bot.id} (Team ${bot.team}) voted ${choice}`);
  }
}

// Create bots as fake players
function initBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    const botId = `bot_${i}`;
    const team = 1 + (i % 2); // Alternate teams
    bots.push({ id: botId, team });
    console.log(`🤖 ${botId} joined Team ${team}`);
  }
}

// Each new voting phase → reset and make bots vote randomly
function botVotingRound() {
  bots.forEach(bot => {
    setTimeout(() => {
      botVote(bot);
      broadcastTeamVotes(bot.team);
    }, Math.random() * 15000); // bots vote within first 15s
  });
}

// Helper functions
const getWinner = (choice1, choice2) => {
  if (choice1 === choice2) return 'tie';
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'paper' && choice2 === 'rock') ||
    (choice1 === 'scissors' && choice2 === 'paper')
  ) {
    return 'team1';
  }
  return 'team2';
};

const getTopChoice = (votes) => {
  const entries = Object.entries(votes);
  if (entries.every(([_, count]) => count === 0)) {
    return CHOICES[Math.floor(Math.random() * 3)];
  }
  return entries.reduce((a, b) => votes[a[0]] > votes[b[0]] ? a : b)[0];
};

const getGameStateMessage = (gameState) => (
  JSON.stringify({
    type: 'gameState',
    data: {
      phase: gameState.phase,
      gameNumber: gameState.gameNumber,
      timeLeft: gameState.timeLeft,
      team1Score: gameState.team1.score,
      team2Score: gameState.team2.score,
      team1PlayerCount: gameState.team1.players.length + Math.floor(BOT_COUNT / 2),
      team2PlayerCount: gameState.team2.players.length + Math.floor(BOT_COUNT / 2),
      winner: gameState.winner,
      team1Choice: gameState.team1.choice,
      team2Choice: gameState.team2.choice
    }
  })
);

const broadcastGameState = () => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(getGameStateMessage(gameState));
    }
  });
};

const broadcastTeamVotes = (teamNumber) => {
  const team = teamNumber === 1 ? gameState.team1 : gameState.team2;
  const message = JSON.stringify({
    type: 'teamVotes',
    data: {
      team: teamNumber,
      votes: team.votes
    }
  });

  // Send to all clients on this team
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId && team.players.includes(client.playerId)) {
      client.send(message);
    }
  });
};

const startVotingPhase = () => {
  gameState.phase = 'voting';
  gameState.timeLeft = GAME_DURATION;
  gameState.team1.votes = { rock: 0, paper: 0, scissors: 0 };
  gameState.team2.votes = { rock: 0, paper: 0, scissors: 0 };
  gameState.team1.choice = null;
  gameState.team2.choice = null;
  gameState.winner = null;


  botVotingRound();

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.hasVoted = false;
      client.playerVote = null;
    }
  });

  broadcastGameState(); // initial broadcast

  clearInterval(gameState.timer);
  let tickCount = 0;

  gameState.timer = setInterval(() => {
    gameState.timeLeft--;
    tickCount++;
    // console.log(`Players: \nT1=${gameState.team1.players}\n\nT2=${gameState.team2.players}\n\n`);

    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      startResultsPhase();
    } else if (tickCount % BROADCAST_INTERVAL === 0) {
      // send a heartbeat update so clients stay in sync
      broadcastGameState();
    }
  }, TICK_INTERVAL);
};

const startResultsPhase = () => {
  gameState.team1.choice = getTopChoice(gameState.team1.votes);
  gameState.team2.choice = getTopChoice(gameState.team2.votes);
  gameState.winner = getWinner(gameState.team1.choice, gameState.team2.choice);

  if (gameState.winner === 'team1') gameState.team1.score++;
  else if (gameState.winner === 'team2') gameState.team2.score++;

  gameState.phase = 'results';
  gameState.timeLeft = RESULTS_DURATION;

  broadcastGameState(); // initial broadcast

  clearInterval(gameState.timer);
  let tickCount = 0;

  gameState.timer = setInterval(() => {
    gameState.timeLeft--;
    tickCount++;

    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      gameState.gameNumber++;
      startVotingPhase();
    } else if (tickCount % BROADCAST_INTERVAL === 0) {
      broadcastGameState();
    }
  }, TICK_INTERVAL);
};

const assignPlayerToTeam = (playerId) => {
  // Remove player from any existing team
  gameState.team1.players = gameState.team1.players.filter(id => id !== playerId);
  gameState.team2.players = gameState.team2.players.filter(id => id !== playerId);

  // Assign to team with fewer players, or randomly if equal
  let assignedTeam;
  if (gameState.team1.players.length < gameState.team2.players.length) {
    assignedTeam = 1;
  } else if (gameState.team2.players.length < gameState.team1.players.length) {
    assignedTeam = 2;
  } else {
    assignedTeam = Math.random() < 0.5 ? 1 : 2;
  }

  if (assignedTeam === 1) {
    gameState.team1.players.push(playerId);
  } else {
    gameState.team2.players.push(playerId);
  }

  return assignedTeam;
};

wss.on('connection', (ws) => {
  console.log('New player connected');

  // Immediately assign player to team with auto-generated name
  ws.playerId = 'player_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
  ws.hasVoted = false;
  ws.playerVote = null;
  ws.lastSeen = Date.now();
  
  const team = assignPlayerToTeam(ws.playerId);
  
  console.log(`${ws.playerId} joined Team ${team}`);
  
  // Send player their assignment
  ws.send(JSON.stringify({
    type: 'joined',
    data: { 
      team, 
      playerId: ws.playerId
    }
  }));
  
  // Send current game state
  // broadcastGameState();
  ws.send(getGameStateMessage(gameState));

  // Send current team votes if in voting phase
  if (gameState.phase === 'voting') {
    broadcastTeamVotes(team);
  }

  ws.on('message', (message) => {
    try {
      ws.lastSeen = Date.now();
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'vote':
          if (gameState.phase === 'voting' && ws.playerId && !ws.hasVoted) {
            const playerTeam = gameState.team1.players.includes(ws.playerId) ? 1 : 2;
            const team = playerTeam === 1 ? gameState.team1 : gameState.team2;
            
            team.votes[data.choice]++;
            ws.hasVoted = true;
            ws.playerVote = data.choice;

            console.log(`${ws.playerId} (Team ${playerTeam}) voted for ${data.choice}`);

            ws.send(JSON.stringify({
              type: 'voteConfirmed',
              data: { choice: data.choice }
            }));
            
            broadcastTeamVotes(playerTeam);
          }
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`${ws.playerId || 'Unknown player'} disconnected`);
    removePlayer(ws.playerId);
  });
});

// Function to remove a player cleanly
function removePlayer(playerId) {
  if (!playerId) return;
  gameState.team1.players = gameState.team1.players.filter(id => id !== playerId);
  gameState.team2.players = gameState.team2.players.filter(id => id !== playerId);
}

setInterval(() => {
  const now = Date.now();
  wss.clients.forEach((ws) => {
    if (now - ws.lastSeen > INACTIVE_TIMEOUT) {
      console.log(`${ws.playerId} is inactive, last seen ${(now - ws.lastSeen)/1000}s ago removing...`);
      removePlayer(ws.playerId);
      return ws.terminate();
    }
  });
}, HEARTBEAT_INTERVAL);

// Start the game immediately when server starts
console.log('Starting continuous game...');
startVotingPhase();
initBots();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});