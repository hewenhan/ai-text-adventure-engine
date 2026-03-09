import React, { useState } from 'react';
import { GameState, ENABLE_DEBUG_UI } from '../types/game';

interface DebugOverlayProps {
  state: GameState;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ state }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!ENABLE_DEBUG_UI) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-mono opacity-50 hover:opacity-100 transition-opacity"
      >
        DEBUG
      </button>
    );
  }

  const { pacingState } = state;
  const lastMessageWithDebug = [...state.history].reverse().find(m => m.debugState);
  const debugState = lastMessageWithDebug?.debugState;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      {/* Backdrop to close on click outside */}
      <div 
        className="absolute inset-0 pointer-events-auto" 
        onClick={() => setIsOpen(false)}
      />
      
      {/* Debug Window */}
      <div className="relative m-4 w-80 bg-black/80 backdrop-blur-md text-green-400 p-4 rounded-lg border border-green-500/30 font-mono text-xs shadow-2xl pointer-events-auto">
        <div className="flex justify-between items-center mb-2 border-b border-green-500/30 pb-1">
          <h3 className="font-bold">DEBUG CONSOLE</h3>
          <button onClick={() => setIsOpen(false)} className="text-red-400 hover:text-red-300">
            [X]
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <span className="text-gray-400">Tension Level:</span>{' '}
            <span className={`font-bold ${
              pacingState.tensionLevel >= 3 ? 'text-red-500' : 'text-green-300'
            }`}>
              {pacingState.tensionLevel} / 4
            </span>
            <span className="ml-2 text-gray-500">
              ({pacingState.turnsInCurrentLevel} turns)
            </span>
          </div>

          {/* HP & Lives */}
          <div>
            <span className="text-gray-400">HP:</span>{' '}
            <span className={state.hp <= 30 ? 'text-red-400 font-bold' : 'text-green-300'}>
              {state.hp}/100
            </span>
            <span className="ml-2 text-gray-400">Lives:</span>{' '}
            <span className="text-yellow-300">{state.lives}</span>
            {state.isGameOver && <span className="text-red-500 font-bold ml-2">GAME OVER</span>}
          </div>

          {/* Location */}
          <div>
            <span className="text-gray-400">Node:</span>{' '}
            <span className="text-cyan-300">{state.currentNodeId || 'null'}</span>
            <span className="ml-2 text-gray-400">House:</span>{' '}
            <span className="text-cyan-300">{state.currentHouseId || 'outdoor'}</span>
          </div>

          {debugState ? (
            <>
              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-gray-300 font-bold mb-1">LAST TURN STATS</div>
                <div className="grid grid-cols-2 gap-1">
                  <div>D20 Roll:</div>
                  <div className={debugState.lastIsSuccess ? 'text-green-400' : 'text-red-400'}>
                    {debugState.lastActionRoll}
                  </div>
                  
                  <div>Result:</div>
                  <div>{debugState.lastIsSuccess ? 'SUCCESS' : 'FAILURE'}</div>

                  {debugState.lastIntent && (
                    <>
                      <div>Intent:</div>
                      <div className="text-purple-300">{debugState.lastIntent}</div>
                    </>
                  )}
                </div>
              </div>

              {debugState.lastNarrativeInstruction && (
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div className="text-gray-300 font-bold mb-1">NARRATIVE INSTRUCTION</div>
                  <div className="text-yellow-200 text-[10px] max-h-16 overflow-y-auto">
                    {debugState.lastNarrativeInstruction}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-gray-300 font-bold mb-1">IMAGE GEN STATUS</div>
                <div className="break-all">
                  <div className="mb-1">
                    <span className="text-gray-400">Prompt:</span>{' '}
                    {debugState.lastImagePrompt ? (
                      <span className="text-blue-300 truncate block h-4 overflow-hidden" title={debugState.lastImagePrompt}>
                        {debugState.lastImagePrompt.substring(0, 30)}...
                      </span>
                    ) : (
                      <span className="text-red-500">MISSING</span>
                    )}
                  </div>
                  {debugState.lastImageError && (
                    <div className="text-red-400 mt-1">
                      Error: {debugState.lastImageError}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500 italic mt-2">No action data yet...</div>
          )}
          
          <div className="border-t border-gray-700 pt-2 mt-2">
             <div className="text-gray-300 font-bold mb-1">PLAYER STATUS</div>
             <div>HP: {state.hp}/100 | Lives: {state.lives}</div>
             <div>Inventory: {state.inventory.length} items</div>
             <div>Progress Keys: {Object.keys(state.progressMap).length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
