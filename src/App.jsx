import React, { useState, useEffect, useRef } from 'react';
import { Container, Text, Title, Card, Group, Badge, Progress, Stack, Button } from '@mantine/core';

const CHOICE_EMOJIS = { rock: '🪨', paper: '📄', scissors: '✂️' };
const CHOICES = ['rock', 'paper', 'scissors'];

export default function AutoRunningTeamRPS() {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState({
    phase: 'voting',
    gameNumber: 1,
    timeLeft: 30,
    team1Score: 0,
    team2Score: 0,
    team1PlayerCount: 0,
    team2PlayerCount: 0,
    winner: null,
    team1Choice: null,
    team2Choice: null
  });
  
  const [playerData, setPlayerData] = useState({
    id: null,
    name: '',
    team: null,
    hasVoted: false,
    vote: null
  });

  const playerDataRef = useRef({ id: null, name: '', team: null, hasVoted: false, vote: null });
  // console.log('Game State:', gameState);
  // console.log('Player Data:', playerData);
  const [teamVotes, setTeamVotes] = useState({ rock: 0, paper: 0, scissors: 0 });

  useEffect(() => {
    playerDataRef.current = playerData;
  }, [playerData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGameState(prev => {
        if (prev.timeLeft > 0) {
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Connect to WebSocket
  const connectWebSocket = () => {
    const wsUrl = 'ws://localhost:8080'; // Change this to your server URL
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('Connected to WebSocket server');
      setConnected(true);
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        switch (message.type) {
          case 'gameState':
            setGameState(message.data);
            // setGameState(prev => {
            //   const newState = { ...prev, ...message.data };

            //   // Detect phase change
            //   if (prev.phase !== "voting" && newState.phase === "voting") {
            //     // New round started → reset votes
            //     setTeamVotes({ rock: 0, paper: 0, scissors: 0 });
            //     setPlayerData(p => ({ ...p, hasVoted: false, vote: null }));
            //   }

            //   return newState;
            // });
            // Reset player vote state when new game starts

            if (message.data.phase === 'results') {
              setTeamVotes({ rock: 0, paper: 0, scissors: 0 });
              if (playerDataRef.current.hasVoted) {
                setPlayerData(prev => ({ ...prev, hasVoted: false, vote: null }));
              }
            }
            break;
            
          case 'joined':
            setPlayerData({
              id: message.data.playerId,
              team: message.data.team,
              name: message.data.playerName,
              hasVoted: false,
              vote: null
            });
            break;
            
          case 'voteConfirmed':
            setPlayerData(prev => ({
              ...prev,
              hasVoted: true,
              vote: message.data.choice
            }));
            break;
            
          case 'teamVotes':
            setTeamVotes(message.data.votes);
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.current.onclose = () => {
      console.log('Disconnected from WebSocket server');
      setConnected(false);
      setPlayerData({ id: null, name: '', team: null, hasVoted: false, vote: null });
      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  // Initialize connection
  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  // Send message to server
  const sendMessage = (type, data = {}) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...data }));
    }
  };

  // Vote
  const vote = (choice) => {
    if (gameState.phase === 'voting' && !playerData.hasVoted) {
      sendMessage('vote', { choice });
    }
  };

  // Calculate vote percentages
  const getTotalVotes = (votes) => {
    return Object.values(votes).reduce((sum, count) => sum + count, 0);
  };

  const getVotePercentage = (choice, votes) => {
    const total = getTotalVotes(votes);
    return total === 0 ? 0 : (votes[choice] / total) * 100;
  };

  // Connection status
  if (!connected || !playerData.team) {
    return (
      <Container style={{ height: '100%', minHeight: '100vh', width: '100vw', maxWidth: '100%', background: 'linear-gradient(135deg, #74ebd5 0%, #ACB6E5 100%)', }}>
        <Stack spacing="lg" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          <Card shadow="xl" padding="lg">
            <Stack align="center" spacing="md">
              <Title order={2}>🎮 Joining Game...</Title>
              <Text c="dimmed">
                {!connected ? 'Connecting to game server...' : 'Getting assigned to a team...'}
              </Text>
              <Progress value={0} animate />
              <Text size="sm" c="dimmed">
                No registration needed - you'll join automatically!
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Container>
    );
  }

  return (
    <Container style={{ height: '100%', minHeight: '100vh', width: '100vw', maxWidth: '100%', background: 'linear-gradient(135deg, #74ebd5 0%, #ACB6E5 100%)', }}>
      <Stack spacing="lg" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {/* Game Header */}
        <Card shadow="sm" padding="lg">
          <Group position="apart" mb="md">
            <div>
              <Title order={2}>Rocks, Paper, Scissors Democracy</Title>
              <Text c="dimmed">
                Round #{gameState.gameNumber} • {connected ? '🟢 Live' : '🔴 Reconnecting'}
              </Text>
            </div>
            <Group>
              <Badge color="blue" size="lg">Team Dolphin 🐬 Score: {gameState.team1Score}</Badge>
              <Badge color="yellow" size="lg">Team Banana 🍌 Score: {gameState.team2Score}</Badge>
            </Group>
          </Group>
          
          <Group position="apart" mb="md">
            <Badge 
              color={playerData.team === 1 ? 'blue' : 'yellow'} 
              size="lg"
              variant="filled"
            >
              You're on Team {playerData.team === 1 ? 'Dolphin 🐬' : 'Banana 🍌'}
            </Badge>
            <Badge variant="outline" size="md">
              {gameState.phase === 'voting' ? '⚔️ Battle Phase' : '🏆 Results'}
            </Badge>
          </Group>

          <Group spacing="xl">
            <Text size="sm" c="dimmed">
              🐬 Team Dolphin: {gameState.team1PlayerCount} players
            </Text>
            <Text size="sm" c="dimmed">
              🍌 Team Banana: {gameState.team2PlayerCount} players
            </Text>
          </Group>
        </Card>

        {/* Voting Phase */}
        {gameState.phase === 'voting' && (
          <Card shadow="sm" padding="lg">
            <Stack spacing="md">
              <Group position="apart" align="center">
                <Title order={3}>⚔️ Choose Your Weapon!</Title>
                <Badge color="orange" size="lg" variant="filled">
                  {gameState.timeLeft} seconds remaining
                </Badge>
              </Group>
              
              <Progress 
                value={((30 - gameState.timeLeft) / 30) * 100} 
                color={gameState.timeLeft <= 10 ? 'red' : 'blue'}
                size="lg"
              />
              
              {!playerData.hasVoted ? (
                <>
                  <Text align="center" c="dimmed" mb="md">
                    Vote now! Your team is counting on you!
                  </Text>
                  <Group justify="center" spacing="md">
                    {CHOICES.map(choice => (
                      <Button
                        key={choice}
                        size="xl"
                        variant="outline"
                        onClick={() => vote(choice)}
                        style={{ 
                          minHeight: '100px', 
                          minWidth: '140px',
                          fontSize: '1.1rem'
                        }}
                        // color={playerData.team === 1 ? 'blue' : 'yellow'}
                        color="blue"
                      >
                        <Stack align="center" spacing={8}>
                          <Text size="2.5rem">{CHOICE_EMOJIS[choice]}</Text>
                          <Text weight={600}>
                            {choice.charAt(0).toUpperCase() + choice.slice(1)}
                          </Text>
                        </Stack>
                      </Button>
                    ))}
                  </Group>
                </>
              ) : (
                <Card withBorder style={{ backgroundColor: '#f8f9fa' }}>
                  <Stack align="center" spacing="sm">
                    <Badge color="green" size="lg" variant="filled">✓ Vote Registered</Badge>
                    <Group align="center">
                      <Text size="2rem">{CHOICE_EMOJIS[playerData.vote]}</Text>
                      <Text weight={600} size="lg">
                        You chose {playerData.vote?.charAt(0).toUpperCase() + playerData.vote?.slice(1)}
                      </Text>
                    </Group>
                    <Text size="sm" color="dimmed">
                      Waiting for other players to vote...
                    </Text>
                  </Stack>
                </Card>
              )}

              {/* Team Vote Display */}
              <Card withBorder>
                <Title order={4} mb="md" color={playerData.team === 1 ? 'blue' : 'yellow'}>
                  🛡️ Team {playerData.team === 1 ? 'Dolphin 🐬' : 'Banana 🍌'} Strategy
                </Title>
                {CHOICES.map(choice => {
                  const percentage = getVotePercentage(choice, teamVotes);
                  const count = teamVotes[choice];
                  const isLeading = count > 0 && count === Math.max(...Object.values(teamVotes));
                  return (
                    <Group key={choice} position="apart" mb="xs">
                      <Group spacing="xs">
                        <Text weight={isLeading ? 600 : 400}>
                          {CHOICE_EMOJIS[choice]} {choice.charAt(0).toUpperCase() + choice.slice(1)}
                        </Text>
                        <Badge color={isLeading ? 'green' : 'gray'} variant={isLeading ? 'filled' : 'outline'}>
                          {count} votes
                        </Badge>
                      </Group>
                      <Progress 
                        value={percentage} 
                        style={{ flex: 1, maxWidth: '200px' }}
                        color={isLeading ? 'green' : 'gray'}
                      />
                    </Group>
                  );
                })}
              </Card>
            </Stack>
          </Card>
        )}

        {/* Results Phase */}
        {gameState.phase === 'results' && (
          <Card shadow="sm" padding="lg">
            <Stack spacing="lg" align="center">
              <Group align="center" spacing="sm">
                <Title order={3}>🏆 Battle Results</Title>
                <Badge color="orange" size="md">{gameState.timeLeft}s until next round</Badge>
              </Group>
              
              <Group position="center" spacing="xl">
                <Card 
                  withBorder 
                  padding="lg"
                  style={{ 
                    backgroundColor: gameState.winner === 'team1' ? '#e3f2fd' : 'white',
                    borderColor: gameState.winner === 'team1' ? '#2196f3' : '#dee2e6'
                  }}
                >
                  <Stack align="center">
                    <Badge color="blue" size="lg" variant="filled">Team Dolphin 🐬</Badge>
                    <Text size="4rem">{CHOICE_EMOJIS[gameState.team1Choice]}</Text>
                    <Text weight={600} size="lg">
                      {gameState.team1Choice?.charAt(0).toUpperCase() + gameState.team1Choice?.slice(1)}
                    </Text>
                    {gameState.winner === 'team1' && <Badge color="green" size="sm">WINNER!</Badge>}
                  </Stack>
                </Card>
                
                <Stack align="center" spacing="sm">
                  <Text size="2xl" weight={700}>VS</Text>
                  <Progress value={((5 - gameState.timeLeft) / 5) * 100} size="sm" />
                </Stack>
                
                <Card 
                  withBorder 
                  padding="lg"
                  style={{ 
                    backgroundColor: gameState.winner === 'team2' ? '#ffebee' : 'white',
                    borderColor: gameState.winner === 'team2' ? '#f44336' : '#dee2e6'
                  }}
                >
                  <Stack align="center">
                    <Badge color="yellow" size="lg" variant="filled">Team Banana 🍌</Badge>
                    <Text size="4rem">{CHOICE_EMOJIS[gameState.team2Choice]}</Text>
                    <Text weight={600} size="lg">
                      {gameState.team2Choice?.charAt(0).toUpperCase() + gameState.team2Choice?.slice(1)}
                    </Text>
                    {gameState.winner === 'team2' && <Badge color="green" size="sm">WINNER!</Badge>}
                  </Stack>
                </Card>
              </Group>

              <Badge 
                color={gameState.winner === 'tie' ? 'gray' : (gameState.winner === 'team1' ? 'blue' : 'yellow')} 
                size="xl" 
                variant="filled"
                style={{ fontSize: '1.2rem', padding: '12px 24px' }}
              >
                {gameState.winner === 'tie' 
                  ? "🤝 It's a Tie!" 
                  : `🎉 Team ${gameState.winner === 'team1' ? 'Dolphin 🐬' : 'Banana 🍌'} Wins the Round!`}
              </Badge>

              {gameState.winner === `team${playerData.team}` && (
                <Text c="green" size="xl" weight={700}>
                  🌟 Your team dominated this round! 🌟
                </Text>
              )}
              {gameState.winner !== `team${playerData.team}` && gameState.winner !== 'tie' && (
                <Text c="orange" size="lg" weight={500}>
                  💪 Get ready for revenge in the next round!
                </Text>
              )}

              <Text c="dimmed" align="center">
                🔄 Next battle starts automatically... Stay ready!
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
