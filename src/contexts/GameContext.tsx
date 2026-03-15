import { createContext, useContext, useEffect, useState } from 'react';
import { GameState, INITIAL_STATE, ChatMessage, DEFAULT_LOADING_MESSAGES, DEFAULT_PROFILE, normalizeConnections, WorldData } from '../types/game';
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


/**
 * Unified migration entry for future save compatibility.
 * Extend this function if new migration logic is needed for future versions.
 */
function migrateSave(parsed: any): any {
  // Example: if (parsed.version < 2) { ... }
  // Currently, no legacy migration is performed. Only for future compatibility.
  return parsed;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(() => {
    const saved = localStorage.getItem('ai_rpg_save');
    if (!saved) return INITIAL_STATE;
    const parsed = migrateSave(JSON.parse(saved));
    return { ...INITIAL_STATE, ...parsed };
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
      const parsed = migrateSave(JSON.parse(json));
      if (!parsed.history || !Array.isArray(parsed.history)) return false;
      setState({ ...INITIAL_STATE, ...parsed });
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
        inventory: prev.inventory.map(item => ({ ...item })),
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
