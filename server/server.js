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
const CHOICES = ['rock', 'paper', 'scissors'];

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

const broadcastGameState = () => {
  const message = JSON.stringify({
    type: 'gameState',
    data: {
      phase: gameState.phase,
      gameNumber: gameState.gameNumber,
      timeLeft: gameState.timeLeft,
      team1Score: gameState.team1.score,
      team2Score: gameState.team2.score,
      team1PlayerCount: gameState.team1.players.length,
      team2PlayerCount: gameState.team2.players.length,
      winner: gameState.winner,
      team1Choice: gameState.team1.choice,
      team2Choice: gameState.team2.choice
    }
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
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
  console.log(`Starting game ${gameState.gameNumber}`);
  gameState.phase = 'voting';
  gameState.timeLeft = GAME_DURATION;
  gameState.team1.votes = { rock: 0, paper: 0, scissors: 0 };
  gameState.team2.votes = { rock: 0, paper: 0, scissors: 0 };
  gameState.team1.choice = null;
  gameState.team2.choice = null;
  gameState.winner = null;

  // Reset all players' vote status
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.hasVoted = false;
      client.playerVote = null;
    }
  });

  // Clear existing timer
  if (gameState.timer) {
    clearInterval(gameState.timer);
  }

  // Start countdown timer
  gameState.timer = setInterval(() => {
    gameState.timeLeft--;
    
    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      startResultsPhase();
    } else {
      broadcastGameState();
    }
  }, 1000);

  broadcastGameState();
};

const startResultsPhase = () => {
  console.log('Calculating results...');
  
  // Calculate results
  gameState.team1.choice = getTopChoice(gameState.team1.votes);
  gameState.team2.choice = getTopChoice(gameState.team2.votes);
  gameState.winner = getWinner(gameState.team1.choice, gameState.team2.choice);
  
  if (gameState.winner === 'team1') {
    gameState.team1.score++;
  } else if (gameState.winner === 'team2') {
    gameState.team2.score++;
  }
  
  gameState.phase = 'results';
  gameState.timeLeft = RESULTS_DURATION;
  
  console.log(`Game ${gameState.gameNumber} results: Team 1 (${gameState.team1.choice}) vs Team 2 (${gameState.team2.choice}) - Winner: ${gameState.winner}`);
  
  broadcastGameState();
  
  // Start results countdown
  gameState.timer = setInterval(() => {
    gameState.timeLeft--;
    
    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timer);
      gameState.gameNumber++;
      startVotingPhase();
    } else {
      broadcastGameState();
    }
  }, 1000);
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

const generatePlayerName = () => {
  const adjectives = ['Swift', 'Brave', 'Smart', 'Quick', 'Bold', 'Wise', 'Cool', 'Fast', 'Sharp', 'Bright'];
  const animals = ['Fox', 'Wolf', 'Eagle', 'Lion', 'Tiger', 'Bear', 'Hawk', 'Shark', 'Falcon', 'Panther'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj}${animal}${Math.floor(Math.random() * 99) + 1}`;
};

wss.on('connection', (ws) => {
  console.log('New player connected');

  // Immediately assign player to team with auto-generated name
  ws.playerId = 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  ws.playerName = generatePlayerName();
  ws.hasVoted = false;
  ws.playerVote = null;
  
  const team = assignPlayerToTeam(ws.playerId);
  
  console.log(`${ws.playerName} joined Team ${team}`);
  
  // Send player their assignment
  ws.send(JSON.stringify({
    type: 'joined',
    data: { 
      team, 
      playerName: ws.playerName,
      playerId: ws.playerId
    }
  }));
  
  // Send current game state
  broadcastGameState();
  
  // Send current team votes if in voting phase
  if (gameState.phase === 'voting') {
    broadcastTeamVotes(team);
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'vote':
          if (gameState.phase === 'voting' && ws.playerId && !ws.hasVoted) {
            const playerTeam = gameState.team1.players.includes(ws.playerId) ? 1 : 2;
            const team = playerTeam === 1 ? gameState.team1 : gameState.team2;
            
            team.votes[data.choice]++;
            ws.hasVoted = true;
            ws.playerVote = data.choice;
            
            console.log(`${ws.playerName} (Team ${playerTeam}) voted for ${data.choice}`);
            
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
    console.log(`${ws.playerName || 'Unknown player'} disconnected`);
    
    if (ws.playerId) {
      // Remove player from teams
      gameState.team1.players = gameState.team1.players.filter(id => id !== ws.playerId);
      gameState.team2.players = gameState.team2.players.filter(id => id !== ws.playerId);
      broadcastGameState();
    }
  });
});

// Start the game immediately when server starts
console.log('Starting continuous game...');
startVotingPhase();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log('Game is running continuously - players can join anytime!');
});