import { TENSION_ROUTE } from './tensionConfig';
import type { GameState, IntentResult, NodeData, HouseData, SafetyLevel } from '../types/game';

function findNode(state: GameState, nodeId: string | null): NodeData | undefined {
  if (!nodeId || !state.worldData) return undefined;
  return state.worldData.nodes.find(n => n.id === nodeId);
}

function getVisibleHouses(
  node: NodeData,
  progressMap: Record<string, number>,
  currentObjective?: GameState['currentObjective']
): HouseData[] {
  const nodeProgress = progressMap[`node_${node.id}`] || 0;
  return node.houses.filter((h, index) => {
    const isTargetObjective = currentObjective?.targetHouseId === h.id;
    const isRevealedByProgress = nodeProgress >= (index + 1) * 30;
    return isTargetObjective || isRevealedByProgress;
  });
}

export interface TurnResolution {
  newHp: number;
  newLives: number;
  newTensionLevel: 0 | 1 | 2 | 3 | 4;
  newNodeId: string | null;
  newHouseId: string | null;
  newProgressMap: Record<string, number>;
  newInventory: string[];
  newIsGameOver: boolean;
  newTransitState: GameState['transitState'];
  narrativeInstruction: string;
  roll: number;
  isSuccess: boolean;
  houseSafetyUpdate?: { houseId: string; newSafetyLevel: SafetyLevel };
  affectionTriggered?: 'aid' | 'sabotage' | null;
  formulaBreakdown: string;
}

function clampTension(val: number): 0 | 1 | 2 | 3 | 4 {
  return Math.max(0, Math.min(4, Math.round(val))) as 0 | 1 | 2 | 3 | 4;
}

/**
 * 根据概率配置表和 D20 掷骰结果计算档位 (tier)
 */
function rollToTier(probabilities: [number, number, number], roll: number, res?: Pick<TurnResolution, 'formulaBreakdown'>): 0 | 1 | 2 {
  const p1 = probabilities[0];
  const p2 = probabilities[1];
  const thresh1 = Math.round(20 * p1);
  const thresh2 = Math.round(20 * (p1 + p2));

  let tier: 0 | 1 | 2;
  if (roll <= thresh1) tier = 0;
  else if (roll <= thresh2) tier = 1;
  else tier = 2;

  if (res) {
    const tierLabel = ['大失败', '普通', '大成功'][tier];
    res.formulaBreakdown = `D20(${roll}) [≤${thresh1}:失败 ≤${thresh2}:普通 >${thresh2}:成功] → T${tier} ${tierLabel}`;
  }
  return tier;
}

// ─── Narrative Instruction Generators ───────────────────────────

function buildT0Narrative(action: string, tier: number, roll: number, hpAfter: number): string {
  if (action === 'move') {
    return '【系统强制】：玩家选择离开安全区，踏入外部世界。当前紧张度强制升至1级（探索态）。请描写出发时的场景。';
  }
  if (tier === 2) {
    return `【系统大成功】：Roll=${roll}！极佳的休整！玩家获得了心理慰藉或找到了小甜头，HP大幅恢复！请发糖或描写极其温馨/幸运的互动。`;
  }
  return '【系统强制】：安全区内纯剧情休整，维持现状，略微恢复体力。请描写平静的互动与氛围。';
}

function buildT1ExploreNarrative(tier: number, roll: number, progress: number): string {
  if (tier === 0) {
    return `【系统指令 - 大失败】：探索遭遇意外伏击/陷阱！进度+0，紧张度强制升至2级（冲突）。Roll=${roll}，请描写突如其来的危机。`;
  }
  if (tier === 2) {
    return `【系统指令 - 奇遇】：探索发现隐藏物资！进度+40（当前${progress}%）。Roll=${roll}，请描写意外发现珍贵资源或隐藏通道的场景。`;
  }
  return `【系统指令 - 成功】：探索顺利推进，进度+15（当前${progress}%）。Roll=${roll}，请描写发现线索/安全前进的场景。`;
}

function buildT1CombatNarrative(tier: number, roll: number): string {
  if (tier === 0) {
    return `【系统指令 - 失败】：玩家行为失败，紧张度升至2级。Roll=${roll}，引入意外事件，进入小危机`;
  }
  return `【系统指令 - 成功】：玩家行为成功。Roll=${roll}，根据玩家的行动意图，请描写结果`;
}

function buildT2Narrative(action: string, tier: number, roll: number, hpAfter: number): string {
  if (action === 'move') {
    return '【系统强制 - 战术撤退】：玩家果断放弃探索，有序撤出！无伤脱战，紧张度降回 1 级。请描写安全撤离危机区域的过程。';
  }
  if (action === 'idle' || action === 'suicidal_idle') {
    return `【系统大失败 - 危机发呆】：在危机面前消极应对！遭到杂兵/环境袭击，HP -15，紧张度恶化至 3 级（中度危机）。请描写主角因退缩而受伤的场面。`;
  }
  // combat / explore
  if (tier === 0) {
    return `【系统战斗失败】：对抗受挫！HP -10，危机升级，紧张度升至 3 级。Roll=${roll}，请描写遭到压制受轻伤的场面。`;
  }
  if (tier === 2) {
    return `【系统秒杀】：干净利落的秒杀/完美解除危机！紧张度降回 1 级。Roll=${roll}，请描写主角展现高超技巧的帅气瞬间。`;
  }
  return `【系统战斗胜利】：成功击退杂兵/解除危机！紧张度降回 1 级（探索态）。Roll=${roll}，请描写克服障碍后的喘息。`;
}

function buildT3MoveNarrative(tier: number, roll: number, hpAfter: number, targetName: string): string {
  if (tier === 0) {
    return `【系统指令 - 突围大失败】：试图向【${targetName}】撤退，但被敌人死死包围并重创！突围失败，HP-20（当前${hpAfter}）。退路被截断，陷入极其危险的僵持！维持 3 级紧张度。Roll=${roll}。`;
  }
  if (tier === 2) {
    return `【系统指令 - 极限逃生】：奇迹般地撕开了包围圈！成功逃往【${targetName}】，彻底摆脱了追击！紧张度骤降至 1 级。Roll=${roll}，请描写极其惊险刺激的绝境求生画面。`;
  }
  return `【系统指令 - 突围受挫】：试图向【${targetName}】撤退，在包围圈的拉锯中挂彩！突围失败，HP-10（当前${hpAfter}）。双方继续僵持，未能脱困！维持 3 级紧张度。Roll=${roll}。`;
}

function buildT3CombatNarrative(tier: number, roll: number): string {
  if (tier === 0) {
    return `【系统战斗失败】：被精英敌人碾压！HP -25，局势失控，紧张度升至 4 级（死斗）。Roll=${roll}，请描写被残忍击退或身负重伤的画面。`;
  }
  if (tier === 2) {
    return `【系统绝地反杀】：抓住破绽，华丽反杀！危机彻底解除，紧张度降回 1 级。Roll=${roll}，请描写惊险绝伦的致命反击。`;
  }
  return `【系统战斗僵持】：与精英敌人势均力敌！不扣血，维持 3 级紧张度。Roll=${roll}，请描写刀光剑影、互相提防的拉锯战。`;
}

function buildT4Narrative(action: string, tier: number, roll: number, hpAfter: number): string {
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
  // idle / explore / suicidal_idle in T4
  return `【系统指令 - 致命疏忽】：在死斗中发呆！被首领重击，HP-50（当前${hpAfter}）。Roll=${roll}，请描写因为分神而遭受猛击。`;
}

function buildTransitNarrative(tier: number, roll: number, progress: number, fromName: string, toName: string, tension: number, hpAfter?: number): string {
  // ─── T4 死斗追击 ───
  if (tension >= 4) {
    if (tier === 0) {
      return `【系统指令 - 死斗追击】：在逃往【${toName}】的途中被死斗级敌人拦截围堵！无法前进，遭受重创，HP-25（当前${hpAfter}）。Roll=${roll}，请描写被强敌围堵、无路可逃的绝望场面。`;
    }
    if (tier === 2) {
      return `【系统指令 - 绝地逃生】：在千钧一发之际突破了追杀者的封锁！路程进度飞跃至${progress}%，紧张度骤降。Roll=${roll}，请描写奇迹般的绝境逃脱。`;
    }
    return `【系统指令 - 强行突围】：在追杀者的夹击中勉强向【${toName}】推进，路程进度${progress}%。死斗仍在继续。Roll=${roll}，请描写背水一战、边打边撤的惨烈场面。`;
  }

  // ─── T3 精英追击 ───
  if (tension >= 3) {
    if (tier === 0) {
      return `【系统指令 - 追击重创】：在赶往【${toName}】的路上遭到精英敌人猛攻！路程无进展，HP-15（当前${hpAfter}），紧张度进一步升级。Roll=${roll}，请描写被精英追击、身负重伤的危急场面。`;
    }
    if (tier === 2) {
      return `【系统指令 - 甩开追兵】：巧妙地甩开了追击者！路程大幅推进至${progress}%，紧张度下降。Roll=${roll}，请描写利用地形或智谋摆脱追击的精彩场面。`;
    }
    return `【系统指令 - 且战且退】：在精英追击的压力下艰难向【${toName}】推进，路程进度${progress}%。危机未解除。Roll=${roll}，请描写边抵抗边赶路的紧张场面。`;
  }

  // ─── T2 冲突赶路 ───
  if (tier === 0) {
    if (tension >= 2) {
      return `【系统指令 - 旅途遇袭】：在从【${fromName}】前往【${toName}】的旅途中遭遇危险袭击！路程无进展，HP-5（当前${hpAfter}），紧张度上升。Roll=${roll}，请描写旅途中突发的激烈危险遭遇。`;
    }
    return `【系统指令 - 旅途受阻】：在从【${fromName}】前往【${toName}】的路上碰到了麻烦，耽搁了一阵。路程无进展。Roll=${roll}，请描写路况糟糕、需要绕路、天气突变等小阻碍（不要描写战斗或严重危险）。`;
  }
  if (tier === 2) {
    return `【系统指令 - 旅途顺遂】：赶路大幅推进！路程进度达到${progress}%。Roll=${roll}，请描写沿途发现捷径或顺风顺水的旅途场景。同伴可以聊聊天、讨论前方的计划。`;
  }
  return `【系统指令 - 旅途推进】：赶路稳步前进，路程进度达到${progress}%。Roll=${roll}，请描写沿途的风景、路况或小插曲。同伴之间可以边走边聊。`;
}

// ─── Death Hook ─────────────────────────────────────────────────

function applyDeathHook(res: TurnResolution): TurnResolution {
  if (res.newHp <= 0) {
    if (res.newLives > 0) {
      res.newLives -= 1;
      res.newHp = 20;
      res.newTensionLevel = 1;
      res.narrativeInstruction = `【系统强制】：致命伤！主角消耗复活币锁血（剩余${res.newLives}条命）。拖着残躯狼狈逃离，苟延残喘。` + res.narrativeInstruction;
    } else {
      res.newIsGameOver = true;
      res.newHp = 0;
      res.narrativeInstruction = '【系统强制】：生命值归零，彻底陨落。请撰写主角死亡的悲壮结局。';
    }
  }
  return res;
}

// ─── Milestone Hook ─────────────────────────────────────────────

function applyMilestoneHook(res: TurnResolution, state: GameState): TurnResolution {
  if (res.newTensionLevel !== 1) return res;

  const checkKey = state.currentHouseId
    ? `house_${state.currentHouseId}`
    : `node_${state.currentNodeId}`;

  const progress = res.newProgressMap[checkKey] || 0;
  const oldProgress = state.progressMap[checkKey] || 0;

  if (progress >= 100 && oldProgress < 100) {
    if (state.currentHouseId) {
      // house 探索度 100% → 变为 safe, tension 降为 0
      res.newTensionLevel = 0;
      // 标记 house 安全级别变更（通过返回值让调用方更新 worldData）
      res.houseSafetyUpdate = { houseId: state.currentHouseId, newSafetyLevel: 'safe' };
      res.narrativeInstruction += '\n【系统强制 - 里程碑】：该建筑威胁已被彻底肃清，变为安全屋，主角可安心休整。';
    } else {
      // zone 探索度 100% → 触发 boss（但 zone 不变 safe）
      res.newTensionLevel = 4;
      res.narrativeInstruction += '\n【系统强制 - 里程碑】：区域探索度满！惊动了统治该区域的核心危机，进入死斗！';
    }
  }
  return res;
}

// ─── Affection Roll Modifier ────────────────────────────────

/**
 * 好感度概率检定：高好感度在危机中提供援助，低好感度落井下石。
 * 帮助概率 = (0.75 * affection - 60) / 100
 * 例：100好感=15%援助率；80好感=-15%；60=-15%；0好感=-60%吃瘪率
 * 返回 roll 的加减值 (+3 援助, -3 落井下石, 0 无触发)
 */
function applyAffectionModifier(affection: number, tension: number, roll: number): { adjustedRoll: number; triggered: 'aid' | 'sabotage' | null; detail: string } {
  // 只在 tension >= 2（冲突及以上）时触发
  if (tension < 2) {
    return { adjustedRoll: roll, triggered: null, detail: `好感度修正: 跳过(tension=${tension}<2)` };
  }

  const helpProb = (0.75 * affection - 60) / 100; // range: -0.60 to +0.15
  const diceRoll = Math.random();
  const probStr = `P=(0.75×${affection}-60)/100=${helpProb.toFixed(2)}`;
  const diceStr = `随机=${diceRoll.toFixed(3)}`;

  if (helpProb > 0 && diceRoll < helpProb) {
    // 好感度援助：roll +3
    const adjusted = Math.min(20, roll + 3);
    return { adjustedRoll: adjusted, triggered: 'aid', detail: `好感度修正: ${probStr}, ${diceStr}<${helpProb.toFixed(2)} → 援助! D20(${roll})+3=${adjusted}` };
  } else if (helpProb < 0 && diceRoll < Math.abs(helpProb)) {
    // 好感度落井下石：roll -3
    const adjusted = Math.max(1, roll - 3);
    return { adjustedRoll: adjusted, triggered: 'sabotage', detail: `好感度修正: ${probStr}, ${diceStr}<|${helpProb.toFixed(2)}|=${Math.abs(helpProb).toFixed(2)} → 落井下石! D20(${roll})-3=${adjusted}` };
  }

  return { adjustedRoll: roll, triggered: null, detail: `好感度修正: ${probStr}, ${diceStr} 未触发(阈值${Math.abs(helpProb).toFixed(2)}), Roll不变=${roll}` };
}

// ─── Main Resolver ──────────────────────────────────────────────

export class D20Resolver {
  static resolve(state: GameState, intent: IntentResult, roll: number): TurnResolution {
    const tension = state.pacingState.tensionLevel;

    // ── 好感度检定：在 D20 掷骰基础上加减修正值 ──
    const { adjustedRoll, triggered: affectionTriggered, detail: affectionDetail } = applyAffectionModifier(state.affection, tension, roll);
    const effectiveRoll = adjustedRoll;

    const res = D20Resolver._resolveInner(state, intent, effectiveRoll, affectionTriggered);
    // 在公式前追加好感度修正详情
    res.formulaBreakdown = `原始D20=${roll} | ${affectionDetail} | 有效Roll=${effectiveRoll}\n${res.formulaBreakdown}`;
    return res;
  }

  private static _resolveInner(state: GameState, intent: IntentResult, roll: number, affectionTriggered: 'aid' | 'sabotage' | null): TurnResolution {
    const tension = state.pacingState.tensionLevel;
    const action = intent.intent;
    const currentNode = findNode(state, state.currentNodeId);
    const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);

    const res: TurnResolution = {
      newHp: state.hp,
      newLives: state.lives,
      newTensionLevel: state.pacingState.tensionLevel,
      newNodeId: state.currentNodeId,
      newHouseId: state.currentHouseId,
      newProgressMap: { ...state.progressMap },
      newInventory: [...state.inventory],
      newIsGameOver: false,
      newTransitState: state.transitState,
      narrativeInstruction: '',
      roll: roll,
      isSuccess: false,
      affectionTriggered,
      formulaBreakdown: '系统强制(无掷骰)',
    };

    // ─── Transit State: 赶路中的特殊处理 ─────
    if (state.transitState) {
      return D20Resolver.resolveTransit(state, intent, roll, res);
    }

    // ─── Safe Zone Override ─────
    // 如果当前位于安全级别=safe 的节点或建筑，强制 tension=0，不触发意外和探索
    const inSafeHouse = currentHouse && currentHouse.safetyLevel === 'safe';
    const inSafeNode = currentNode && currentNode.safetyLevel === 'safe';
    const isInSafeZone = inSafeHouse || inSafeNode;

    // Zone 探索度 100% 时，野外不再有危机（但不变成 safe）
    const nodeProgressKey = state.currentNodeId ? `node_${state.currentNodeId}` : '';
    const nodeProgress = nodeProgressKey ? (state.progressMap[nodeProgressKey] || 0) : 0;
    const isNodeFullyExplored = nodeProgress >= 100 && !state.currentHouseId;

    if (isInSafeZone) {
      // 在安全区域：允许 idle、move 和 explore
      if (action === 'move') {
        // 允许移动，落入下方 tension-specific 逻辑
      } else if (action === 'explore') {
        // BUG1b: 允许在 Tension 0 安全区下执行 explore，使用纯探索无伤配置表 [0, 0.7, 0.3]
        const safeExploreProbs: [number, number, number] = [0, 0.7, 0.3];
        const tier = rollToTier(safeExploreProbs, roll, res);
        const progressKey = state.currentHouseId
          ? `house_${state.currentHouseId}`
          : `node_${state.currentNodeId}`;
        // BUG3: 进度熔断锁 - 安全区内也生效
        if ((state.progressMap[progressKey] || 0) >= 100) {
          res.isSuccess = true;
          res.newTensionLevel = 0;
          res.narrativeInstruction = '【系统指令】：玩家试图继续探索，但此区域物资和线索已被彻底搜刮殆尽。请告诉玩家这里已经空了，建议前往其他地方。';
          return applyDeathHook(res);
        }
        const progressGain = tier === 2 ? 40 : 15;
        res.newProgressMap[progressKey] = Math.min(100, (res.newProgressMap[progressKey] || 0) + progressGain);
        res.newTensionLevel = 0;
        res.newHp = Math.min(100, state.hp + 5);
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令】：安全区域内的平稳探索。进度+${progressGain}（当前${res.newProgressMap[progressKey]}%）。Roll=${roll}，请描写安全搜刮、平稳推进的场面，不会有任何危险。`;
        return applyMilestoneHook(applyDeathHook(res), state);
      } else {
        // 强制 tension 0，纯聊天/休整
        res.newTensionLevel = 0;
        res.newHp = Math.min(100, state.hp + 5);
        res.isSuccess = true;
        res.narrativeInstruction = '【系统强制】：安全区内纯剧情休整，维持现状，略微恢复体力。请描写平静的互动与氛围。';
        return applyDeathHook(res);
      }
    }

    // 获取配置（优先匹配动作，否则兜底 default）
    const routeTable = TENSION_ROUTE[tension];
    if (!routeTable) return res;

    // ─── Tension 0 ─────
    if (tension === 0) {
      if (action === 'move') {
        const targetId = intent.targetId;
        if (targetId && currentNode?.connections.includes(targetId)) {
          // 进入 transit state 而不是瞬移
          res.newTransitState = {
            fromNodeId: state.currentNodeId!,
            toNodeId: targetId,
            pathProgress: 0,
            lockedTheme: null,
          };
          res.newHouseId = null;
          res.newTensionLevel = 1;
          res.isSuccess = true;
          res.narrativeInstruction = '【系统强制】：玩家选择离开安全区，踏入外部世界。当前紧张度强制升至1级（探索态）。请描写出发踏上旅途的场景。';
        } else {
          res.narrativeInstruction = '【系统强制】：玩家尝试移动但目标位置不可达。请描写路被阻断。';
          res.isSuccess = false;
        }
      } else {
        const route = routeTable['default'];
        const tier = rollToTier(route.probabilities, roll, res);
        res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
        res.isSuccess = true;
        res.narrativeInstruction = buildT0Narrative(action, tier, roll, res.newHp);
      }
      return applyDeathHook(res);
    }

    // ─── Tension 1 ─────
    // BUG3: 探索进度熔断锁 - 在所有 tension 级别下拦截已探索完毕区域
    if (action === 'explore') {
      const cbProgressKey = state.currentHouseId
        ? `house_${state.currentHouseId}`
        : `node_${state.currentNodeId}`;
      if ((state.progressMap[cbProgressKey] || 0) >= 100) {
        res.isSuccess = true;
        res.narrativeInstruction = '【系统指令】：玩家试图继续探索，但此区域物资和线索已被彻底搜刮殆尽。请告诉玩家这里已经空了，建议前往其他地方。';
        return res;
      }
    }

    if (tension === 1) {
      if (action === 'explore') {
        const route = routeTable['explore'];
        const tier = rollToTier(route.probabilities, roll, res);
        const progressKey = state.currentHouseId
          ? `house_${state.currentHouseId}`
          : `node_${state.currentNodeId}`;
        const progressGain = route.progressDelta[tier];
        res.newProgressMap[progressKey] = Math.min(100, (res.newProgressMap[progressKey] || 0) + progressGain);

        // Zone 探索度 100% 且在野外时，不再触发危机（大失败改为普通）
        const adjustedTier = (isNodeFullyExplored && tier === 0) ? 1 : tier;
        res.newTensionLevel = clampTension(tension + route.tensionDelta[adjustedTier]);
        res.isSuccess = adjustedTier > 0;
        res.narrativeInstruction = buildT1ExploreNarrative(adjustedTier, roll, res.newProgressMap[progressKey]);
      } else if (action === 'move') {
        const targetId = intent.targetId;
        if (targetId && currentNode?.connections.includes(targetId)) {
          // 跨节点移动 → 进入 transit
          res.newTransitState = {
            fromNodeId: state.currentNodeId!,
            toNodeId: targetId,
            pathProgress: 0,
            lockedTheme: null,
          };
          res.newHouseId = null;
          res.isSuccess = true;
          res.narrativeInstruction = '【系统指令】：玩家踏上旅途，正在赶往新区域。请描写动身离开与旅途初段的见闻。';
        } else if (targetId && currentNode) {
          const visibleHouses = getVisibleHouses(currentNode, state.progressMap, state.currentObjective);
          const targetHouse = visibleHouses.find(h => h.id === targetId);
          if (targetHouse) {
            // 如果当前在另一个 house 里，需要先出门到野外
            if (state.currentHouseId && state.currentHouseId !== targetId) {
              res.newHouseId = null;
              res.isSuccess = true;
              // 标记新紧张度：离开安全建筑进入野外，可能提升紧张
              if (isNodeFullyExplored) {
                res.newTensionLevel = Math.min(1, tension) as 0 | 1 | 2 | 3 | 4;
              }
              res.narrativeInstruction = `【系统指令】：玩家走出当前建筑来到街区野外，正准备前往${targetHouse.name}。请描写走出建筑的场景，暗示接下来要穿过街区。`;
            } else {
              res.newHouseId = targetId;
              res.isSuccess = true;
              res.narrativeInstruction = `【系统指令】：玩家进入${targetHouse.name}。请描写进入该建筑的场景。`;
            }
          } else {
            res.isSuccess = false;
            res.narrativeInstruction = '【系统指令】：目标位置未揭盲或不可达。请描写找不到出路的场景。';
          }
        } else {
          if (state.currentHouseId) {
            res.newHouseId = null;
            res.isSuccess = true;
            res.narrativeInstruction = '【系统指令】：玩家退出当前建筑，回到街区野外。请描写走出建筑的场景。';
          } else {
            res.isSuccess = false;
            res.narrativeInstruction = '【系统指令】：玩家想移动但未指定明确方向。请询问玩家要去哪里。';
          }
        }
      } else {
        // combat / other in T1
        const route = routeTable['combat'] || routeTable['default'];
        const tier = rollToTier(route.probabilities, roll, res);
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = tier > 0;
        res.narrativeInstruction = buildT1CombatNarrative(tier, roll);
      }
      return applyMilestoneHook(applyDeathHook(res), state);
    }

    // ─── Tension 2 ─────
    if (tension === 2) {
      if (action === 'move') {
        // T2 撤退逃亡检定：过 D20 后执行实际位置变更
        const route = routeTable['move'];
        const tier = rollToTier(route.probabilities, roll, res);
        res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = true;

        const targetId = intent.targetId;
        if (targetId && currentNode?.connections.includes(targetId)) {
          // 跨节点撤退 → 创建 transit
          const targetNode = findNode(state, targetId);
          const targetName = targetNode?.name || targetId;
          res.newTransitState = {
            fromNodeId: state.currentNodeId!,
            toNodeId: targetId,
            pathProgress: 5, // 战术撤退已走一半
            lockedTheme: null,
          };
          res.newHouseId = null;
          res.narrativeInstruction = `【系统强制 - 战术撤退】：玩家朝【${targetName}】方向有序撤出！紧张度降回 1 级。Roll=${roll}，请描写安全撤离危机区域并踏上旅途的过程。`;
        } else if (targetId && currentNode) {
          const visibleHouses = getVisibleHouses(currentNode, state.progressMap, state.currentObjective);
          const targetHouse = visibleHouses.find(h => h.id === targetId);
          if (targetHouse) {
            if (state.currentHouseId && state.currentHouseId !== targetId) {
              res.newHouseId = null;
              res.narrativeInstruction = `【系统强制 - 战术撤退】：玩家冲出当前建筑来到街区！紧张度降回 1 级。Roll=${roll}，请描写逃出建筑的过程。`;
            } else {
              res.newHouseId = targetId;
              res.narrativeInstruction = `【系统强制 - 战术撤退】：玩家冲入【${targetHouse.name}】躲避！紧张度降回 1 级。Roll=${roll}，请描写逃入建筑的过程。`;
            }
          } else {
            res.narrativeInstruction = buildT2Narrative(action, tier, roll, res.newHp);
          }
        } else if (!targetId && state.currentHouseId) {
          res.newHouseId = null;
          res.narrativeInstruction = `【系统强制 - 战术撤退】：玩家冲出建筑逃到街区！紧张度降回 1 级。Roll=${roll}，请描写逃出建筑的过程。`;
        } else {
          res.narrativeInstruction = buildT2Narrative(action, tier, roll, res.newHp);
        }
        return applyDeathHook(res);
      }

      const routeKey = (action === 'idle' || action === 'suicidal_idle') ? action : 'combat';
      const route = routeTable[routeKey] || routeTable['default'];
      const tier = rollToTier(route.probabilities, roll, res);

      res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
      res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
      res.isSuccess = tier > 0;
      res.narrativeInstruction = buildT2Narrative(action, tier, roll, res.newHp);
      return applyDeathHook(res);
    }

    // ─── Tension 3 ─────
    if (tension === 3) {
      if (action === 'move') {
        const targetId = intent.targetId;
        let canMove = false;
        let nextNodeId = state.currentNodeId;
        let nextHouseId = state.currentHouseId;
        let targetName = '安全地带';

        if (targetId && currentNode?.connections.includes(targetId)) {
          canMove = true;
          nextNodeId = targetId;
          nextHouseId = null;
          targetName = '相邻区域';
        } else if (targetId && currentNode) {
          const visibleHouses = getVisibleHouses(currentNode, state.progressMap, state.currentObjective);
          const targetHouse = visibleHouses.find(h => h.id === targetId);
          if (targetHouse) {
            canMove = true;
            nextNodeId = state.currentNodeId;
            nextHouseId = targetId;
            targetName = targetHouse.name;
          }
        } else if (!targetId && state.currentHouseId) {
          canMove = true;
          nextNodeId = state.currentNodeId;
          nextHouseId = null;
          targetName = '街区野外';
        }

        if (!canMove) {
          res.newHp -= 20;
          res.isSuccess = false;
          res.narrativeInstruction = `【系统指令 - 慌不择路】：试图逃跑，却在恐慌中冲向了死胡同或无法到达的区域！遭到敌人背后猛击，HP-20（当前${res.newHp}）。被逼回原地，维持 3 级紧张度。`;
        } else {
          const route = routeTable['move'];
          const tier = rollToTier(route.probabilities, roll, res);
          res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
          res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
          res.isSuccess = tier === 2;

          if (tier === 2) {
            // 大成功：转变为 transit 而非瞬移
            res.newTransitState = {
              fromNodeId: state.currentNodeId!,
              toNodeId: nextNodeId!,
              pathProgress: 50, // 极限逃生已走一半
              lockedTheme: null,
            };
            res.newHouseId = nextHouseId;
          }

          res.narrativeInstruction = buildT3MoveNarrative(tier, roll, res.newHp, targetName);
        }
      } else if (action === 'idle' || action === 'suicidal_idle') {
        const route = routeTable['idle'];
        const tier = rollToTier(route.probabilities, roll, res);
        res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = false;
        res.narrativeInstruction = `【系统大失败 - 找死】：面对精英威胁居然发呆！惨遭重击，HP -25，被逼入绝境，紧张度升至 4 级（死斗）。请描写极度惨烈的受击场面。`;
      } else {
        // combat / explore
        const route = routeTable['combat'];
        const tier = rollToTier(route.probabilities, roll, res);
        res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = tier >= 1;
        res.narrativeInstruction = buildT3CombatNarrative(tier, roll);
      }
      return applyDeathHook(res);
    }

    // ─── Tension 4 ─────
    if (tension === 4) {
      const routeKey = action === 'combat' ? 'combat' : (action === 'move' ? 'move' : 'idle');
      const route = routeTable[routeKey] || routeTable['default'];
      const tier = rollToTier(route.probabilities, roll, res);

      res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
      res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
      res.isSuccess = tier === 2 && action === 'combat';
      res.narrativeInstruction = buildT4Narrative(action, tier, roll, res.newHp);
      return applyDeathHook(res);
    }

    return res;
  }

  /**
   * 处理旅途中（transitState）的 D20 结算
   */
  static resolveTransit(state: GameState, intent: IntentResult, roll: number, res: TurnResolution): TurnResolution {
    const transit = state.transitState!;
    const tension = state.pacingState.tensionLevel;
    const fromNode = findNode(state, transit.fromNodeId);
    const toNode = findNode(state, transit.toNodeId);
    const fromName = fromNode?.name || transit.fromNodeId;
    const toName = toNode?.name || transit.toNodeId;

    // 旅途概率/扣血/紧张度按 tension 分级
    let transitProbs: [number, number, number];
    let failHpDelta: number;
    let tensionOnFail: number;
    let tensionOnCrit: number;

    if (tension >= 4) {
      // T4 死斗追击：几乎跑不掉
      transitProbs = [0.50, 0.40, 0.10];
      failHpDelta = -25;
      tensionOnFail = 0;   // 已经 4 级，不再升
      tensionOnCrit = -2;
    } else if (tension >= 3) {
      // T3 精英追击：很难推进
      transitProbs = [0.30, 0.60, 0.10];
      failHpDelta = -15;
      tensionOnFail = 1;
      tensionOnCrit = -1;
    } else if (tension >= 2) {
      // T2 冲突赶路：中等危险
      transitProbs = [0.15, 0.65, 0.20];
      failHpDelta = -5;
      tensionOnFail = 1;
      tensionOnCrit = -1;
    } else {
      // T0-1 和平赶路：仅 8% 受阻
      transitProbs = [0.08, 0.72, 0.20];
      failHpDelta = 0;
      tensionOnFail = 0;
      tensionOnCrit = 0;
    }

    const tier = rollToTier(transitProbs, roll, res);

    // HP 变化
    if (tier === 0 && failHpDelta < 0) {
      res.newHp = Math.max(0, state.hp + failHpDelta);
    }

    // 紧张度变化
    if (tension >= 2) {
      const tensionDelta = tier === 0 ? tensionOnFail : (tier === 2 ? tensionOnCrit : 0);
      res.newTensionLevel = clampTension(tension + tensionDelta);
    } else {
      // 和平赶路：紧张度锁定在 0-1，不会升到 2
      res.newTensionLevel = tension as 0 | 1 | 2 | 3 | 4;
    }

    // 路程推进
    const progressGain = tier === 0 ? 0 : (tier === 1 ? 25 : 50);
    const newPathProgress = Math.min(100, transit.pathProgress + progressGain);

    res.isSuccess = tier > 0;

    if (newPathProgress >= 100) {
      // 抵达终点
      res.newTransitState = null;
      res.newNodeId = transit.toNodeId;
      res.newHouseId = null;
      // BUG1a: 抵达后立即检查目的地安全级别，即时结算紧张度
      if (toNode?.safetyLevel === 'safe') {
        res.newTensionLevel = 0;
      } else {
        res.newTensionLevel = 1;
      }
      res.narrativeInstruction = `【系统指令 - 抵达目的地】：经过长途跋涉，终于抵达了【${toName}】！Roll=${roll}，请描写到达新地点时的所见所闻，展现该区域的独特风貌。`;
    } else {
      // 仍在路上
      res.newTransitState = {
        fromNodeId: transit.fromNodeId,
        toNodeId: transit.toNodeId,
        pathProgress: newPathProgress,
        lockedTheme: transit.lockedTheme || null,
      };
      res.narrativeInstruction = buildTransitNarrative(tier, roll, newPathProgress, fromName, toName, tension, res.newHp);
    }

    return applyDeathHook(res);
  }
}
