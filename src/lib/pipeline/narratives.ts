/**
 * 叙事指令生成器
 * 根据管线结算结果生成发给 LLM 的叙事指令文本
 * 只负责文案拼装，不含任何状态变更逻辑
 */

// ─── T0 安全区叙事 ───
export function buildT0Narrative(action: string, tier: number, roll: number, hpAfter: number): string {
  if (action === 'move') {
    return '【系统强制】：玩家选择离开安全区，踏入外部世界。当前紧张度强制升至1级（探索态）。请描写出发时的场景。';
  }
  if (tier === 2) {
    return `【系统大成功】：Roll=${roll}！极佳的休整！玩家获得了心理慰藉或找到了小甜头，HP大幅恢复！请发糖或描写极其温馨/幸运的互动。`;
  }
  return '【系统强制】：安全区内纯剧情休整，维持现状，略微恢复体力。请描写平静的互动与氛围。';
}

// ─── T1 探索叙事 ───
export function buildT1ExploreNarrative(tier: number, roll: number, progress: number): string {
  if (tier === 0) {
    return `【系统指令 - 大失败】：探索遭遇意外伏击/陷阱！进度+0，紧张度强制升至2级（冲突）。Roll=${roll}，请描写突如其来的危机。`;
  }
  if (tier === 2) {
    return `【系统指令 - 奇遇】：探索发现隐藏物资！进度+40（当前${progress}%）。Roll=${roll}，请描写意外发现珍贵资源或隐藏通道的场景。`;
  }
  return `【系统指令 - 成功】：探索顺利推进，进度+15（当前${progress}%）。Roll=${roll}，请描写发现线索/安全前进的场景。`;
}

// ─── T1 战斗叙事 ───
export function buildT1CombatNarrative(tier: number, roll: number): string {
  if (tier === 0) {
    return `【系统指令 - 失败】：玩家行为失败，紧张度升至2级。Roll=${roll}，引入意外事件，进入小危机`;
  }
  return `【系统指令 - 成功】：玩家行为成功。Roll=${roll}，根据玩家的行动意图，请描写结果`;
}

// ─── T2 轻度危机叙事 ───
export function buildT2Narrative(action: string, tier: number, roll: number, hpAfter: number): string {
  if (action === 'move') {
    return '【系统强制 - 战术撤退】：玩家果断放弃探索，有序撤出！无伤脱战，紧张度降回 1 级。请描写安全撤离危机区域的过程。';
  }
  if (action === 'idle' || action === 'suicidal_idle') {
    return `【系统大失败 - 危机发呆】：在危机面前消极应对！遭到杂兵/环境袭击，HP -15，紧张度恶化至 3 级（中度危机）。请描写主角因退缩而受伤的场面。`;
  }
  if (tier === 0) {
    return `【系统战斗失败】：对抗受挫！HP -10，危机升级，紧张度升至 3 级。Roll=${roll}，请描写遭到压制受轻伤的场面。`;
  }
  if (tier === 2) {
    return `【系统秒杀】：干净利落的秒杀/完美解除危机！紧张度降回 1 级。Roll=${roll}，请描写主角展现高超技巧的帅气瞬间。`;
  }
  return `【系统战斗胜利】：成功击退杂兵/解除危机！紧张度降回 1 级（探索态）。Roll=${roll}，请描写克服障碍后的喘息。`;
}

// ─── T3 中度危机 - 移动叙事 ───
export function buildT3MoveNarrative(tier: number, roll: number, hpAfter: number, targetName: string): string {
  if (tier === 0) {
    return `【系统指令 - 突围大失败】：试图向【${targetName}】撤退，但被敌人死死包围并重创！突围失败，HP-20（当前${hpAfter}）。退路被截断，陷入极其危险的僵持！维持 3 级紧张度。Roll=${roll}。`;
  }
  if (tier === 2) {
    return `【系统指令 - 极限逃生】：奇迹般地撕开了包围圈！成功逃往【${targetName}】，彻底摆脱了追击！紧张度骤降至 1 级。Roll=${roll}，请描写极其惊险刺激的绝境求生画面。`;
  }
  return `【系统指令 - 突围受挫】：试图向【${targetName}】撤退，在包围圈的拉锯中挂彩！突围失败，HP-10（当前${hpAfter}）。双方继续僵持，未能脱困！维持 3 级紧张度。Roll=${roll}。`;
}

// ─── T3 中度危机 - 战斗叙事 ───
export function buildT3CombatNarrative(tier: number, roll: number): string {
  if (tier === 0) {
    return `【系统战斗失败】：被精英敌人碾压！HP -25，局势失控，紧张度升至 4 级（死斗）。Roll=${roll}，请描写被残忍击退或身负重伤的画面。`;
  }
  if (tier === 2) {
    return `【系统绝地反杀】：抓住破绽，华丽反杀！危机彻底解除，紧张度降回 1 级。Roll=${roll}，请描写惊险绝伦的致命反击。`;
  }
  return `【系统战斗僵持】：与精英敌人势均力敌！不扣血，维持 3 级紧张度。Roll=${roll}，请描写刀光剑影、互相提防的拉锯战。`;
}

// ─── T4 Boss 死斗叙事 ───
export function buildT4Narrative(action: string, tier: number, roll: number, hpAfter: number): string {
  if (action === 'move') {
    return `【系统指令 - 逃跑失败】：死斗封锁！无法逃离！背对敌人遭受重击，HP-30（当前${hpAfter}）。请描写逃跑被阻止并遭受重创的绝望场面。`;
  }
  if (action === 'combat') {
    if (tier === 0) {
      return `【系统指令 - 重伤】：被首领重创！HP-40（当前${hpAfter}），死斗继续。Roll=${roll}，请描写被首领压制的绝境。`;
    }
    if (tier === 2) {
      return `【系统指令 - 英雄斩杀】：致命一击！首领倒下！紧张度骤降至0级（胜利庆祝）。Roll=${roll}，请描写史诗级的最终一击与胜利的欢呼。`;
    }
    return `【系统指令 - 拉锯战】：与首领势均力敌！死斗继续。Roll=${roll}，请描写英勇交锋的激烈场面。`;
  }
  return `【系统指令 - 致命疏忽】：在死斗中发呆！被首领重击，HP-50（当前${hpAfter}）。Roll=${roll}，请描写因为分神而遭受猛击。`;
}

// ─── 赶路叙事 ───
export function buildTransitNarrative(
  tier: number, roll: number, progress: number,
  fromName: string, toName: string, tension: number, hpAfter?: number
): string {
  // T4 死斗追击
  if (tension >= 4) {
    if (tier === 0) {
      return `【系统指令 - 死斗追击】：在逃往【${toName}】的途中被死斗级敌人拦截围堵！无法前进，遭受重创，HP-25（当前${hpAfter}）。Roll=${roll}，请描写被强敌围堵、无路可逃的绝望场面。`;
    }
    if (tier === 2) {
      return `【系统指令 - 绝地逃生】：在千钧一发之际突破了追杀者的封锁！路程进度飞跃至${progress}%，紧张度骤降。Roll=${roll}，请描写奇迹般的绝境逃脱。`;
    }
    return `【系统指令 - 强行突围】：在追杀者的夹击中勉强向【${toName}】推进，路程进度${progress}%。死斗仍在继续。Roll=${roll}，请描写背水一战、边打边撤的惨烈场面。`;
  }

  // T3 精英追击
  if (tension >= 3) {
    if (tier === 0) {
      return `【系统指令 - 追击重创】：在赶往【${toName}】的路上遭到精英敌人猛攻！路程无进展，HP-15（当前${hpAfter}），紧张度进一步升级。Roll=${roll}，请描写被精英追击、身负重伤的危急场面。`;
    }
    if (tier === 2) {
      return `【系统指令 - 甩开追兵】：巧妙地甩开了追击者！路程大幅推进至${progress}%，紧张度下降。Roll=${roll}，请描写利用地形或智谋摆脱追击的精彩场面。`;
    }
    return `【系统指令 - 且战且退】：在精英追击的压力下艰难向【${toName}】推进，路程进度${progress}%。危机未解除。Roll=${roll}，请描写边抵抗边赶路的紧张场面。`;
  }

  // T2 冲突赶路
  if (tier === 0) {
    if (tension >= 2) {
      return `【系统指令 - 旅途遇袭】：在从【${fromName}】前往【${toName}】的旅途中遭遇危险袭击！路程无进展，HP-5（当前${hpAfter}），紧张度上升。Roll=${roll}，请描写旅途中突发的激烈危险遭遇。`;
    }
    return `【系统指令 - 旅途受阻】：在从【${fromName}】前往【${toName}】的路上碰到了麻烦，耽搁了一阵。路程无进展。Roll=${roll}，请描写路况糟糕、需要绕路、天气突变等小阻碍（不要描写战斗或严重危险）。`;
  }
  if (tier === 2) {
    return `【系统指令 - 旅途顺遂】：赶路大幅推进！路程进度达到${progress}%。Roll=${roll}，请描写沿途发现捷径或顺风顺水的旅途场景。同伴可以聊聊天、讨论前方的计划。`;
  }
  return `【系统指令 - 旅途推进】：赶路稳步前进，路程进度达到${progress}%。Roll=${roll}，请结合上下文世界观和角色性格或经历发表互动和思考。同伴之间可以边走边聊。`;
}

// ─── 安全区探索叙事 ───
export function buildSafeExploreNarrative(roll: number, progressGain: number, currentProgress: number): string {
  return `【系统指令】：安全区域内的平稳探索。进度+${progressGain}（当前${currentProgress}%）。Roll=${roll}，请描写安全搜刮、平稳推进的场面，不会有任何危险。`;
}

// ─── 安全区休整叙事 ───
export function buildSafeIdleNarrative(): string {
  return '【系统强制】：安全区内纯剧情休整，维持现状，略微恢复体力。请结合上下文世界观和角色性格或经历描写平静的互动与氛围。';
}

// ─── 进度熔断叙事 ───
export function buildProgressCapNarrative(): string {
  return '【系统指令】：玩家试图继续探索，但此区域物资和线索已被彻底搜刮殆尽。请结合上下文世界观和角色性格或经历告诉玩家这里已经空了，建议前往其他地方。';
}

// ─── 死亡叙事 ───
export function buildDeathReviveNarrative(livesRemaining: number): string {
  return `【系统强制】：致命伤！主角消耗复活币锁血（剩余${livesRemaining}条命）。拖着残躯狼狈逃离，苟延残喘。`;
}

export function buildGameOverNarrative(): string {
  return '【系统强制】：生命值归零，彻底陨落。请撰写主角死亡的悲壮结局。';
}

// ─── 里程碑叙事 ───
export function buildHouseMilestoneNarrative(): string {
  return '\n【系统强制 - 里程碑】：该建筑威胁已被彻底肃清，变为安全屋，主角可安心休整。';
}

export function buildNodeBossMilestoneNarrative(): string {
  return '\n【系统强制 - 里程碑】：区域探索度满！惊动了统治该区域的核心危机，进入死斗！';
}

// ─── 抵达目的地叙事 ───
export function buildArrivalNarrative(toName: string, roll: number): string {
  return `【系统指令 - 抵达目的地】：经过长途跋涉，终于抵达了【${toName}】！Roll=${roll}，路上所见所闻，最后一句表达抵达时的情绪和环境。`;
}
