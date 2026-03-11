import { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { useNavigate } from 'react-router-dom';
import { ai, PRO_MODEL } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { PlayerProfile, AICharacterSetup, DEFAULT_LOADING_MESSAGES } from '../types/game';
import { FakeProgressBar, FakeProgressBarHandle } from '../components/FakeProgressBar';
import { ArtStylePicker } from '../components/ArtStylePicker';
import { ArtStyleOption } from '../types/artStyles';

// ── Dropdown option constants ──
const AGE_OPTIONS = [
  { value: '', label: '随机（AI 决定）' },
  { value: '14-16岁', label: '14-16岁 · 少年' },
  { value: '17-19岁', label: '17-19岁 · 青少年' },
  { value: '20-25岁', label: '20-25岁 · 青年' },
  { value: '26-30岁', label: '26-30岁 · 轻熟' },
  { value: '31-40岁', label: '31-40岁 · 壮年' },
  { value: '41-55岁', label: '41-55岁 · 中年' },
  { value: '56岁以上', label: '56岁以上 · 长者' },
];

const SKIN_COLOR_OPTIONS = [
  { value: '', label: '随机（AI 决定）' },
  { value: '白皙', label: '白皙' },
  { value: '象牙白', label: '象牙白' },
  { value: '自然肤色', label: '自然肤色' },
  { value: '小麦色', label: '小麦色' },
  { value: '蜜糖色', label: '蜜糖色' },
  { value: '古铜色', label: '古铜色' },
  { value: '棕褐色', label: '棕褐色' },
  { value: '深棕色', label: '深棕色' },
  { value: '黝黑', label: '黝黑' },
];

const HEIGHT_OPTIONS = [
  { value: '', label: '随机（AI 决定）' },
  { value: '150cm以下', label: '150cm以下 · 娇小' },
  { value: '150-160cm', label: '150-160cm · 小个子' },
  { value: '160-170cm', label: '160-170cm · 中等' },
  { value: '170-175cm', label: '170-175cm · 中偏高' },
  { value: '175-180cm', label: '175-180cm · 较高' },
  { value: '180-185cm', label: '180-185cm · 高个子' },
  { value: '185-190cm', label: '185-190cm · 很高' },
  { value: '190cm以上', label: '190cm以上 · 极高' },
];

const WEIGHT_OPTIONS = [
  { value: '', label: '随机（AI 决定）' },
  { value: '纤瘦', label: '纤瘦' },
  { value: '偏瘦', label: '偏瘦' },
  { value: '匀称', label: '匀称' },
  { value: '健壮', label: '健壮 · 肌肉型' },
  { value: '微胖', label: '微胖' },
  { value: '丰满', label: '丰满' },
  { value: '魁梧', label: '魁梧 · 大块头' },
];

export default function Setup() {
  const { state, updateState } = useGame();
  const navigate = useNavigate();
  const [step, setStep] = useState<'player' | 'aiCharacter' | 'world' | 'artStyle'>('player');
  
  // Step 1: Player Profile State
  const [playerName, setPlayerName] = useState("");
  const [playerAge, setPlayerAge] = useState("");
  const [playerGender, setPlayerGender] = useState<PlayerProfile['gender']>('Male');
  const [playerOrientation, setPlayerOrientation] = useState<PlayerProfile['orientation']>('Heterosexual');
  const [playerSkinColor, setPlayerSkinColor] = useState("");
  const [playerHeight, setPlayerHeight] = useState("");
  const [playerWeight, setPlayerWeight] = useState("");
  const [playerPersonalityDesc, setPlayerPersonalityDesc] = useState("");

  // Step 2: AI Character Setup State
  const [aiName, setAiName] = useState("");
  const [aiAge, setAiAge] = useState("");
  const [aiGender, setAiGender] = useState("");
  const [aiOrientation, setAiOrientation] = useState("");
  const [aiSkinColor, setAiSkinColor] = useState("");
  const [aiHeight, setAiHeight] = useState("");
  const [aiWeight, setAiWeight] = useState("");
  const [aiPersonalityDesc, setAiPersonalityDesc] = useState("");
  const [aiSpecialties, setAiSpecialties] = useState("");
  const [aiHobbies, setAiHobbies] = useState("");
  const [aiDislikes, setAiDislikes] = useState("");

  // Step 3: World State
  const [inputWorldview, setInputWorldview] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [generatedLoadingMessages, setGeneratedLoadingMessages] = useState<string[]>([]);
  const [selectedWorldview, setSelectedWorldview] = useState<string | null>(null);

  // Loading Message State
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(DEFAULT_LOADING_MESSAGES[0]);

  // Progress bar ref
  const progressBarRef = useRef<FakeProgressBarHandle>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * DEFAULT_LOADING_MESSAGES.length);
        setCurrentLoadingMessage(DEFAULT_LOADING_MESSAGES[randomIndex]);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handlePlayerSubmit = () => {
    updateState({
      playerProfile: {
        name: playerName,
        age: playerAge,
        gender: playerGender,
        orientation: playerOrientation,
        skinColor: playerSkinColor,
        height: playerHeight,
        weight: playerWeight,
        personalityDesc: playerPersonalityDesc,
        hairStyle: '',
        hairColor: '',
      }
    });
    setStep('aiCharacter');
  };

  const handleAiCharacterSubmit = () => {
    const aiSetup: AICharacterSetup = {
      name: aiName,
      age: aiAge,
      gender: aiGender,
      orientation: aiOrientation,
      skinColor: aiSkinColor,
      height: aiHeight,
      weight: aiWeight,
      personalityDesc: aiPersonalityDesc,
      specialties: aiSpecialties,
      hobbies: aiHobbies,
      dislikes: aiDislikes,
      hairStyle: '',
      hairColor: '',
    };
    updateState({
      aiCharacterSetup: aiSetup,
      characterSettings: {
        ...state.characterSettings,
        name: aiName,
        gender: aiGender,
        description: aiPersonalityDesc,
        specialties: '',
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
        model: PRO_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const text = result.text;
      if (!text) throw new Error("No text generated");
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
      progressBarRef.current?.finish();
      setTimeout(() => setLoading(false), 600);
    }
  };

  const handleSelect = (worldview: string) => {
    setSelectedWorldview(worldview);
    setStep('artStyle');
  };

  const handleArtStyleSelect = (option: ArtStyleOption | 'system') => {
    if (!selectedWorldview) return;
    if (option === 'system') {
      updateState({
        worldview: selectedWorldview,
        worldviewUserInput: inputWorldview,
        isFirstRun: false,
        loadingMessages: generatedLoadingMessages.length > 0 ? generatedLoadingMessages : DEFAULT_LOADING_MESSAGES,
      });
    } else {
      updateState({
        worldview: selectedWorldview,
        worldviewUserInput: inputWorldview,
        isFirstRun: false,
        artStylePrompt: option.prompt,
        loadingMessages: generatedLoadingMessages.length > 0 ? generatedLoadingMessages : DEFAULT_LOADING_MESSAGES,
      });
    }
    navigate('/chat');
  };

  // ── Helper: select dropdown ──
  const selectField = (label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-white/20 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  // Helper: styled text input field
  const inputField = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-white/20 outline-none"
        placeholder={placeholder}
      />
    </div>
  );

  // Helper: textarea field
  const textareaField = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-white/20 outline-none resize-none h-20"
        placeholder={placeholder}
      />
    </div>
  );

  // Step indicator
  const stepIndicator = (current: number) => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
            s < current ? 'bg-emerald-500 border-emerald-500 text-black' :
            s === current ? 'bg-white border-white text-black' :
            'bg-zinc-900 border-zinc-700 text-zinc-500'
          }`}>{s}</div>
          {s < 3 && <div className={`w-8 h-0.5 ${s < current ? 'bg-emerald-500' : 'bg-zinc-700'}`} />}
        </div>
      ))}
    </div>
  );

  // ── Step 1: Player Profile ──
  if (step === 'player') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-6 bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800"
        >
          {stepIndicator(1)}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold">你是谁？</h2>
            <p className="text-zinc-400 text-sm">塑造你在这个世界中的形象。留空的项目将由 AI 自动补全。</p>
          </div>

          <div className="space-y-4">
            {inputField("姓名（可留空）", playerName, setPlayerName, "不填则由 AI 根据世界观生成")}

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">性别</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 'Male', label: '男' },
                  { value: 'Female', label: '女' },
                  { value: 'Non-binary', label: '非二元' },
                  { value: 'Other', label: '其他' }
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setPlayerGender(g.value as any)}
                    className={`p-2 rounded-lg text-sm border transition-colors ${
                      playerGender === g.value 
                        ? 'bg-white text-black border-white' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {selectField("年龄段", playerAge, setPlayerAge, AGE_OPTIONS)}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">性取向</label>
                <select
                  value={playerOrientation}
                  onChange={(e) => setPlayerOrientation(e.target.value as any)}
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
            </div>

            <div className="grid grid-cols-3 gap-3">
              {selectField("肤色", playerSkinColor, setPlayerSkinColor, SKIN_COLOR_OPTIONS)}
              {selectField("身高", playerHeight, setPlayerHeight, HEIGHT_OPTIONS)}
              {selectField("体型", playerWeight, setPlayerWeight, WEIGHT_OPTIONS)}
            </div>

            {textareaField("性格描述（可留空）", playerPersonalityDesc, setPlayerPersonalityDesc, "描述一下你的性格特点，留空则由 AI 生成...")}

            <button
              onClick={handlePlayerSubmit}
              className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 mt-2"
            >
              下一步：设定 AI 角色
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Step 2: AI Character Setup ──
  if (step === 'aiCharacter') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-6 bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800"
        >
          {stepIndicator(2)}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold">你的搭档是谁？</h2>
            <p className="text-zinc-400 text-sm">设定 AI 角色的基本信息。留空的项目将由 AI 自动补全，发型发色由 AI 生成。</p>
          </div>

          <div className="space-y-4">
            {inputField("姓名（可留空）", aiName, setAiName, "不填则由 AI 根据世界观生成")}

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">性别</label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { value: '', label: '随机' },
                  { value: '男', label: '男' },
                  { value: '女', label: '女' },
                  { value: '非二元', label: '非二元' },
                  { value: '其他', label: '其他' }
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setAiGender(g.value)}
                    className={`p-2 rounded-lg text-sm border transition-colors ${
                      aiGender === g.value 
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
                value={aiOrientation}
                onChange={(e) => setAiOrientation(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:ring-2 focus:ring-white/20 outline-none text-sm"
              >
                {[
                  { value: '', label: '随机（AI 决定）' },
                  { value: '异性恋', label: '异性恋' },
                  { value: '同性恋', label: '同性恋' },
                  { value: '双性恋', label: '双性恋' },
                  { value: '泛性恋', label: '泛性恋' },
                  { value: '无性恋', label: '无性恋' },
                  { value: '其他', label: '其他' }
                ].map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {selectField("年龄段", aiAge, setAiAge, AGE_OPTIONS)}
              {selectField("肤色", aiSkinColor, setAiSkinColor, SKIN_COLOR_OPTIONS)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {selectField("身高", aiHeight, setAiHeight, HEIGHT_OPTIONS)}
              {selectField("体型", aiWeight, setAiWeight, WEIGHT_OPTIONS)}
            </div>

            {textareaField("性格描述（可留空）", aiPersonalityDesc, setAiPersonalityDesc, "例如：外冷内热的毒舌少女，嘴上不饶人但关键时刻靠谱...")}
            {inputField("特长（可留空）", aiSpecialties, setAiSpecialties, "例如：黑客技术、格斗、情报分析")}
            {inputField("兴趣爱好（可留空）", aiHobbies, setAiHobbies, "例如：烹饪、吉他、收集黑胶唱片")}
            {inputField("厌恶（可留空）", aiDislikes, setAiDislikes, "例如：不守信用、噪音、虫子")}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setStep('player')}
                className="flex-1 bg-zinc-800 text-zinc-300 py-3 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
              >
                上一步
              </button>
              <button
                onClick={handleAiCharacterSubmit}
                className="flex-1 bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200"
              >
                下一步：创建世界
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Art Style Picker ──
  if (step === 'artStyle') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl w-full"
        >
          <ArtStylePicker onSelect={handleArtStyleSelect} />
          <button
            onClick={() => { setSelectedWorldview(null); setStep('world'); }}
            className="text-zinc-500 hover:text-zinc-300 text-sm mt-6 block mx-auto"
          >
            返回选择世界
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Step 3: World ──
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-2xl w-full space-y-8">
        {stepIndicator(3)}
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-bold">定义世界</h2>
          <p className="text-zinc-400 text-sm">描绘你们冒险的舞台，可以是任何你想象得到的世界。</p>
        </div>

        {options.length === 0 ? (
          <div className="space-y-4">
            <textarea
              value={inputWorldview}
              onChange={(e) => setInputWorldview(e.target.value)}
              className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:ring-2 focus:ring-white/20 outline-none resize-none"
              placeholder="描述你想要的世界观，越详细越好..."
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !inputWorldview.trim()}
              className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all relative overflow-hidden"
            >
              {loading ? (
                <>
                  <FakeProgressBar
                    ref={progressBarRef}
                    duration={50000}
                    direction="ltr"
                    gradientColors={['#10b981', '#06b6d4']}
                    animation="shimmer"
                    attach="inborder"
                    xPercent={0}
                    yPercent={100}
                    thickness={4}
                  />
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
                </>
              ) : (
                "生成选项"
              )}
            </button>
            <button
              onClick={() => setStep('aiCharacter')}
              className="w-full text-zinc-500 hover:text-zinc-300 text-sm"
            >
              上一步
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
