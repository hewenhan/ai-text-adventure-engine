import { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { useNavigate } from 'react-router-dom';
import { ai, TEXT_MODEL } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { PlayerProfile, DEFAULT_LOADING_MESSAGES } from '../types/game';

export default function Setup() {
  const { state, updateState } = useGame();
  const navigate = useNavigate();
  const [step, setStep] = useState<'profile' | 'world'>('profile');
  
  // Profile State
  const [name, setName] = useState("");
  const [gender, setGender] = useState<PlayerProfile['gender']>('Male');
  const [orientation, setOrientation] = useState<PlayerProfile['orientation']>('Heterosexual');

  // World State
  const [inputWorldview, setInputWorldview] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [generatedLoadingMessages, setGeneratedLoadingMessages] = useState<string[]>([]);

  // Loading Message State
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(DEFAULT_LOADING_MESSAGES[0]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * DEFAULT_LOADING_MESSAGES.length);
        setCurrentLoadingMessage(DEFAULT_LOADING_MESSAGES[randomIndex]);
      }, 2000); // Change message every 2 seconds
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleProfileSubmit = () => {
    if (!name.trim()) return;
    updateState({
      playerProfile: {
        name,
        gender,
        orientation
      }
    });
    setStep('world');
  };

  const handleGenerate = async () => {
    if (!inputWorldview.trim()) return;
    setLoading(true);
    try {
      const prompt = `
        User input: "${inputWorldview}"
        
        Task 1: Generate 4 distinct, interesting, and immersive worldview descriptions for a roleplay game based on the input.
        Task 2: Generate 50 short, humorous, immersive "loading screen" messages related to this world theme. 
               Examples: "Connecting to neural net...", "Polishing slime...", "Calibrating gravity...". 
               Make them creative and relevant to the specific world theme if possible.
        
        Return ONLY a JSON object with this structure:
        {
          "worldviews": ["Description 1", "Description 2", "Description 3", "Description 4"],
          "loading_messages": ["Message 1", "Message 2", ... "Message 50"]
        }
        
        Translate EVERYTHING to Chinese.
        No markdown formatting.
      `;
      
      const result = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const text = result.text;
      if (!text) throw new Error("No text generated");
      // Clean up potential markdown code blocks
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.worldviews && Array.isArray(parsed.worldviews)) {
        setOptions(parsed.worldviews.slice(0, 4));
      }
      
      if (parsed.loading_messages && Array.isArray(parsed.loading_messages)) {
        setGeneratedLoadingMessages(parsed.loading_messages);
      }
      
    } catch (error) {
      console.error("Failed to generate worldviews", error);
      alert("生成世界观失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (worldview: string) => {
    updateState({ 
      worldview, 
      isFirstRun: false,
      // Save the generated loading messages, or fallback to default if empty
      loadingMessages: generatedLoadingMessages.length > 0 ? generatedLoadingMessages : DEFAULT_LOADING_MESSAGES
    });
    navigate('/chat');
  };

  if (step === 'profile') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8 bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800"
        >
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold">你是谁？</h2>
            <p className="text-zinc-400">告诉我们关于你角色的信息。</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">姓名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:ring-2 focus:ring-white/20 outline-none"
                placeholder="输入你的名字"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">性别</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'Male', label: '男' },
                  { value: 'Female', label: '女' },
                  { value: 'Non-binary', label: '非二元' },
                  { value: 'Other', label: '其他' }
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGender(g.value as any)}
                    className={`p-2 rounded-lg text-sm border transition-colors ${
                      gender === g.value 
                        ? 'bg-white text-black border-white' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">性取向</label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:ring-2 focus:ring-white/20 outline-none text-sm"
              >
                {[
                  { value: 'Heterosexual', label: '异性恋' },
                  { value: 'Homosexual', label: '同性恋' },
                  { value: 'Bisexual', label: '双性恋' },
                  { value: 'Pansexual', label: '泛性恋' },
                  { value: 'Asexual', label: '无性恋' },
                  { value: 'Other', label: '其他' }
                ].map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleProfileSubmit}
              disabled={!name.trim()}
              className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 disabled:opacity-50 mt-4"
            >
              下一步：创建世界
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-2xl w-full space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">定义世界</h2>
          <p className="text-zinc-400">我们的故事发生在哪里？</p>
        </div>

        {options.length === 0 ? (
          <div className="space-y-4">
            <textarea
              value={inputWorldview}
              onChange={(e) => setInputWorldview(e.target.value)}
              className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:ring-2 focus:ring-white/20 outline-none resize-none"
              placeholder="例如：一个雨水永不停歇的赛博朋克城市，或者一个充满古老魔法的中世纪地牢..."
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !inputWorldview.trim()}
              className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" />
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentLoadingMessage}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.2 }}
                    >
                      {currentLoadingMessage}
                    </motion.span>
                  </AnimatePresence>
                </div>
              ) : (
                "生成选项"
              )}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {options.map((opt, idx) => (
              <motion.button
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => handleSelect(opt)}
                className="text-left p-6 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all hover:bg-zinc-800"
              >
                {opt}
              </motion.button>
            ))}
            <button 
              onClick={() => setOptions([])}
              className="text-zinc-500 hover:text-zinc-300 text-sm mt-4"
            >
              返回输入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
