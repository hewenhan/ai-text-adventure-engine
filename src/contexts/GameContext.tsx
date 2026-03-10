import { createContext, useContext, useEffect, useState } from 'react';
import { GameState, INITIAL_STATE, ChatMessage, DEFAULT_LOADING_MESSAGES } from '../types/game';
import { v4 as uuidv4 } from 'uuid';

interface GameContextType {
  state: GameState;
  updateState: (updates: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void;
  loadSave: (json: string) => boolean;
  exportSave: () => string;
  resetGame: () => void;
  addMessage: (message: ChatMessage) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem('ai_rpg_save');
    if (!saved) return INITIAL_STATE;
    const parsed = JSON.parse(saved);
    return { ...INITIAL_STATE, ...parsed, currentObjective: parsed.currentObjective ?? null };
  });

  useEffect(() => {
    localStorage.setItem('ai_rpg_save', JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => {
    setState(prev => {
      const newUpdates = typeof updates === 'function' ? updates(prev) : updates;
      return { ...prev, ...newUpdates };
    });
  };

  const loadSave = (json: string): boolean => {
    try {
      const parsed = JSON.parse(json);
      // Basic validation
      if (!parsed.history || !Array.isArray(parsed.history)) return false;
      
      // Migration for old saves: Ensure new fields exist
      const migratedState: GameState = {
        characterSettings: parsed.characterSettings ?? INITIAL_STATE.characterSettings,
        worldview: parsed.worldview ?? INITIAL_STATE.worldview,
        isFirstRun: parsed.isFirstRun ?? INITIAL_STATE.isFirstRun,
        summary: parsed.summary ?? INITIAL_STATE.summary,
        turnsSinceLastSummary: parsed.turnsSinceLastSummary ?? INITIAL_STATE.turnsSinceLastSummary,
        playerProfile: parsed.playerProfile,
        loadingMessages: parsed.loadingMessages || DEFAULT_LOADING_MESSAGES,
        language: parsed.language || INITIAL_STATE.language,
        
        // New survival fields (with migration from old saves)
        hp: typeof parsed.hp === 'number' ? parsed.hp : (parsed.status?.health ?? 100),
        lives: typeof parsed.lives === 'number' ? parsed.lives : 3,
        isGameOver: parsed.isGameOver ?? false,
        inventory: Array.isArray(parsed.inventory) ? parsed.inventory : (parsed.status?.inventory || []),
        status: parsed.status ?? {},

        // Spatial fields
        worldData: parsed.worldData ?? null,
        mapImageUrl: parsed.mapImageUrl ?? null,
        currentWorldId: parsed.currentWorldId ?? null,
        currentNodeId: parsed.currentNodeId ?? null,
        currentHouseId: parsed.currentHouseId ?? null,

        // Progress
        progressMap: parsed.progressMap ?? {},

        // Migration for pacingState
        pacingState: {
          tensionLevel: (parsed.pacingState && typeof parsed.pacingState.tensionLevel === 'number') 
            ? parsed.pacingState.tensionLevel 
            : INITIAL_STATE.pacingState.tensionLevel,
          turnsInCurrentLevel: (parsed.pacingState && typeof parsed.pacingState.turnsInCurrentLevel === 'number')
            ? parsed.pacingState.turnsInCurrentLevel
            : INITIAL_STATE.pacingState.turnsInCurrentLevel
        },

        // Objective tracking
        currentObjective: parsed.currentObjective ?? null,
        
        // Migration for history: Ensure all messages have IDs
        history: Array.isArray(parsed.history) 
          ? parsed.history.map((msg: any) => ({
              id: msg.id || uuidv4(),
              role: msg.role === 'user' || msg.role === 'model' ? msg.role : 'user',
              text: msg.text || '',
              imageFileName: msg.imageFileName,
              timestamp: msg.timestamp || Date.now(),
              pacingState: msg.pacingState,
              hp: msg.hp,
              inventory: msg.inventory,
              status: msg.status,
              currentSceneVisuals: msg.currentSceneVisuals,
              currentNodeId: msg.currentNodeId,
              currentHouseId: msg.currentHouseId,
              debugState: msg.debugState,
              bgmKey: msg.bgmKey
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
        hp: prev.hp,
        inventory: [...prev.inventory],
        status: prev.status,
        currentNodeId: prev.currentNodeId ?? undefined,
        currentHouseId: prev.currentHouseId
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
