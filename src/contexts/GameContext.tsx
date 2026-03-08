import { createContext, useContext, useEffect, useState } from 'react';
import { GameState, INITIAL_STATE, ChatMessage, DEFAULT_LOADING_MESSAGES } from '../types/game';
import { v4 as uuidv4 } from 'uuid';

interface GameContextType {
  state: GameState;
  updateState: (updates: Partial<GameState>) => void;
  loadSave: (json: string) => boolean;
  exportSave: () => string;
  resetGame: () => void;
  addMessage: (message: ChatMessage) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem('ai_rpg_save');
    return saved ? JSON.parse(saved) : INITIAL_STATE;
  });

  useEffect(() => {
    localStorage.setItem('ai_rpg_save', JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<GameState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const loadSave = (json: string): boolean => {
    try {
      const parsed = JSON.parse(json);
      // Basic validation
      if (!parsed.history || !Array.isArray(parsed.history)) return false;
      
      // Migration for old saves: Ensure new fields exist, remove extra fields
      const migratedState: GameState = {
        characterSettings: parsed.characterSettings ?? INITIAL_STATE.characterSettings,
        worldview: parsed.worldview ?? INITIAL_STATE.worldview,
        isFirstRun: parsed.isFirstRun ?? INITIAL_STATE.isFirstRun,
        summary: parsed.summary ?? INITIAL_STATE.summary,
        turnsSinceLastSummary: parsed.turnsSinceLastSummary ?? INITIAL_STATE.turnsSinceLastSummary,
        currentSceneVisuals: parsed.currentSceneVisuals ?? INITIAL_STATE.currentSceneVisuals,
        playerProfile: parsed.playerProfile,
        loadingMessages: parsed.loadingMessages || DEFAULT_LOADING_MESSAGES,
        
        // Consolidate inventory into status
        status: {
          ...INITIAL_STATE.status,
          ...(parsed.status || {}),
          inventory: parsed.status?.inventory || parsed.inventory || []
        },

        // Migration for pacingState
        pacingState: {
          tensionLevel: (parsed.pacingState && typeof parsed.pacingState.tensionLevel === 'number') 
            ? parsed.pacingState.tensionLevel 
            : INITIAL_STATE.pacingState.tensionLevel,
          turnsInCurrentLevel: (parsed.pacingState && typeof parsed.pacingState.turnsInCurrentLevel === 'number')
            ? parsed.pacingState.turnsInCurrentLevel
            : INITIAL_STATE.pacingState.turnsInCurrentLevel
        },
        
        // Migration for history: Ensure all messages have IDs and remove extra fields
        history: Array.isArray(parsed.history) 
          ? parsed.history.map((msg: any) => ({
              id: msg.id || uuidv4(),
              role: msg.role === 'user' || msg.role === 'model' ? msg.role : 'user',
              text: msg.text || '',
              imageFileName: msg.imageFileName,
              timestamp: msg.timestamp || Date.now(),
              pacingState: msg.pacingState,
              status: msg.status ? { ...msg.status, inventory: msg.status.inventory || msg.inventory || [] } : undefined,
              currentSceneVisuals: msg.currentSceneVisuals,
              debugState: msg.debugState
            }))
          : []
      };
      
      setState(migratedState);
      return true;
    } catch (e) {
      console.error("Invalid save file", e);
      return false;
    }
  };

  const exportSave = () => {
    return JSON.stringify(state, null, 2);
  };

  const resetGame = () => {
    setState(INITIAL_STATE);
  };

  const addMessage = (message: ChatMessage) => {
    setState(prev => ({
      ...prev,
      history: [...prev.history, {
        ...message,
        // Snapshot current game state into the message for rollback/undo support
        pacingState: prev.pacingState,
        status: prev.status,
        currentSceneVisuals: prev.currentSceneVisuals
      }]
    }));
  };

  return (
    <GameContext.Provider value={{ state, updateState, loadSave, exportSave, resetGame, addMessage }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
