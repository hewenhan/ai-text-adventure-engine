import { motion } from 'motion/react';
import { PlayerProfile } from '../types/game';

interface ProfileModalProps {
  tempName: string;
  setTempName: (name: string) => void;
  tempGender: PlayerProfile['gender'];
  setTempGender: (gender: PlayerProfile['gender']) => void;
  tempOrientation: PlayerProfile['orientation'];
  setTempOrientation: (orientation: PlayerProfile['orientation']) => void;
  onSubmit: () => void;
}

export function ProfileModal({
  tempName,
  setTempName,
  tempGender,
  setTempGender,
  tempOrientation,
  setTempOrientation,
  onSubmit
}: ProfileModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl"
      >
        <h2 className="text-xl font-bold mb-2">完善你的资料</h2>
        <p className="text-zinc-400 text-sm mb-6">
          为了继续冒险，请告诉我们更多关于你的信息。这有助于 AI 更好地与你互动。
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">姓名</label>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
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
                  onClick={() => setTempGender(g.value as any)}
                  className={`p-2 rounded-lg text-sm border transition-colors ${
                    tempGender === g.value 
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
              value={tempOrientation}
              onChange={(e) => setTempOrientation(e.target.value as any)}
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
            onClick={onSubmit}
            disabled={!tempName.trim()}
            className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 disabled:opacity-50 mt-4"
          >
            保存资料并继续
          </button>
        </div>
      </motion.div>
    </div>
  );
}
