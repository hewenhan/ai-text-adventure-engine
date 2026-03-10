import { TENSION_ROUTE } from './tensionConfig';
import type { GameState, IntentResult, NodeData, HouseData } from '../types/game';

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
}

function clampTension(val: number): 0 | 1 | 2 | 3 | 4 {
  return Math.max(0, Math.min(4, Math.round(val))) as 0 | 1 | 2 | 3 | 4;
}

/**
 * 根据概率配置表和 D20 掷骰结果计算档位 (tier)
 */
function rollToTier(probabilities: [number, number, number], roll: number): 0 | 1 | 2 {
  const p1 = probabilities[0];
  const p2 = probabilities[1];
  const thresh1 = Math.round(20 * p1);
  const thresh2 = Math.round(20 * (p1 + p2));

  if (roll <= thresh1) return 0; // 大失败
  if (roll <= thresh2) return 1; // 普通
  return 2; // 大成功
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

function buildTransitNarrative(tier: number, roll: number, progress: number, fromName: string, toName: string): string {
  if (tier === 0) {
    return `【系统指令 - 旅途遇袭】：在从【${fromName}】前往【${toName}】的旅途中遭遇袭击！路程无进展，紧张度上升。Roll=${roll}，请描写旅途中突发的危险遭遇。`;
  }
  if (tier === 2) {
    return `【系统指令 - 旅途顺遂】：赶路大幅推进！路程进度达到${progress}%。Roll=${roll}，请描写沿途发现捷径或顺风顺水的旅途场景。`;
  }
  return `【系统指令 - 旅途推进】：赶路稳步前进，路程进度达到${progress}%。Roll=${roll}，请描写沿途的风景、路况或小插曲。`;
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
      res.newTensionLevel = 0;
      res.narrativeInstruction += '\n【系统强制 - 里程碑】：该建筑威胁已被彻底肃清，变为安全屋，主角可安心休整。';
    } else {
      res.newTensionLevel = 4;
      res.narrativeInstruction += '\n【系统强制 - 里程碑】：区域探索度满！惊动了统治该区域的核心危机，进入死斗！';
    }
  }
  return res;
}

// ─── Main Resolver ──────────────────────────────────────────────

export class D20Resolver {
  static resolve(state: GameState, intent: IntentResult, roll: number): TurnResolution {
    const tension = state.pacingState.tensionLevel;
    const action = intent.intent;
    const currentNode = findNode(state, state.currentNodeId);

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
      roll,
      isSuccess: false,
    };

    // ─── Transit State: 赶路中的特殊处理 ─────
    if (state.transitState) {
      return D20Resolver.resolveTransit(state, intent, roll, res);
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
        const tier = rollToTier(route.probabilities, roll);
        res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
        res.isSuccess = true;
        res.narrativeInstruction = buildT0Narrative(action, tier, roll, res.newHp);
      }
      return applyDeathHook(res);
    }

    // ─── Tension 1 ─────
    if (tension === 1) {
      if (action === 'explore') {
        const route = routeTable['explore'];
        const tier = rollToTier(route.probabilities, roll);
        const progressKey = state.currentHouseId
          ? `house_${state.currentHouseId}`
          : `node_${state.currentNodeId}`;
        const progressGain = route.progressDelta[tier];
        res.newProgressMap[progressKey] = Math.min(100, (res.newProgressMap[progressKey] || 0) + progressGain);
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = tier > 0;
        res.narrativeInstruction = buildT1ExploreNarrative(tier, roll, res.newProgressMap[progressKey]);
      } else if (action === 'move') {
        const targetId = intent.targetId;
        if (targetId && currentNode?.connections.includes(targetId)) {
          // 跨节点移动 → 进入 transit
          res.newTransitState = {
            fromNodeId: state.currentNodeId!,
            toNodeId: targetId,
            pathProgress: 0,
          };
          res.newHouseId = null;
          res.isSuccess = true;
          res.narrativeInstruction = '【系统指令】：玩家踏上旅途，正在赶往新区域。请描写动身离开与旅途初段的见闻。';
        } else if (targetId && currentNode) {
          const visibleHouses = getVisibleHouses(currentNode, state.progressMap, state.currentObjective);
          const targetHouse = visibleHouses.find(h => h.id === targetId);
          if (targetHouse) {
            res.newHouseId = targetId;
            res.isSuccess = true;
            res.narrativeInstruction = `【系统指令】：玩家进入${targetHouse.name}。请描写进入该建筑的场景。`;
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
        const tier = rollToTier(route.probabilities, roll);
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = tier > 0;
        res.narrativeInstruction = buildT1CombatNarrative(tier, roll);
      }
      return applyMilestoneHook(applyDeathHook(res), state);
    }

    // ─── Tension 2 ─────
    if (tension === 2) {
      const routeKey = (action === 'idle' || action === 'suicidal_idle') ? action : (action === 'move' ? 'move' : 'combat');
      const route = routeTable[routeKey] || routeTable['default'];
      const tier = rollToTier(route.probabilities, roll);

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
          const tier = rollToTier(route.probabilities, roll);
          res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
          res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
          res.isSuccess = tier === 2;

          if (tier === 2) {
            // 大成功：转变为 transit 而非瞬移
            res.newTransitState = {
              fromNodeId: state.currentNodeId!,
              toNodeId: nextNodeId!,
              pathProgress: 50, // 极限逃生已走一半
            };
            res.newHouseId = nextHouseId;
          }

          res.narrativeInstruction = buildT3MoveNarrative(tier, roll, res.newHp, targetName);
        }
      } else if (action === 'idle' || action === 'suicidal_idle') {
        const route = routeTable['idle'];
        const tier = rollToTier(route.probabilities, roll);
        res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
        res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);
        res.isSuccess = false;
        res.narrativeInstruction = `【系统大失败 - 找死】：面对精英威胁居然发呆！惨遭重击，HP -25，被逼入绝境，紧张度升至 4 级（死斗）。请描写极度惨烈的受击场面。`;
      } else {
        // combat / explore
        const route = routeTable['combat'];
        const tier = rollToTier(route.probabilities, roll);
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
      const tier = rollToTier(route.probabilities, roll);

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

    // 旅途中使用 T1 explore 的配置来结算
    const route = TENSION_ROUTE[Math.min(tension, 1)]['explore'] || TENSION_ROUTE[1]['explore'];
    const tier = rollToTier(route.probabilities, roll);

    res.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[tier]));
    res.newTensionLevel = clampTension(tension + route.tensionDelta[tier]);

    // 路程推进
    const progressGain = tier === 0 ? 0 : (tier === 1 ? 25 : 50);
    const newPathProgress = Math.min(100, transit.pathProgress + progressGain);

    res.isSuccess = tier > 0;

    if (newPathProgress >= 100) {
      // 抵达终点
      res.newTransitState = null;
      res.newNodeId = transit.toNodeId;
      res.newHouseId = null;
      res.narrativeInstruction = `【系统指令 - 抵达目的地】：经过长途跋涉，终于抵达了【${toName}】！Roll=${roll}，请描写到达新地点时的所见所闻，展现该区域的独特风貌。`;
    } else {
      // 仍在路上
      res.newTransitState = {
        fromNodeId: transit.fromNodeId,
        toNodeId: transit.toNodeId,
        pathProgress: newPathProgress,
      };
      res.narrativeInstruction = buildTransitNarrative(tier, roll, newPathProgress, fromName, toName);
    }

    return applyDeathHook(res);
  }
}
