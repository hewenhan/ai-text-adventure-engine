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

          {debugState ? (
            <>
              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-gray-300 font-bold mb-1">LAST TURN STATS</div>
                <div className="grid grid-cols-2 gap-1">
                  <div>Roll:</div>
                  <div className={debugState.lastActionRoll >= debugState.lastSuccessThreshold ? 'text-green-400' : 'text-red-400'}>
                    {debugState.lastActionRoll} (Target: {debugState.lastSuccessThreshold})
                  </div>
                  
                  <div>Result:</div>
                  <div>{debugState.lastIsSuccess ? 'SUCCESS' : 'FAILURE'}</div>
                </div>
              </div>

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
             <div>Health: {state.status.health}</div>
             <div>Inventory: {(state.status.inventory || []).length} items</div>
          </div>
        </div>
      </div>
    </div>
  );
};
