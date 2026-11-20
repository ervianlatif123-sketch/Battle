/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BossCategory,
  CombatStats,
  GameMode,
  GameState,
  HeroKey,
  PlayerStats,
  SkillDefinition
} from './types/game';
import { HERO_DATABASE } from './game/constants';
import { GameEngine } from './game/GameEngine';
import { sounds } from './audio/soundManager';
import { TitleScreen } from './components/TitleScreen';
import { CharacterSelectModal } from './components/CharacterSelectModal';
import { SkillSelectModal } from './components/SkillSelectModal';
import { GameHud } from './components/GameHud';
import { PracticeLabPanel } from './components/PracticeLabPanel';
import { LevelUpModal } from './components/LevelUpModal';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { VictoryModal } from './components/VictoryModal';

interface BossHudState {
  name: string;
  hp: number;
  maxHp: number;
  category?: BossCategory;
  shield?: number;
  physResist?: number;
  magicResist?: number;
  mirroredRelicsCount?: number;
}

const createFallbackPlayerStats = (heroKey: HeroKey): PlayerStats => {
  const cfg = HERO_DATABASE[heroKey];
  return {
    hp: cfg.hp,
    maxHp: cfg.hp,
    atk: cfg.atk,
    atkSpeed: cfg.atkSpeed,
    critChance: cfg.critChance,
    critDmg: cfg.critDmg,
    speed: cfg.speed,
    range: cfg.range,
    defense: cfg.defense,
    cdr: 0,
    evasion: 0,
    lifesteal: 0,
    level: 1,
    exp: 0,
    maxExp: 100,
    demonisStacks: 0,
    demonisFCD: 0,
    travelerStance: 'sword',
    travelerTimeStacks: 0,
    travelerRewindReady: true,
    travelerKillsRecharge: 30,
    isTimeStopActive: false,
    timeStopTimer: 0,
    rageTimer: 0,
    swiftTimer: 0,
    monkeyWeaponActive: false,
    varpScytheStacks: 0,
    burstCritActive: false,
    fallenWingsActive: false,
    magicDestroActive: false,
    warArmorActive: false,
    warArmorBonusDef: 0,
    judgeDomainTimer: 0,
    travelerFieldTimer: 0,
    soulMagnetRange: 140,
    judgeResonance: 0,
    judgeMeleeFormTimer: 0,
    judgeCutsceneTimer: 0,
    judgeBladeSpinTimer: 0,
    trueFallenAngelTimer: 0,
    angelCutsceneTimer: 0,
    anomalyCloneActive: false,
    skillCDs: cfg.skills.map(() => 0),
    skillMaxCDs: cfg.skills.map((s) => s.cd)
  };
};

const INITIAL_COMBAT_STATS: CombatStats = {
  kills: 0,
  wave: 1,
  waveDr: 0,
  enemiesRemaining: 0,
  timeSurvived: 0,
  damageDealt: 0,
  highestCrit: 0,
  damageTaken: 0,
  level: 1,
  dps: 0,
  dpsHistory: []
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [gameMode, setGameMode] = useState<GameMode>('arena');
  const [selectedHero, setSelectedHero] = useState<HeroKey>('monkey');
  const [activeSkills, setActiveSkills] = useState<SkillDefinition[]>(() => [...HERO_DATABASE.monkey.skills]);

  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => createFallbackPlayerStats('monkey'));
  const [combatStats, setCombatStats] = useState<CombatStats>(INITIAL_COMBAT_STATS);
  const [bossState, setBossState] = useState<BossHudState | null>(null);
  const [finalStats, setFinalStats] = useState<CombatStats>(INITIAL_COMBAT_STATS);
  const [levelUpLevel, setLevelUpLevel] = useState<number>(2);

  const [autoPilot, setAutoPilot] = useState<boolean>(true);
  const [autoCastSkills, setAutoCastSkills] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(() => sounds.getMuted());

  // Practice Lab reactive snapshots
  const [practiceAttributeCounts, setPracticeAttributeCounts] = useState<Map<string, number>>(() => new Map());
  const [practiceUnlockedTraits, setPracticeUnlockedTraits] = useState<Set<string>>(() => new Set());
  const [practiceWave, setPracticeWave] = useState<number>(1);
  const [practiceGodMode, setPracticeGodMode] = useState<boolean>(true);
  const [practiceAutoHealDummy, setPracticeAutoHealDummy] = useState<boolean>(true);
  const [isSimPaused, setIsSimPaused] = useState<boolean>(false);

  const syncEngineSnapshots = useCallback((engine: GameEngine) => {
    setSelectedHero(engine.heroKey);
    setActiveSkills([...engine.activeSkills]);
    setPlayerStats({ ...engine.player, skillCDs: [...engine.player.skillCDs], skillMaxCDs: [...engine.player.skillMaxCDs] });
    setPracticeAttributeCounts(new Map(engine.attributeCounts));
    setPracticeUnlockedTraits(new Set(engine.unlockedTraits));
    setPracticeWave(engine.practiceWaveLevel);
    setPracticeGodMode(engine.practiceGodMode);
    setPracticeAutoHealDummy(engine.practiceAutoHealDummy);
    setIsSimPaused(engine.isPaused);
  }, []);

  const destroyEngine = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = sounds.toggleMute();
    setIsMuted(nextMuted);
  }, []);

  const startBattle = useCallback(
    (heroKey: HeroKey, skills: SkillDefinition[], mode: GameMode) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      destroyEngine();

      const engine = new GameEngine(canvas, heroKey);
      engine.setPracticeMode(mode === 'practice');
      engine.setHero(heroKey, skills);
      engine.autoPilot = autoPilot;
      engine.autoCastSkills = autoCastSkills;

      engine.onStatsUpdate = (stats, player, boss) => {
        setCombatStats(stats);
        setPlayerStats({
          ...player,
          skillCDs: [...player.skillCDs],
          skillMaxCDs: [...player.skillMaxCDs]
        });
        setBossState(boss);
      };

      engine.onSkillsChange = (nextSkills) => {
        setActiveSkills([...nextSkills]);
      };

      engine.onLevelUpTrigger = (level) => {
        setLevelUpLevel(level);
        setGameState('LEVEL_UP');
      };

      engine.onGameOverTrigger = (stats) => {
        setFinalStats(stats);
        setGameState('GAME_OVER');
      };

      engine.onVictoryTrigger = (stats) => {
        setFinalStats(stats);
        setGameState('VICTORY');
      };

      engineRef.current = engine;
      engine.handleResize();
      engine.start();
      syncEngineSnapshots(engine);
      setCombatStats(INITIAL_COMBAT_STATS);
      setBossState(null);
      setGameState('PLAYING');
    },
    [autoCastSkills, autoPilot, destroyEngine, syncEngineSnapshots]
  );

  // Keep canvas sized properly to viewport
  useEffect(() => {
    const handleResize = () => {
      engineRef.current?.handleResize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global keyboard shortcuts (Escape pause, M mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      } else if (e.key === 'Escape') {
        if (gameState === 'PLAYING' && engineRef.current) {
          engineRef.current.isPaused = true;
          setIsSimPaused(true);
          setGameState('PAUSED');
        } else if (gameState === 'PAUSED' && engineRef.current) {
          engineRef.current.isPaused = false;
          setIsSimPaused(false);
          setGameState('PLAYING');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, handleToggleMute]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      destroyEngine();
    };
  }, [destroyEngine]);

  const activeHeroConfig = HERO_DATABASE[selectedHero];
  const isInArenaView =
    gameState === 'PLAYING' ||
    gameState === 'LEVEL_UP' ||
    gameState === 'PAUSED' ||
    gameState === 'GAME_OVER' ||
    gameState === 'VICTORY';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Main Arena Canvas */}
      <canvas
        ref={canvasRef}
        className={`block w-full h-full touch-none ${isInArenaView ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Title Screen */}
      {gameState === 'TITLE' && (
        <TitleScreen
          onStart={() => {
            setGameMode('arena');
            setGameState('CHARACTER_SELECT');
          }}
          onStartPractice={() => {
            setGameMode('practice');
            setGameState('CHARACTER_SELECT');
          }}
          onSelectHeroDirect={(hero) => {
            setSelectedHero(hero);
            setActiveSkills([...HERO_DATABASE[hero].skills]);
            setGameState('SKILL_SELECT');
          }}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Character Select */}
      {gameState === 'CHARACTER_SELECT' && (
        <CharacterSelectModal
          gameMode={gameMode}
          onChangeGameMode={setGameMode}
          onConfirmCharacter={(hero) => {
            setSelectedHero(hero);
            setActiveSkills([...HERO_DATABASE[hero].skills]);
            setGameState('SKILL_SELECT');
          }}
          onBack={() => setGameState('TITLE')}
        />
      )}

      {/* Skill Select */}
      {gameState === 'SKILL_SELECT' && (
        <SkillSelectModal
          heroKey={selectedHero}
          gameMode={gameMode}
          onConfirmSkills={(skills) => {
            setActiveSkills(skills);
            startBattle(selectedHero, skills, gameMode);
          }}
          onBack={() => setGameState('CHARACTER_SELECT')}
        />
      )}

      {/* Active Combat HUD */}
      {isInArenaView && (
        <GameHud
          player={playerStats}
          combatStats={combatStats}
          activeSkills={activeSkills}
          heroName={activeHeroConfig.name}
          heroColor={activeHeroConfig.color}
          boss={bossState}
          autoPilot={autoPilot}
          autoCastSkills={autoCastSkills}
          isMuted={isMuted}
          onToggleAutoPilot={() => {
            const next = !autoPilot;
            setAutoPilot(next);
            if (engineRef.current) engineRef.current.autoPilot = next;
          }}
          onToggleAutoCast={() => {
            const next = !autoCastSkills;
            setAutoCastSkills(next);
            if (engineRef.current) engineRef.current.autoCastSkills = next;
          }}
          onToggleMute={handleToggleMute}
          onPause={() => {
            if (engineRef.current) {
              engineRef.current.isPaused = true;
              setIsSimPaused(true);
            }
            setGameState('PAUSED');
          }}
          onTriggerSkill={(idx) => {
            const engine = engineRef.current;
            if (!engine || engine.isPaused || engine.isGameOver) return;
            if (idx >= 0 && idx < engine.activeSkills.length && !engine.activeSkills[idx]?.lockedUnique && engine.player.skillCDs[idx] <= 0) {
              const target = engine.getClosestEnemy(engine.playerPos.x, engine.playerPos.y);
              engine.useSkill(idx, target);
            }
          }}
        />
      )}

      {/* Practice Lab Controls */}
      {gameState === 'PLAYING' && gameMode === 'practice' && engineRef.current && (
        <PracticeLabPanel
          heroKey={selectedHero}
          player={playerStats}
          combatStats={combatStats}
          activeSkills={activeSkills}
          attributeCounts={practiceAttributeCounts}
          unlockedTraits={practiceUnlockedTraits}
          practiceWave={practiceWave}
          godMode={practiceGodMode}
          autoHealDummy={practiceAutoHealDummy}
          isSimPaused={isSimPaused}
          onToggleSimPause={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.isPaused = !engine.isPaused;
            setIsSimPaused(engine.isPaused);
          }}
          onToggleRelic={(attrId) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.togglePracticeRelic(attrId);
            syncEngineSnapshots(engine);
          }}
          onSetRelicCount={(attrId, count) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.setPracticeRelicCount(attrId, count);
            syncEngineSnapshots(engine);
          }}
          onClearRelics={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.clearPracticeRelics();
            syncEngineSnapshots(engine);
          }}
          onToggleTrait={(traitId) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.togglePracticeTrait(traitId);
            syncEngineSnapshots(engine);
          }}
          onSwitchHero={(newHeroKey) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.switchHeroInPractice(newHeroKey);
            syncEngineSnapshots(engine);
          }}
          onSetWave={(wave) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.setPracticeWaveLevel(wave);
            syncEngineSnapshots(engine);
          }}
          onSpawnDummy={(kind, resistPreset) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.spawnPracticeDummy(kind, undefined, undefined, resistPreset);
            syncEngineSnapshots(engine);
          }}
          onSpawnSwarm={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.spawnPracticeSwarm(5);
            syncEngineSnapshots(engine);
          }}
          onSpawnSkilledMobs={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.spawnPracticeSkilledMobs();
            syncEngineSnapshots(engine);
          }}
          onSpawnBoss={(type, corruptedHeroKey) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.spawnPracticeBoss(type, corruptedHeroKey);
            syncEngineSnapshots(engine);
          }}
          onClearEnemies={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.clearPracticeEnemies();
            syncEngineSnapshots(engine);
          }}
          onResetMetrics={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.resetPracticeMetrics();
            syncEngineSnapshots(engine);
          }}
          onResetCooldowns={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.resetPracticeCooldowns();
            syncEngineSnapshots(engine);
          }}
          onFullHeal={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.fullHealPractice();
            syncEngineSnapshots(engine);
          }}
          onGrantLevel={(levels) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.grantPracticeLevel(levels);
            syncEngineSnapshots(engine);
          }}
          onToggleGodMode={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.practiceGodMode = !engine.practiceGodMode;
            setPracticeGodMode(engine.practiceGodMode);
          }}
          onToggleAutoHealDummy={() => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.practiceAutoHealDummy = !engine.practiceAutoHealDummy;
            setPracticeAutoHealDummy(engine.practiceAutoHealDummy);
          }}
        />
      )}

      {/* Level Up Modal */}
      {gameState === 'LEVEL_UP' && engineRef.current && (
        <LevelUpModal
          level={levelUpLevel}
          heroKey={selectedHero}
          activeSkillIds={activeSkills.map((s) => s.id)}
          unlockedTraits={new Set(engineRef.current.unlockedTraits)}
          acquiredAttributes={new Set(engineRef.current.acquiredAttributes)}
          onConfirmUpgrade={(selectedTraitId, selectedAttrId) => {
            const engine = engineRef.current;
            if (!engine) return;
            if (selectedTraitId) {
              engine.applySkillUpgrade(selectedTraitId);
            }
            engine.applyAttribute(selectedAttrId);
            engine.isPaused = false;
            syncEngineSnapshots(engine);
            setGameState('PLAYING');
          }}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'PAUSED' && (
        <PauseModal
          onResume={() => {
            if (engineRef.current) {
              engineRef.current.isPaused = false;
              setIsSimPaused(false);
            }
            setGameState('PLAYING');
          }}
          onRestart={() => {
            if (engineRef.current) {
              engineRef.current.restart();
              syncEngineSnapshots(engineRef.current);
              setBossState(null);
            }
            setGameState('PLAYING');
          }}
          onQuitToTitle={() => {
            destroyEngine();
            setBossState(null);
            setGameState('TITLE');
          }}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          isPracticeMode={gameMode === 'practice'}
        />
      )}

      {/* Game Over Modal */}
      {gameState === 'GAME_OVER' && (
        <GameOverModal
          stats={finalStats}
          heroName={activeHeroConfig.name}
          onRestart={() => {
            if (engineRef.current) {
              engineRef.current.restart();
              syncEngineSnapshots(engineRef.current);
              setBossState(null);
            }
            setGameState('PLAYING');
          }}
          onSelectHero={() => {
            destroyEngine();
            setBossState(null);
            setGameState('CHARACTER_SELECT');
          }}
        />
      )}

      {/* Victory Modal */}
      {gameState === 'VICTORY' && (
        <VictoryModal
          stats={finalStats}
          heroName={activeHeroConfig.name}
          onContinueEndless={() => {
            if (engineRef.current) {
              engineRef.current.isPaused = false;
              setIsSimPaused(false);
            }
            setGameState('PLAYING');
          }}
          onRestart={() => {
            if (engineRef.current) {
              engineRef.current.restart();
              syncEngineSnapshots(engineRef.current);
              setBossState(null);
            }
            setGameState('PLAYING');
          }}
          onSelectHero={() => {
            destroyEngine();
            setBossState(null);
            setGameState('CHARACTER_SELECT');
          }}
        />
      )}
    </div>
  );
}
